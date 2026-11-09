import test from 'node:test';
import assert from 'node:assert/strict';
import { editAndSend, editTarget, messageText, replaceText } from '../lib/core.js';
import { apply } from '../lib/index.js';

const image = { type: 'image', attachment: { attachmentId: 'sha256:abc', name: 'sample.webp', bytes: 10, width: 5, height: 2, mediaType: 'image/webp' } };
const file = { type: 'file', attachment: { attachmentId: 'sha256:def', name: 'notes.txt', bytes: 42 } };
const request = { action: 'edit', requestId: 'test-edit-0001', seq: 9, originalText: '旧问题', text: '新问题' };
const user = (id, text, attachments = []) => ({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }, ...attachments] });

function environment(options = {}) {
  const events = [
    { type: 'system/message', data: { message: { id: 'system', role: 'system', content: [{ type: 'text', text: 'system' }] } } },
    { type: 'turn/start', data: { turn: 1 } }, { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: user('prefix', '保留的问题') },
    { type: 'assistant/message', data: { message: { id: 'prefix-answer', role: 'assistant', content: [{ type: 'text', text: '保留的回复' }] } } },
    { type: 'step/end', data: { turn: 1, step: 1 } }, { type: 'turn/end', data: { turn: 1 } },
    { type: 'turn/start', data: { turn: 2 } }, { type: 'step/start', data: { turn: 2, step: 1 } },
    { type: 'user/message', data: user('target', '旧问题', [image, file]) },
    { type: 'assistant/message', data: { message: { id: 'old-answer', role: 'assistant', content: [{ type: 'text', text: '旧回复' }] } } },
    { type: 'step/end', data: { turn: 2, step: 1 } }, { type: 'turn/end', data: { turn: 2 } },
    { type: 'turn/start', data: { turn: 3 } }, { type: 'step/start', data: { turn: 3, step: 1 } },
    { type: 'user/message', data: user('later', '下面的问题') },
    { type: 'assistant/message', data: { message: { id: 'later-answer', role: 'assistant', content: [{ type: 'text', text: '下面的回复' }] } } },
    { type: 'step/end', data: { turn: 3, step: 1 } }, { type: 'turn/end', data: { turn: 3 } },
  ].map((event, seq) => ({ ...event, seq }));
  const nodes = [0, 3, 4, 9, 10, 15, 16];
  const calls = [];
  const pending = [];
  let maintenance = false, flushes = 0;
  const source = {
    id: 'source', surface: { nodes }, eventAt: seq => events[seq], snapshotEvents: () => [...events],
    append(type, data, intent) {
      if (options.appendFailure) throw new Error('append refused');
      assert.equal(type, 'developer/message'); assert.equal(data.message.role, 'developer');
      assert.deepEqual(data.message.content, []); assert.equal(data.turn, 3); assert.equal(data.step, 1);
      assert.deepEqual(intent.sourceEventSeqs, nodes.slice(nodes.indexOf(intent.surfaceOp.startSeq)));
      const at = nodes.indexOf(intent.surfaceOp.startSeq);
      assert.ok(at >= 0); assert.equal(intent.surfaceOp.endSeq, nodes.at(-1));
      const marker = { type, data, seq: events.length, ...intent };
      events.push(marker); nodes.splice(at, nodes.length - at, marker.seq);
      calls.push(['replace', marker]); return marker;
    },
    deriveMessages: () => nodes.map(seq => events[seq].type === 'user/message' ? events[seq].data : events[seq].data.message).filter(message => message.content.length),
  };
  const agent = {
    id: 'source', session: source,
    inbox: { clear: () => { calls.push('clear'); pending.length = 0; } },
    async runMaintenance(task) {
      if (maintenance || options.maintenanceBusy) throw new Error('maintenance busy');
      maintenance = true;
      try { return await task(new AbortController().signal); }
      finally {
        maintenance = false;
        for (const message of pending.splice(0)) {
          const event = { type: 'user/message', data: message, seq: events.length };
          events.push(event); nodes.push(event.seq);
        }
      }
    },
    followup(message) {
      assert.ok(maintenance); assert.equal(message.role, 'user'); assert.match(message.id, /^[0-9a-f-]{36}$/);
      calls.push(['followup', message]); if (options.sendFailure) throw new Error('send refused'); pending.push(message);
    },
  };
  const deps = {
    sessions: { get: id => id === 'source' ? source : undefined, flush: async session => {
      assert.equal(session, source); calls.push('flush'); flushes++;
      if (options.flushFailureAt === flushes) throw new Error('disk full'); return true;
    } },
    agents: { get: id => id === 'source' ? agent : undefined, turnBoundaryOf: () => ({ lastTurn: 3, lastStepStartSeq: 14 }) },
    controller: { state: async () => ({ running: !!options.running }), fork: () => { throw new Error('Editing must never fork'); } },
  };
  return { deps, source, agent, calls, events };
}

test('text replacement retains the exact attachment values and original block order', () => {
  const content = [image, { type: 'text', text: 'one' }, file, { type: 'text', text: 'two' }];
  const before = structuredClone(content);
  assert.deepEqual(replaceText(content, 'changed'), [image, { type: 'text', text: 'changed' }, file]);
  assert.deepEqual(content, before);
  assert.deepEqual(replaceText([image], 'caption'), [image, { type: 'text', text: 'caption' }]);
  assert.throws(() => replaceText([{ type: 'text', text: 'old' }], '   '), /empty/);
  assert.throws(() => replaceText([{ type: 'tool-call', id: 't' }], 'changed'), /Unsupported/);
});

test('stale text, already removed messages and injected context are refused', () => {
  const { source, events } = environment();
  assert.throws(() => editTarget(source, { ...request, originalText: 'stale' }), /Original text changed/);
  source.surface.nodes.splice(source.surface.nodes.indexOf(9), 1);
  assert.throws(() => editTarget(source, request), /no longer editable/);
  source.surface.nodes.push(9); events[9].data.source.kind = 'system';
  assert.throws(() => editTarget(source, request), /no longer editable/);
});

test('a middle edit keeps the same session, preserves the prefix and removes the entire suffix from model history', async () => {
  const { deps, calls, events, source } = environment();
  const original = structuredClone(events);
  const result = await editAndSend(deps, 'source', request);
  assert.equal(result.sessionId, 'source'); assert.equal(result.markerSeq, 19); assert.equal(result.attachmentCount, 2);
  assert.deepEqual(result.cut, { from: 9, to: 19, fromTurn: 2, lastTurn: 3, keepFirstTurn: false });
  assert.deepEqual(source.deriveMessages().map(message => messageText(message.content)), ['system', '保留的问题', '保留的回复', '新问题']);
  assert.deepEqual(source.deriveMessages().at(-1).content.slice(1), [image, file]);
  assert.deepEqual(events.slice(0, original.length), original);
  assert.equal(calls.filter(call => call[0] === 'followup').length, 1);
});

test('editing the first prompt removes every later message and keeps the initial system prompt', async () => {
  const fixture = environment();
  await editAndSend(fixture.deps, 'source', { ...request, seq: 3, originalText: '保留的问题', text: '第一条新问题' });
  assert.deepEqual(fixture.source.deriveMessages().map(message => messageText(message.content)), ['system', '第一条新问题']);
});

test('sending unchanged text still discards later history and regenerates once', async () => {
  const fixture = environment();
  await editAndSend(fixture.deps, 'source', { ...request, text: request.originalText });
  assert.deepEqual(fixture.source.deriveMessages().map(message => messageText(message.content)), ['system', '保留的问题', '保留的回复', '旧问题']);
  assert.equal(fixture.calls.filter(call => call[0] === 'followup').length, 1);
});

test('editing a steering message preserves earlier input in that same turn', async () => {
  const fixture = environment();
  fixture.events[10] = { type: 'user/message', seq: 10, data: user('steer', '插话') };
  const result = await editAndSend(fixture.deps, 'source', { ...request, seq: 10, originalText: '插话', text: '新插话' });
  assert.equal(result.cut.keepFirstTurn, true); assert.equal(result.cut.fromTurn, 2);
  assert.deepEqual(fixture.source.deriveMessages().map(message => messageText(message.content)), ['system', '保留的问题', '保留的回复', '旧问题', '新插话']);
});

test('editing steering after automatic input preserves preceding assistant content without restoring the deleted prompt preview', async () => {
  const fixture = environment();
  fixture.events[9] = { type: 'assistant/message', seq: 9, data: { message: { id: 'automated-reply', role: 'assistant', content: [{ type: 'text', text: '自动回合里之前的回复' }] } } };
  fixture.events[10] = { type: 'user/message', seq: 10, data: user('steer', '待修改的插话') };
  const result = await editAndSend(fixture.deps, 'source', { ...request, seq: 10, originalText: '待修改的插话', text: '新插话' });
  assert.equal(result.cut.keepFirstTurn, true); assert.equal(result.cut.keptPrompt, '');
  assert.deepEqual(fixture.source.deriveMessages().map(message => messageText(message.content)), ['system', '保留的问题', '保留的回复', '自动回合里之前的回复', '新插话']);
});

test('busy, canceled, missing, stale and append-rejected operations do not change history', async () => {
  for (const options of [{ running: true }, { maintenanceBusy: true }, { appendFailure: true }]) {
    const fixture = environment(options), before = structuredClone(fixture.events);
    await assert.rejects(editAndSend(fixture.deps, 'source', request));
    assert.deepEqual(fixture.events, before); assert.deepEqual(fixture.calls, []);
  }
  const fixture = environment();
  await assert.rejects(editAndSend(fixture.deps, 'missing', request), /Open the conversation/);
  await assert.rejects(editAndSend(fixture.deps, 'source', request, AbortSignal.abort()), /abort/i);
  assert.deepEqual(fixture.calls, []);
});

for (const options of [{ sendFailure: true }, { flushFailureAt: 1 }, { flushFailureAt: 2 }]) {
  test(`a post-cut failure reports the committed cut and whether the new prompt was accepted: ${JSON.stringify(options)}`, async () => {
    const fixture = environment(options);
    const result = await editAndSend(fixture.deps, 'source', request);
    assert.equal(result.sessionId, 'source'); assert.equal(result.historyChanged, true);
    assert.equal(typeof result.error, 'string'); assert.equal(result.markerSeq, 19);
    assert.equal(result.accepted, options.flushFailureAt === 2);
    assert.ok(!fixture.source.deriveMessages().some(message => message.id === 'old-answer'));
  });
}

function mountedPlugin(options) {
  const fixture = environment(options), cleanup = [], services = new Map(), definitions = new Map();
  const ctx = {
    sessions: fixture.deps.sessions, agents: fixture.deps.agents, sessionController: fixture.deps.controller,
    effect: factory => { const dispose = factory(); cleanup.push(dispose); return dispose; },
    provide: (name, service) => { services.set(name, service); cleanup.push(() => services.delete(name)); },
    commands: {
      register: definition => { definitions.set('command', definition); cleanup.push(() => definitions.delete('command')); },
      execute: async (agent, line, _attachments, signal) => ({ result: await definitions.get('command').handler({ agent, rawInput: line.slice('/message-edit '.length), signal }) }),
    },
    tools: { register: definition => { definitions.set('tool', definition); cleanup.push(() => definitions.delete('tool')); } },
  };
  apply(ctx);
  return { ...fixture, services, definitions, dispose: () => cleanup.reverse().forEach(dispose => dispose()) };
}

test('UI and agent edit calls share an idempotent operation and record the cut marker for Chat', async () => {
  const fixture = mountedPlugin();
  const invocation = { agent: fixture.agent, rawInput: JSON.stringify(request), signal: new AbortController().signal };
  const [uiResult, toolResult] = await Promise.all([
    fixture.definitions.get('command').handler(invocation),
    fixture.definitions.get('tool').execute({ ...request, sessionId: 'source' }, { agent: invocation.agent, signal: invocation.signal }),
  ]);
  assert.equal(uiResult.kind, 'success'); assert.equal(uiResult.sourceEventSeq, 19);
  assert.deepEqual(JSON.parse(uiResult.text), toolResult);
  assert.equal(fixture.calls.filter(call => call[0] === 'replace').length, 1);
  await assert.rejects(fixture.services.get('messagePencil').operate('source', { ...request, text: 'different' }), /already used/);
  fixture.dispose(); assert.equal(fixture.services.size, 0); assert.equal(fixture.definitions.size, 0);
});

test('command errors are visible and agent edits require a specified idle source', async () => {
  const fixture = mountedPlugin({ running: true });
  const result = await fixture.definitions.get('command').handler({ agent: fixture.agent, rawInput: JSON.stringify(request) });
  assert.equal(result.kind, 'error'); assert.match(result.text, /stop generation/);
  await assert.rejects(fixture.definitions.get('tool').execute(request, { agent: fixture.agent }), /Specify another idle/);
  assert.deepEqual(fixture.calls, []); fixture.dispose();
});

test('listing includes only currently active human messages after an edit', async () => {
  const fixture = mountedPlugin();
  await fixture.services.get('messagePencil').operate('source', request);
  const result = await fixture.services.get('messagePencil').operate('source', { action: 'list' });
  assert.deepEqual(result.messages.map(message => message.text), ['保留的问题', '新问题']);
  assert.equal(result.messages.at(-1).attachmentCount, 2);
  fixture.dispose();
});

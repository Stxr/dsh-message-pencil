'use strict';

// Optional macOS Desktop integration test. Build the plugin first, then run from the repo:
// ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" tests/installed-host-recovery.cjs
// Set MESSAGE_PENCIL_HOST_ENTRY to an absolute bundle path to check a different build.
const assert = require('node:assert/strict');
const { mkdtemp, readFile, realpath, rm } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { basename, dirname, isAbsolute, join, relative, resolve, sep } = require('node:path');
const { test } = require('node:test');

const desktopVersion = '0.2.2-rc.5';
const sessionId = 'message-pencil-installed-host';
const agentOptions = { provider: 'message-pencil-fixture', model: 'deterministic', maxTokens: 64 };
const file = { type: 'file', attachment: { attachmentId: `sha256:${'a'.repeat(64)}`, name: 'fixture.txt', bytes: 12 } };
const textBlock = text => ({ type: 'text', text });
const messageText = message => message.content.filter(block => block.type === 'text').map(block => block.text).join('');
const replyText = text => `Acknowledged: ${text}`;

function installedRuntime() {
  assert.ok(process.versions.electron, 'Run with ELECTRON_RUN_AS_NODE=1 and the Desktop Electron executable.');
  const cliDir = process.env.DSH_INSTALL_DIR ?? resolve(dirname(process.execPath),
    '../Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh');
  const requireHost = createRequire(join(cliDir, 'package.json'));
  const desktop = requireHost('../../../package.json');
  assert.equal(desktop.name, '@deepseek-ai/dsh-desktop-runtime');
  assert.equal(desktop.version, desktopVersion);
  return requireHost;
}

async function startHost(requireHost, root, plugin) {
  const { Context } = requireHost('@deepseek-ai/cordis');
  const ctx = new Context();
  try {
    for (const name of ['session', 'session-projection', 'agent', 'llm', 'system-prompt',
      'tools', 'tool-executor-native', 'commands', 'agent-loop']) {
      const hostModule = requireHost(`@deepseek-ai/dsh-${name}`);
      await ctx.plugin(hostModule.default ?? hostModule).await();
    }
    await ctx.plugin(requireHost('@deepseek-ai/dsh-session-persistence-jsonl'), { root, compression: 'none' }).await();
    // The plugin only needs state(). A Web/RPC controller would require the rest of the Desktop profile.
    ctx.provide('sessionController', {
      async state({ sessionId: id }, signal) {
        signal.throwIfAborted();
        const agent = ctx.agents.get(id);
        assert.ok(agent, `Expected a live agent for ${id}`);
        return { running: agent.status === 'running' };
      },
    });
    await ctx.plugin(plugin).await();

    const requests = [];
    ctx.on('llm/stream', async function* (request) {
      const { sessionId: id, provider, model, maxTokens, messages } = request;
      requests.push(structuredClone({ sessionId: id, provider, model, maxTokens, messages }));
      const block = textBlock(replyText(messageText(messages.at(-1))));
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: block.text };
      yield { type: 'block-end', index: 0, block };
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    return { ctx, requests, close: () => ctx.fiber.dispose() };
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}

async function finishTurn(agent) {
  await agent.whenIdle();
  const ended = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end');
  assert.equal(ended?.data.reason.kind, 'completed', JSON.stringify(ended?.data.reason));
  return ended.data.turn;
}

async function send(agent, id, text, attachments = []) {
  agent.followup({ id, role: 'user', source: { kind: 'user' }, content: [textBlock(text), ...attachments] });
  return finishTurn(agent);
}

function humanEvent(session, text) {
  const event = session.surface.nodes.map(seq => session.eventAt(seq))
    .findLast(candidate => candidate.type === 'user/message' && messageText(candidate.data) === text);
  assert.ok(event, `Expected a visible user message for ${text}`);
  return event;
}

async function edit(host, agent, beforeText, text, ordinal) {
  const target = humanEvent(agent.session, beforeText);
  const cutNodes = agent.session.surface.nodes.slice(agent.session.surface.nodes.indexOf(target.seq));
  const request = { action: 'edit', seq: target.seq, originalText: beforeText, text, requestId: `host-edit-${ordinal}` };
  const execution = await host.ctx.commands.execute(agent, `/message-edit ${JSON.stringify(request)}`, [], AbortSignal.timeout(5000));
  assert.equal(execution?.result.kind, 'success', execution?.result.text ?? 'The plugin command is missing');
  const result = JSON.parse(execution.result.text);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.sessionId, sessionId);
  assert.equal(result.editedSeq, target.seq);
  assert.equal(result.markerSeq, execution.result.sourceEventSeq);
  assert.equal(result.attachmentCount, 1);
  const turn = await finishTurn(agent);
  assert.equal(host.ctx.agents.get(sessionId), agent);
  assert.equal(host.ctx.sessions.get(sessionId), agent.session);
  assert.ok(!agent.session.surface.nodes.includes(target.seq));
  const marker = agent.session.eventAt(result.markerSeq);
  assert.equal(marker.type, 'developer/message');
  assert.deepEqual(marker.data.message.content, []);
  assert.deepEqual(marker.surfaceOp, { op: 'replace', startSeq: cutNodes[0], endSeq: cutNodes.at(-1) });
  assert.deepEqual(marker.sourceEventSeqs, cutNodes);
  return { marker, turn, replacement: humanEvent(agent.session, text), commandId: execution.commandId };
}

function assertModelPayload(request, prefix, replacement, expectedText) {
  const { messages, ...route } = request;
  assert.deepEqual(route, { sessionId, ...agentOptions });
  assert.equal(messages[0].role, 'system');
  assert.deepEqual(messages.slice(1, -1), prefix);
  assert.deepEqual(messages.at(-1), replacement.data);
  assert.deepEqual(messages.at(-1).content, [textBlock(expectedText), file]);
}

async function restoreFromDisk(requireHost, host, root) {
  const { sessionFormatCatalog } = requireHost('@deepseek-ai/dsh-session-format-catalog');
  assert.equal(sessionFormatCatalog.currentVersion, 4);
  const stored = await host.ctx.sessionPersistence.stat(sessionId);
  assert.equal(stored?.formatStatus, 'current');
  assert.equal(stored.location.kind, 'jsonl');
  const artifactPath = await realpath(stored.location.path);
  const pathWithinRoot = relative(root, artifactPath);
  assert.ok(pathWithinRoot && !isAbsolute(pathWithinRoot) && pathWithinRoot.split(sep)[0] !== '..');
  const [header, ...rows] = (await readFile(artifactPath, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
  const restore = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' });
  for (const row of rows) restore.decodeRow(row);
  return restore.finish();
}

function assertMarkerPlacement(events, { marker, turn, replacement, commandId }) {
  assert.equal(marker.data.turn, turn);
  const { step } = marker.data;
  const opened = events.find(event => event.type === 'step/start' && event.data.turn === turn && event.data.step === step);
  const closed = events.find(event => event.type === 'step/end' && event.data.turn === turn && event.data.step === step);
  assert.ok(opened.seq < marker.seq && marker.seq < replacement.seq && replacement.seq < closed.seq,
    `Expected marker ${marker.seq} and input ${replacement.seq} in open turn ${turn}, step ${step}`);
  const done = events.find(event => event.type === 'command/done' && event.data.commandId === commandId);
  assert.equal(done?.data.sourceEventSeq, marker.seq);
}

test('Desktop rc.5 reopens a v4 session after repeated message edits', { timeout: 15_000 }, async t => {
  const requireHost = installedRuntime();
  const plugin = require(process.env.MESSAGE_PENCIL_HOST_ENTRY ?? '../lib/index.js');
  const tempParent = await realpath(tmpdir());
  const root = await mkdtemp(join(tempParent, 'dsh-message-pencil-host-'));
  let host;
  try {
    host = await startHost(requireHost, root, plugin);
    const original = await host.ctx.agentLoop.createAgent(host.ctx, { sessionId, agentOptions });
    const { agent } = original;
    await send(agent, 'prefix-user', 'Keep this prompt');
    const prefix = structuredClone(agent.session.deriveMessages().slice(1));
    assert.deepEqual(prefix.map(message => [message.role, messageText(message)]), [
      ['user', 'Keep this prompt'], ['assistant', replyText('Keep this prompt')],
    ]);
    await send(agent, 'target-user', 'Original text', [file]);
    await send(agent, 'suffix-user', 'Discard this follow-up');
    const originalEvents = structuredClone(agent.session.snapshotEvents());

    const first = await edit(host, agent, 'Original text', 'First revision', 1);
    const second = await edit(host, agent, 'First revision', 'Second revision', 2);
    assert.equal(host.requests.length, 5);
    assertModelPayload(host.requests[3], prefix, first.replacement, 'First revision');
    assertModelPayload(host.requests[4], prefix, second.replacement, 'Second revision');
    const finalEvents = structuredClone(agent.session.snapshotEvents());
    const finalMessages = structuredClone(agent.session.deriveMessages());
    assert.deepEqual(finalEvents.slice(0, originalEvents.length), originalEvents);
    assert.equal(await host.ctx.sessions.flush(agent.session), true);
    await original.dispose();
    await host.close();
    host = undefined;

    host = await startHost(requireHost, root, plugin);
    const artifact = await restoreFromDisk(requireHost, host, root);
    assert.equal(artifact.header.version, 4);
    assert.equal(artifact.header.id, sessionId);
    assert.equal(artifact.inheritedEventCount, 0);
    assert.deepEqual(artifact.events, finalEvents);
    assertMarkerPlacement(artifact.events, first);
    assertMarkerPlacement(artifact.events, second);

    const reopened = await host.ctx.agentLoop.resume(host.ctx, { resumeSessionId: sessionId, agentOptions });
    assert.equal(reopened.agent.id, sessionId);
    const reopenedEvents = reopened.agent.session.snapshotEvents();
    assert.deepEqual(reopenedEvents.slice(0, finalEvents.length), finalEvents);
    // AgentLoop closes the resumed seed; completed turns need no repair records.
    assert.deepEqual(reopenedEvents.slice(finalEvents.length).map(({ type, data }) => ({ type, data })), [
      { type: 'session/end-seed', data: {} },
    ]);
    assert.deepEqual(reopened.agent.session.deriveMessages(), finalMessages);
    await send(reopened.agent, 'resume-user', 'Second revision');
    assert.equal(host.requests.length, 1);
    assert.deepEqual(host.requests[0].messages.slice(0, -1), finalMessages);
    assert.equal(host.requests[0].messages.at(-1).id, 'resume-user');
    assert.equal(reopened.agent.session.surface.replaceGeneration, 2);
    await reopened.dispose();
    t.diagnostic(`Desktop ${desktopVersion}, Electron ${process.versions.electron}, v4 markers at ${first.marker.seq} and ${second.marker.seq}`);
  } finally {
    try {
      await host?.close();
    } finally {
      // Resolve and verify the exact temporary directory before recursive cleanup.
      const cleanupPath = await realpath(root);
      assert.equal(cleanupPath, root);
      assert.equal(dirname(cleanupPath), tempParent);
      assert.ok(basename(cleanupPath).startsWith('dsh-message-pencil-host-'));
      await rm(cleanupPath, { recursive: true, force: true });
    }
  }
});

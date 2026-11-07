import test from 'node:test';
import assert from 'node:assert/strict';
import { foldSurface, deriveEventMessage } from '../../deepseek-harness-latest/packages/core/session/src/surface.ts';
import { ChatSnapshotBuilder } from '../../deepseek-harness-latest/packages/client/ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts';
import { EditVisibilityBuilder, filterOutline, decorateChatDefinition } from '../visibility.js';

const cut = { from: 9, to: 21, fromTurn: 2, lastTurn: 3, keepFirstTurn: false };
const unit = { get: () => undefined };
const turns = [1, 2, 3, 4].map(turn => ({ turn, status: 'closed', start: { seq: turn * 7 - 6, time: turn, data: { turn } }, end: { seq: turn * 7, time: turn, data: { turn, reason: { kind: 'completed' } } }, steps: [], data: unit }));
const timeline = { turnOrder: [1, 2, 3, 4], turns: new Map(turns.map(turn => [turn.turn, turn])) };
function node(kind, seq, turn, data) {
  const step = { turn, step: 1, status: 'closed', data: unit };
  return { key: `${kind}:${seq}`, id: String(seq), target: 'chat', kind, anchorSeq: seq, visibility: 'visible', location: { kind: 'step', turn: turns[turn - 1], step }, data: { ...data, seq, turn, step: 1 } };
}
function prompt(seq, turn, text) { return node('user', seq, turn, { kind: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }); }
function reply(seq, turn, text) { return node('assistant-step', seq, turn, { status: 'final', blocks: [{ kind: 'text', text }], finalNode: { kind: 'assistant', seq, turn, content: text } }); }
function command(seq, outcome, cutValue = cut) { return node('command', seq, 3, { name: 'message-edit', args: JSON.stringify({ action: 'edit', seq: cutValue.from }), outcome: outcome ? { kind: 'success', sourceEventSeq: cutValue.to, text: JSON.stringify({ sessionId: 'source', editedSeq: cutValue.from, markerSeq: cutValue.to, cut: cutValue }) } : null }); }
const originals = [prompt(3, 1, '保留的问题'), reply(4, 1, '保留的回复'), prompt(9, 2, '旧问题'), reply(10, 2, '旧回复'), prompt(15, 3, '后续问题'), reply(16, 3, '后续回复')];

test('real Session surface replay removes the old suffix and empty developer markers produce no model input', () => {
  const user = (seq, text) => ({ seq, type: 'user/message', surfaceOp: 'append', data: { id: String(seq), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } });
  const events = [user(0, 'prefix'), user(1, 'old question'), user(2, 'old answer'), user(3, 'later question')];
  events.push({ seq: 4, type: 'developer/message', surfaceOp: { op: 'replace', startSeq: 1, endSeq: 3 }, sourceEventSeqs: [1, 2, 3], data: { turn: 3, step: 1, message: { id: 'cut', role: 'developer', content: [], source: { kind: 'user' } } } });
  events.push(user(5, 'edited question'));
  const replay = () => foldSurface(JSON.parse(JSON.stringify(events)));
  assert.deepEqual(replay().nodes, [0, 4, 5]);
  assert.equal(deriveEventMessage(events[4]), null);
  assert.deepEqual(replay().nodes.map(seq => deriveEventMessage(events[seq])).filter(Boolean).map(message => message.content[0].text), ['prefix', 'edited question']);
  events.push({ seq: 6, type: 'developer/message', surfaceOp: { op: 'replace', startSeq: 5, endSeq: 5 }, sourceEventSeqs: [5], data: { turn: 4, step: 1, message: { id: 'second-cut', role: 'developer', content: [], source: { kind: 'user' } } } });
  events.push(user(7, 'edited again'));
  assert.deepEqual(replay().nodes, [0, 4, 6, 7]);
});

test('native Chat builder removes the old messages, replies, groups, navigation and compatibility rows together', () => {
  const builder = new EditVisibilityBuilder(new ChatSnapshotBuilder());
  assert.equal(builder.empty, builder.empty);
  const before = builder.replace({ nodes: [...originals, command(20, false)], timeline });
  assert.ok(before.order.includes('user:9'));
  let after = builder.apply({ upserts: [command(20, true)], timeline });
  assert.deepEqual(after.order, ['user:3', 'assistant-step:4']);
  assert.deepEqual(after.locations.getTurn(2), []); assert.deepEqual(after.locations.getTurn(3), []);
  assert.deepEqual(after.navigation.items().map(item => item.turn), [1]);
  assert.deepEqual(builder.groupInput().order, ['user:3', 'assistant-step:4']);
  assert.deepEqual(after.legacy.nodes.map(row => row.seq), [3, 4]);
  const old = after.nodes.get('user:9'); assert.equal(old.visibility, 'hidden');
  after = builder.apply({ upserts: [prompt(23, 4, '新问题'), reply(24, 4, '新回复')], timeline });
  assert.deepEqual(after.order, ['user:3', 'assistant-step:4', 'user:23', 'assistant-step:24']);
  assert.deepEqual(after.navigation.items().map(item => item.prompt), ['保留的问题', '新问题']);
  builder.publish();
  const replay = new EditVisibilityBuilder(new ChatSnapshotBuilder()).replace({ nodes: [...originals, command(20, true), prompt(23, 4, '新问题'), reply(24, 4, '新回复')], timeline });
  assert.deepEqual(replay.order, after.order);
});

test('whole-log outline filtering removes unloaded old turns and clears a removed response within a retained turn', () => {
  const outline = [1, 2, 3, 4].map(turn => ({ turn, prompt: `prompt-${turn}`, response: `reply-${turn}` }));
  assert.deepEqual(filterOutline(outline, [cut]).map(item => item.turn), [1, 4]);
  const result = filterOutline(outline, [{ ...cut, keepFirstTurn: true }]);
  assert.deepEqual(result.map(item => item.turn), [1, 2, 4]); assert.equal(result[1].response, '');
  assert.equal(result[1].prompt, '');
  assert.equal(filterOutline(outline, [{ ...cut, keepFirstTurn: true, keptPrompt: 'earlier prompt' }])[1].prompt, 'earlier prompt');
});

test('a failure after truncation keeps the cut active and the native error command visible', () => {
  const failure = command(20, true);
  const result = JSON.parse(failure.data.outcome.text); result.error = 'disk full';
  failure.data.outcome.text = JSON.stringify(result);
  const after = new EditVisibilityBuilder(new ChatSnapshotBuilder()).replace({ nodes: [...originals, failure], timeline });
  assert.ok(after.order.includes('command:20')); assert.ok(!after.order.includes('user:9'));
});

test('factory decoration retains native grouping and restores the exact original definition on unload', () => {
  const original = () => new ChatSnapshotBuilder(), definition = { target: 'chat', create: original };
  const restore = decorateChatDefinition(definition);
  assert.ok(definition.create() instanceof EditVisibilityBuilder);
  restore(); assert.equal(definition.create, original);
  assert.throws(() => new EditVisibilityBuilder({}), /Unsupported Chat builder/);
});

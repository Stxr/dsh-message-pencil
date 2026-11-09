import test from 'node:test';
import assert from 'node:assert/strict';
import { installEditVisibility } from '../lib/visibility.js';

function fixture({ failRebuild = false } = {}) {
  const effects = [], rebuilt = [], retained = new Set(['open']);
  const original = () => ({}), component = () => null;
  const definition = { target: 'chat', create: original };
  const entry = { options: { id: 'chat' }, component };
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ ids: ['closed', 'open'] }) }, binding: id => retained.has(id) ? { sessionId: id } : undefined },
    uiConversation: {
      views: { entries: () => [definition], subscribe: () => () => {} },
      binding(id) {
        assert.ok(retained.has(id), `must not create a Conversation binding for the unretained Session ${id}`);
        return { rebuild() { if (failRebuild) { failRebuild = false; throw new Error('rebuild failed'); } rebuilt.push(id); } };
      },
    },
    slots: { entries: () => [entry] },
    on: () => () => {}, effect: execute => { const dispose = execute(); effects.push(dispose); return dispose; },
  };
  return { ctx, effects, rebuilt, retained, definition, entry, original, component, dispose: () => effects.reverse().forEach(dispose => dispose()) };
}

test('loading with a populated desktop sidebar rebuilds only Sessions with retained bindings', () => {
  const f = fixture();
  assert.doesNotThrow(() => installEditVisibility(f.ctx, {}));
  assert.deepEqual(f.rebuilt, ['open']);
  f.dispose();
  assert.deepEqual(f.rebuilt, ['open', 'open']);
  assert.equal(f.definition.create, f.original); assert.equal(f.entry.component, f.component);
});

test('a Session released before a scheduled rebuild is not reopened', async () => {
  const f = fixture(), remember = installEditVisibility(f.ctx, {});
  remember('closed'); remember('open'); f.retained.clear();
  await new Promise(resolve => queueMicrotask(resolve));
  assert.deepEqual(f.rebuilt, ['open']);
  assert.doesNotThrow(() => f.dispose());
});

test('failed startup owns its patches early enough for fiber rollback to restore native Chat', () => {
  const f = fixture({ failRebuild: true });
  assert.throws(() => installEditVisibility(f.ctx, {}), /rebuild failed/);
  assert.equal(f.effects.length, 1);
  f.dispose();
  assert.equal(f.definition.create, f.original); assert.equal(f.entry.component, f.component);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Run the real, React-free registry from the inspected local DSH checkout.
// No component is rendered and no DOM or visual preview is emulated.
const sourceUrl = new URL('../../deepseek-harness-latest/packages/client/ui-slots/src/index.ts', import.meta.url);
const { SlotCore } = await import(sourceUrl.href);

function nativeTree() {
  const core = new SlotCore();
  core.register({ name: 'root', children: {
    'shell.overlay': { kind: 'list', scope: 'root' },
    'conversation.chat.node': { kind: 'keyed', scope: 'session' },
    'conversation.chat.commandview': { kind: 'keyed', scope: 'session' },
    'conversation.view': { kind: 'list', scope: 'session' },
  } }, () => null);
  core.register({ name: 'conversation.chat.node', key: 'user', registrant: 'native-user', children: {
    'conversation.chat.user.before': { kind: 'chain', scope: 'session' },
  } }, () => null);
  core.register({ name: 'conversation.chat.node', key: 'steering', registrant: 'native-steering' }, () => null);
  core.register({ name: 'conversation.view', id: 'chat', registrant: 'native-chat' }, () => null);
  return core;
}

test('the real registry rejects the old duplicate native-child declaration', () => {
  const core = nativeTree();
  assert.throws(() => core.register({
    name: 'conversation.chat.node', key: 'user', priority: -10,
    children: { 'conversation.chat.user.before': { kind: 'chain', scope: 'session' } },
  }, () => null), /already declared/);
});

test('the fixed browser plugin mounts both message renderers and restores native entries on unload', async () => {
  const core = nativeTree();
  let definition;
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { definition = value; } } } });
  const plugin = definition.factory(name => {
    assert.equal(name, 'react');
    return { createElement() { throw new Error('Registration tests must not render UI'); } };
  });
  const cleanup = [];
  const nativeComponent = core.entries('conversation.view')[0].component;
  const nativeCreate = () => ({});
  const chatDefinition = { target: 'chat', create: nativeCreate };
  const ctx = {
    uiConversation: { views: { entries: () => [chatDefinition], subscribe: () => () => {} }, binding: () => ({ rebuild() {} }) },
    sessions: { list: { getSnapshot: () => ({ ids: [] }) }, binding: () => undefined },
    on: () => () => {},
    effect: effect => { const dispose = effect(); cleanup.push(dispose); return dispose; },
    locale: { register: () => () => {} },
    slots: {
      entries: key => core.entries(key),
      register: (options, component) => {
        const dispose = core.register({ ...options, registrant: 'message-pencil' }, component);
        cleanup.push(dispose);
        return dispose;
      },
      inject: (key, callback) => {
        assert.ok(core.specDynamic(key));
        const result = callback();
        if (typeof result !== 'function') Array.from(result);
      },
    },
  };
  assert.doesNotThrow(() => plugin.apply(ctx));
  const active = core.entriesOfSlot('conversation.chat.node');
  assert.equal(active.find(entry => entry.options.key === 'user').registrant, 'message-pencil');
  assert.equal(active.find(entry => entry.options.key === 'steering').registrant, 'message-pencil');
  assert.equal(core.entriesOfSlot('shell.overlay')[0].options.id, 'message-pencil-styles');
  assert.ok(core.specDynamic('conversation.chat.user.before'));
  for (const dispose of cleanup.reverse()) dispose();
  assert.equal(core.entriesOfSlot('conversation.chat.node').find(entry => entry.options.key === 'user').registrant, 'native-user');
  assert.equal(core.entriesOfSlot('shell.overlay').length, 0);
  assert.equal(core.entries('conversation.view')[0].component, nativeComponent);
  assert.equal(chatDefinition.create, nativeCreate);
  assert.equal(core.entriesOfSlot('conversation.chat.commandview').length, 0);
  assert.ok(core.specDynamic('conversation.chat.user.before'));
});

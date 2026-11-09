import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const image = { type: 'image', attachment: { attachmentId: 'image-1', name: 'photo.webp' } };
const file = { type: 'file', attachment: { attachmentId: 'file-1', name: 'notes.txt' } };
const success = { sessionId: 'open', editedSeq: 9, markerSeq: 22,
  cut: { from: 9, to: 22, fromTurn: 2, lastTurn: 3, keepFirstTurn: false } };

/** Run the compiled ModuleLoader factory with real React; no source-module shortcuts. */
async function mount(t, execute) {
  const registrations = new Map(), cleanup = [], calls = [];
  let definition;
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: value => { definition = value; } } },
    crypto: globalThis.crypto, AbortController, queueMicrotask,
    navigator: { clipboard: { writeText: async () => {} } },
  });
  const plugin = definition.factory(name => {
    assert.equal(name, 'react');
    return React;
  });
  const binding = { ctx: { remote: { commands: { execute: async (...args) => {
    calls.push(args);
    return execute ? execute(...args) : { ok: true, value: { result: { kind: 'success', text: JSON.stringify(success) } } };
  } } } } };
  const ctx = {
    uiConversation: { views: { entries: () => [], subscribe: () => () => {} }, binding: () => ({ rebuild() {} }) },
    sessions: { list: { getSnapshot: () => ({ ids: [] }) }, binding: () => binding },
    on: () => () => {},
    effect: effect => { const dispose = effect(); cleanup.push(dispose); return dispose; },
    locale: { register: () => () => {}, bind: () => key => key },
    slots: {
      entries: () => [],
      register: (options, component) => {
        registrations.set(options.key ?? options.id, { options, component });
        return () => {};
      },
      inject: (_name, register) => {
        const result = register();
        if (typeof result !== 'function') Array.from(result);
      },
    },
  };
  plugin.apply(ctx);
  const entry = registrations.get('user');
  const state = { running: false, pendingSubmissions: [], awaitingFirstTurn: false };
  const props = {
    node: { data: { seq: 9, messageId: 'original', source: { kind: 'user' },
      content: [{ type: 'text', text: '旧问题' }, image, file] } },
    t: key => key,
    useSession: selector => selector(state),
    renderFactorySlot: (_name, value) => React.createElement('native-content', { value }),
    ...entry.options.inject('open'),
  };
  let renderer;
  await act(() => { renderer = create(React.createElement(entry.component, props)); });
  t.after(async () => {
    await act(() => renderer.unmount());
    cleanup.reverse().forEach(dispose => dispose());
  });
  return {
    renderer, props, state, calls,
    update: () => act(() => renderer.update(React.createElement(entry.component, props))),
    button: label => renderer.root.findAllByType('button').find(node => node.props['aria-label'] === label),
    begin: () => act(() => renderer.root.findByProps({ 'aria-label': 'edit' }).props.onClick()),
    change: text => act(() => renderer.root.findByType('textarea').props.onChange({ target: { value: text } })),
  };
}

const key = (overrides = {}) => ({
  key: 'Enter', ctrlKey: false, metaKey: false, keyCode: 13,
  nativeEvent: { isComposing: false }, preventDefault() {}, ...overrides,
});
const submit = fixture => act(() => fixture.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));

test('compiled UI shows a live pencil only for editable messages in an entirely idle session', async t => {
  const f = await mount(t);
  assert.ok(f.button('edit'));
  assert.equal(f.button('edit').props.disabled, undefined);
  for (const busy of [
    { running: true, pendingSubmissions: [], awaitingFirstTurn: false },
    { running: false, pendingSubmissions: [{}], awaitingFirstTurn: false },
    { running: false, pendingSubmissions: [], awaitingFirstTurn: true },
  ]) {
    Object.assign(f.state, busy);
    await f.update();
    assert.equal(f.button('edit'), undefined);
    assert.ok(f.button('copy'));
  }
  Object.assign(f.state, { running: false, pendingSubmissions: [], awaitingFirstTurn: false });
  await f.update();
  assert.ok(f.button('edit'));
  f.props.node = { data: { ...f.props.node.data, content: [{ type: 'tool-call', id: 'unsupported' }] } };
  await f.update();
  assert.equal(f.button('edit'), undefined);
});

test('compiled editor retains native attachments, respects IME and submits the full command on Cmd+Enter', async t => {
  const f = await mount(t);
  await f.begin();
  const native = f.renderer.root.findByType('native-content').props.value;
  assert.equal(native.content.text, '');
  assert.deepEqual(Array.from(native.content.attachments, item => item.type), ['image', 'file']);
  assert.equal(native.content.attachments[0].image.attachment, image.attachment);
  assert.equal(native.content.attachments[1].file, file.attachment);
  await f.change('修改后的问题');
  for (const event of [
    key({ metaKey: true, nativeEvent: { isComposing: true } }),
    key({ ctrlKey: true, keyCode: 229 }), key(),
  ]) {
    await act(() => f.renderer.root.findByType('textarea').props.onKeyDown(event));
  }
  assert.equal(f.calls.length, 0);
  await act(() => f.renderer.root.findByType('textarea').props.onKeyDown(key({ metaKey: true })));
  assert.equal(f.calls.length, 1);
  const [line, attachments] = f.calls[0];
  assert.ok(line.startsWith('/message-edit '));
  const request = JSON.parse(line.slice('/message-edit '.length));
  assert.equal(request.seq, 9);
  assert.equal(request.originalText, '旧问题');
  assert.equal(request.text, '修改后的问题');
  assert.match(request.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(attachments.length, 0); // Host reuses the original message's attachments.
  assert.equal(f.renderer.root.findAllByType('textarea').length, 0);
});

test('cancel and Escape discard only the local draft, without executing a command', async t => {
  const f = await mount(t);
  await f.begin();
  await f.change('取消这个草稿');
  await act(() => f.renderer.root.findByType('textarea').props.onKeyDown(key({ key: 'Escape' })));
  assert.equal(f.renderer.root.findAllByType('textarea').length, 0);
  await f.begin();
  assert.equal(f.renderer.root.findByType('textarea').props.value, '旧问题');
  await act(() => f.renderer.root.findAllByType('button').find(node => node.props.type === 'button').props.onClick());
  assert.equal(f.renderer.root.findAllByType('textarea').length, 0);
  assert.equal(f.calls.length, 0);
});

test('an in-flight submit is deduplicated and failed drafts retry with the same request id', async t => {
  let release;
  const f = await mount(t, () => new Promise(resolve => { release = resolve; }));
  await f.begin();
  await f.change('重试正文');
  await submit(f);
  await submit(f);
  assert.equal(f.calls.length, 1);
  assert.equal(f.renderer.root.findByType('textarea').props.disabled, true);
  await act(() => release({ ok: false, error: { message: 'network failed' } }));
  assert.equal(f.renderer.root.findByProps({ role: 'alert' }).children.join(''), 'network failed');
  assert.equal(f.renderer.root.findByType('textarea').props.disabled, false);
  await submit(f);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][0], f.calls[1][0]);
  await act(() => release({ ok: true, value: { result: { kind: 'success', text: JSON.stringify(success) } } }));
  assert.equal(f.renderer.root.findAllByType('textarea').length, 0);
});

test('a committed cut followed by a resend error stays visible in the editor', async t => {
  const f = await mount(t, async () => ({ ok: true, value: { result: { kind: 'success',
    text: JSON.stringify({ ...success, historyChanged: true, accepted: false, error: 'send refused' }) } } }));
  await f.begin();
  await submit(f);
  assert.equal(f.renderer.root.findByProps({ role: 'alert' }).children.join(''), 'send refused');
  assert.equal(f.renderer.root.findByType('textarea').props.disabled, false);
});

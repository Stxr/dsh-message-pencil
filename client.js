(() => {
// <message-pencil-visibility>
/** Chat visibility for committed same-session edits; no DOM or event-log mutation. */
function editResult(node) {
  if (node.kind !== 'command' || node.data.name !== 'message-edit' || node.data.outcome?.kind !== 'success') return undefined;
  try { return JSON.parse(node.data.outcome.text); }
  catch (error) { return undefined; /* Other command versions may have human-readable output. */ }
}

function cutsOf(commands) {
  const cuts = [];
  for (const node of commands) {
    const result = editResult(node);
    const cut = result?.cut;
    if (cut && [cut.from, cut.to, cut.fromTurn, cut.lastTurn].every(Number.isSafeInteger)
      && cut.from <= cut.to && cut.fromTurn >= 1 && cut.fromTurn <= cut.lastTurn && typeof cut.keepFirstTurn === 'boolean') cuts.push(cut);
  }
  return cuts;
}

function removedTurn(turn, cuts) {
  return Number.isSafeInteger(turn) && cuts.some(cut => turn >= cut.fromTurn + (cut.keepFirstTurn ? 1 : 0) && turn <= cut.lastTurn);
}

function filterOutline(outline, cuts) {
  if (!Array.isArray(outline) || !cuts.length) return outline;
  return outline.filter(item => !removedTurn(item.turn, cuts)).map(item => {
    const retained = cuts.findLast(cut => cut.keepFirstTurn && cut.fromTurn === item.turn);
    return retained ? { ...item, prompt: retained.keptPrompt ?? '', response: '' } : item;
  });
}

function turnOf(node) { return node.location?.turn?.turn ?? node.data?.turn; }
function hidden(node) { return node.visibility === 'hidden' ? node : { ...node, visibility: 'hidden' }; }
function conceal(node, cuts) {
  if (node.kind === 'command' && node.data.name === 'message-edit') return editResult(node)?.error ? node : hidden(node);
  return cuts.some(cut => node.anchorSeq >= cut.from && node.anchorSeq <= cut.to) || removedTurn(turnOf(node), cuts) ? hidden(node) : node;
}

/** Version-checked adapter around DSH 0.2.2's registered Chat snapshot builder. */
class EditVisibilityBuilder {
  constructor(inner) {
    if (!inner || typeof inner.replace !== 'function' || typeof inner.apply !== 'function' || typeof inner.groupInput !== 'function') throw new Error('Unsupported Chat builder; message editing cannot safely hide history.');
    this.inner = inner;
    this.originals = new Map();
    this.commands = new Map();
    this.cuts = [];
    this.signature = '[]';
    this.empty = this.decorate(inner.empty);
  }
  decorate(snapshot) {
    const legacy = snapshot.legacy;
    if (!legacy || !this.cuts.length) return { ...snapshot, messagePencilCuts: this.cuts };
    const nodes = legacy.nodes.filter(node => !(node.kind === 'command' && node.name === 'message-edit')
      && !this.cuts.some(cut => node.seq >= cut.from && node.seq <= cut.to) && !removedTurn(node.turn, this.cuts));
    return { ...snapshot, legacy: { ...legacy, nodes }, messagePencilCuts: this.cuts };
  }
  remember(node) {
    this.originals.set(node.key, node);
    if (node.kind === 'command') this.commands.set(node.key, node);
    else this.commands.delete(node.key);
  }
  refreshCuts() {
    const next = cutsOf(this.commands.values());
    const signature = JSON.stringify(next);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.cuts = next;
    return true;
  }
  replace(input) {
    this.originals.clear(); this.commands.clear();
    for (const node of input.nodes) this.remember(node);
    this.refreshCuts();
    return this.decorate(this.inner.replace({ ...input, nodes: [...this.originals.values()].map(node => conceal(node, this.cuts)) }));
  }
  apply(input) {
    let commandChanged = false;
    for (const node of input.upserts) {
      commandChanged ||= node.kind === 'command' || this.commands.has(node.key);
      this.remember(node);
    }
    if (commandChanged && this.refreshCuts()) {
      return this.decorate(this.inner.replace({ nodes: [...this.originals.values()].map(node => conceal(node, this.cuts)), timeline: input.timeline }));
    }
    return this.decorate(this.inner.apply({ ...input, upserts: input.upserts.map(node => conceal(node, this.cuts)) }));
  }
  groupInput() { return this.inner.groupInput(); }
  publish() { this.inner.publish?.(); }
}

/** Preserve other wrappers and restore the exact factory on unload. */
function decorateChatDefinition(definition) {
  if (!definition || definition.target !== 'chat' || typeof definition.create !== 'function') throw new Error('Chat view is unavailable.');
  const original = definition.create;
  function create() { return new EditVisibilityBuilder(original.call(definition)); }
  definition.create = create;
  return () => { if (definition.create === create) definition.create = original; };
}

/** Keep DSH's native renderers, selectors, grouping and paging machinery. */
function installEditVisibility(ctx, React) {
  const ui = ctx.uiConversation;
  if (!ui?.views?.entries || !ui?.binding || !ctx.slots.entries) throw new Error('Message editing requires the DSH 0.2.2 Chat registry.');
  const definitions = new Map();
  const entries = new Map();
  const known = new Set();
  let stopped = false;
  let unsubscribe = () => {};
  let slotChanged = () => {};
  function rebuild() {
    const ids = ctx.sessions.list?.getSnapshot()?.ids ?? [];
    for (const id of new Set([...ids, ...known])) {
      if (ctx.sessions.binding(id)) ui.binding(id).rebuild();
    }
  }
  function ensure() {
    let changed = false;
    for (const definition of ui.views.entries()) {
      if (definition.target !== 'chat' || definitions.has(definition)) continue;
      definitions.set(definition, decorateChatDefinition(definition)); changed = true;
    }
    for (const entry of ctx.slots.entries('conversation.view')) {
      if (entry.options.id !== 'chat' || entries.has(entry)) continue;
      const original = entry.component;
      function ChatWithEditedOutline(props) {
        const cuts = props.useChat(snapshot => snapshot.messagePencilCuts ?? EMPTY_EDIT_CUTS);
        const projection = React.useMemo(() => {
          let previous, projected;
          return key => {
            const value = props.useProjection(key);
            if (key !== 'turnOutline') return value;
            if (value !== previous) { previous = value; projected = filterOutline(value, cuts); }
            return projected;
          };
        }, [props.useProjection, cuts]);
        return React.createElement(original, { ...props, useProjection: projection });
      }
      entry.component = ChatWithEditedOutline;
      entries.set(entry, { original, wrapper: ChatWithEditedOutline });
    }
    if (changed) rebuild();
  }
  // Own restoration before the first mutation: startup can fail during rebuild.
  ctx.effect(() => () => {
    stopped = true; unsubscribe(); slotChanged();
    for (const restore of definitions.values()) restore();
    for (const [entry, patch] of entries) if (entry.component === patch.wrapper) entry.component = patch.original;
    rebuild(); definitions.clear(); entries.clear(); known.clear();
  });
  ensure();
  unsubscribe = ui.views.subscribe(ensure);
  slotChanged = ctx.on('slots/changed', key => { if (key === 'conversation.view' && !stopped) ensure(); });
  return sessionId => {
    if (known.has(sessionId)) return;
    known.add(sessionId);
    queueMicrotask(() => { if (!stopped && ctx.sessions.binding(sessionId)) ui.binding(sessionId).rebuild(); });
  };
}
const EMPTY_EDIT_CUTS = Object.freeze([]);
// </message-pencil-visibility>
window.__ModuleLoader__.load({
  id: '@local/dsh-message-pencil',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'messagePencil';
    const dictionaries = {
      zh: { edit: '编辑这条消息', copy: '复制', copied: '已复制', cancel: '取消', send: '发送', sending: '发送中…', label: '修改消息', busy: '请等待回复完成，或先停止生成', unavailable: '编辑服务暂不可用，请刷新页面。' },
      en: { edit: 'Edit this message', copy: 'Copy', copied: 'Copied', cancel: 'Cancel', send: 'Send', sending: 'Sending…', label: 'Edit message', busy: 'Wait for the reply to finish or stop generation first', unavailable: 'Message editing is unavailable. Refresh the page.' },
    };
    const css = `
      .mp-row{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0}
      .mp-actions{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);min-height:26px}
      .mp-icon{width:28px;height:28px;padding:5px;border:0;border-radius:7px;background:transparent;color:inherit;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
      .mp-icon:hover,.mp-icon:focus-visible{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .mp-icon:disabled{cursor:default;opacity:.4}
      .mp-icon:focus-visible,.mp-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .mp-editor{width:100%;min-width:0;box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border:0;border-radius:22px;padding:16px}
      .mp-editor textarea{display:block;width:100%;min-height:2lh;max-height:50vh;resize:none;box-sizing:border-box;field-sizing:content;font:inherit;line-height:1.5;background:transparent;color:var(--dsw-alias-label-primary);border:0;outline:0;padding:0}
      .mp-attachments{margin-bottom:12px}
      .mp-controls{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;flex-wrap:wrap}
      .mp-button{font:inherit;font-size:13px;line-height:1.5;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:6px 12px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
      .mp-button:hover{background:var(--dsw-alias-bg-layer-1)}
      .mp-button:disabled{opacity:.5;cursor:default}
      .mp-primary,.mp-primary:hover{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}
      .mp-error{font-size:13px;line-height:1.5;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}
      @media(hover:hover){.mp-actions button{opacity:0}.mp-row:hover .mp-actions button,.mp-row:focus-within .mp-actions button{opacity:1}}
    `;
    function icon(kind) {
      return h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        kind === 'edit' ? h('path', { d: 'm15.5 4.5 4 4M4 20l4.5-1 12-12a2.83 2.83 0 0 0-4-4l-12 12L4 20Z' })
          : kind === 'check' ? h('path', { d: 'm5 12 4 4L19 6' })
            : h(React.Fragment, null, h('rect', { x: 8, y: 8, width: 12, height: 13, rx: 2 }), h('path', { d: 'M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3' })));
    }
    function parts(data) {
      const content = { text: '', attachments: [], extraBlocks: [], ...(data.referenceLabels ? { referenceLabels: data.referenceLabels } : {}) };
      for (const block of data.content) {
        if (block.type === 'text') content.text += block.text;
        else if (block.type === 'image') content.attachments.push({ type: 'image', image: { attachment: block.attachment } });
        else if (block.type === 'file') content.attachments.push({ type: 'file', file: block.attachment });
        else content.extraBlocks.push(block);
      }
      return content;
    }
    function UserMessage(props) {
      const { node, t } = props;
      const data = node.data;
      const content = React.useMemo(() => parts(data), [data]);
      const running = props.useSession(state => state.running || state.pendingSubmissions.length > 0 || state.awaitingFirstTurn);
      const [editing, setEditing] = React.useState(false);
      const [text, setText] = React.useState(content.text);
      const [sending, setSending] = React.useState(false);
      const [error, setError] = React.useState('');
      const [copied, setCopied] = React.useState(false);
      const request = React.useRef(null);
      const pending = React.useRef(false);
      const mounted = React.useRef(true);
      const textarea = React.useRef(null);
      React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
      React.useEffect(() => { if (editing) textarea.current?.focus({ preventScroll: true }); }, [editing]);
      const editable = data.source?.kind === 'user' && content.extraBlocks.length === 0;
      function begin() {
        setText(content.text); setError(''); request.current = null; setEditing(true);
      }
      async function submit() {
        if (pending.current || running) return;
        pending.current = true; setSending(true); setError('');
        try {
          request.current ??= { action: 'edit', seq: data.seq, originalText: content.text, text, requestId: crypto.randomUUID() };
          const result = await props.editMessage(request.current);
          if (result.error) { if (mounted.current) setError(result.error); return; }
          if (mounted.current) setEditing(false);
        } catch (failure) {
          if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          pending.current = false;
          if (mounted.current) setSending(false);
        }
      }
      async function copy() {
        try { await navigator.clipboard.writeText(content.text); setCopied(true); }
        catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
      }
      const facts = { ...(data.referenceLabels ? { sessionLabels: data.referenceLabels } : {}), ...(data.skillNames ? { skillNames: data.skillNames } : {}) };
      return h('div', { className: 'mp-row', 'data-message-pencil': data.messageId },
        !editing ? props.renderFactorySlot('conversation.chat.user.content', { content, facts, interactive: true, loadImage: props.loadImage }) : null,
        editing ? h('form', { className: 'mp-editor', onSubmit: event => { event.preventDefault(); submit(); }, 'aria-label': t('label') },
          content.attachments.length ? h('div', { className: 'mp-attachments' }, props.renderFactorySlot('conversation.chat.user.content', { content: { ...content, text: '' }, facts, interactive: true, loadImage: props.loadImage })) : null,
          h('textarea', { ref: textarea, rows: 2, value: text, 'aria-label': t('label'), disabled: sending,
            onChange: event => { setText(event.target.value); request.current = null; },
            onKeyDown: event => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'Escape' && !sending) { event.preventDefault(); setEditing(false); }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
            } }),
          error ? h('div', { className: 'mp-error', role: 'alert' }, error) : null,
          h('div', { className: 'mp-controls' },
            h('button', { type: 'button', className: 'mp-button', disabled: sending, onClick: () => setEditing(false) }, t('cancel')),
            h('button', { type: 'submit', className: 'mp-button mp-primary', disabled: sending || running || (!text.trim() && content.attachments.length === 0), title: running ? t('busy') : undefined }, t(sending ? 'sending' : 'send'))))
          : h('div', { className: 'mp-actions' },
            data.time ? h('time', { dateTime: new Date(data.time).toISOString(), title: new Date(data.time).toLocaleString() }, new Date(data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : null,
            h('button', { type: 'button', className: 'mp-icon', title: t(copied ? 'copied' : 'copy'), 'aria-label': t(copied ? 'copied' : 'copy'), onClick: copy, onMouseLeave: () => setCopied(false) }, icon(copied ? 'check' : 'copy')),
            editable && !running ? h('button', { type: 'button', className: 'mp-icon', title: t('edit'), 'aria-label': t('edit'), onClick: begin }, icon('edit')) : null),
        !editing && error ? h('div', { className: 'mp-error', role: 'alert' }, error) : null);
    }
    return {
      inject: ['slots', 'locale', 'sessions', 'uiConversation'],
      apply(ctx) {
        const retainVisibility = installEditVisibility(ctx, React);
        for (const [language, dictionary] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(NS, language, dictionary));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'message-pencil-styles', order: 0 }, () => h('style', null, css)));
        const inject = sessionId => {
          retainVisibility(sessionId);
          return { editMessage: async request => {
            const binding = ctx.sessions.binding(sessionId);
            if (!binding) throw new Error(ctx.locale.bind(NS)('unavailable'));
            const response = await binding.ctx.remote.commands.execute('/message-edit ' + JSON.stringify(request), [], new AbortController().signal);
            if (!response.ok) throw new Error(response.error.message);
            if (!response.value || response.value.result.kind === 'error') throw new Error(response.value?.result.text ?? ctx.locale.bind(NS)('unavailable'));
            return JSON.parse(response.value.result.text);
          } };
        };
        ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({ name: 'conversation.chat.commandview', key: 'message-edit' }, props => {
          const result = props.node.outcome?.kind === 'success' ? editResult({ kind: 'command', data: props.node }) : null;
          return result?.error ? h('div', { className: 'mp-error', role: 'alert' }, result.error) : null;
        }));
        ctx.slots.inject('conversation.chat.node', function* () {
          yield ctx.slots.register({ name: 'conversation.chat.node', key: 'user', priority: -10, locale: NS, inject }, UserMessage);
          yield ctx.slots.register({ name: 'conversation.chat.node', key: 'steering', priority: -10, locale: NS, inject }, UserMessage);
        });
      },
    };
  },
});
})();

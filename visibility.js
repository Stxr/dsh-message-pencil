/** Chat visibility for committed same-session edits; no DOM or event-log mutation. */
export function editResult(node) {
  if (node.kind !== 'command' || node.data.name !== 'message-edit' || node.data.outcome?.kind !== 'success') return undefined;
  try { return JSON.parse(node.data.outcome.text); }
  catch (error) { return undefined; /* Other command versions may have human-readable output. */ }
}

export function cutsOf(commands) {
  const cuts = [];
  for (const node of commands) {
    const result = editResult(node);
    const cut = result?.cut;
    if (cut && [cut.from, cut.to, cut.fromTurn, cut.lastTurn].every(Number.isSafeInteger)
      && cut.from <= cut.to && cut.fromTurn >= 1 && cut.fromTurn <= cut.lastTurn && typeof cut.keepFirstTurn === 'boolean') cuts.push(cut);
  }
  return cuts;
}

export function removedTurn(turn, cuts) {
  return Number.isSafeInteger(turn) && cuts.some(cut => turn >= cut.fromTurn + (cut.keepFirstTurn ? 1 : 0) && turn <= cut.lastTurn);
}

export function filterOutline(outline, cuts) {
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
export class EditVisibilityBuilder {
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
export function decorateChatDefinition(definition) {
  if (!definition || definition.target !== 'chat' || typeof definition.create !== 'function') throw new Error('Chat view is unavailable.');
  const original = definition.create;
  function create() { return new EditVisibilityBuilder(original.call(definition)); }
  definition.create = create;
  return () => { if (definition.create === create) definition.create = original; };
}

/** Keep DSH's native renderers, selectors, grouping and paging machinery. */
export function installEditVisibility(ctx, React) {
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

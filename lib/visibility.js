// Generated from TypeScript by pnpm build. Edit src/, not this file.

// src/shared/protocol.ts
var EDIT_COMMAND = "message-edit";

// src/client/history/results.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isEditCommand(node) {
  return node.kind === "command" && isRecord(node.data) && node.data.name === EDIT_COMMAND;
}
function editResult(node) {
  if (!isEditCommand(node) || !isRecord(node.data)) return void 0;
  const outcome = node.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "success") return void 0;
  try {
    return JSON.parse(outcome.text);
  } catch {
    return void 0;
  }
}
function editResultField(result, key) {
  return isRecord(result) ? result[key] : void 0;
}

// src/client/history/cuts.ts
function isSafeInteger(value) {
  return Number.isSafeInteger(value);
}
function isEditCut(value) {
  if (!isRecord(value)) return false;
  return isSafeInteger(value.from) && isSafeInteger(value.to) && isSafeInteger(value.fromTurn) && isSafeInteger(value.lastTurn) && value.from <= value.to && value.fromTurn >= 1 && value.fromTurn <= value.lastTurn && typeof value.keepFirstTurn === "boolean";
}
function cutsOf(commands) {
  const cuts = [];
  for (const node of commands) {
    const cut = editResultField(editResult(node), "cut");
    if (isEditCut(cut)) cuts.push(cut);
  }
  return cuts;
}
function removedTurn(turn, cuts) {
  return isSafeInteger(turn) && cuts.some((cut) => turn >= cut.fromTurn + (cut.keepFirstTurn ? 1 : 0) && turn <= cut.lastTurn);
}
function filterOutline(outline, cuts) {
  if (!Array.isArray(outline) || !cuts.length) return outline;
  const items = outline;
  return items.filter((item) => !removedTurn(item.turn, cuts)).map((item) => {
    const retained = cuts.findLast((cut) => cut.keepFirstTurn && cut.fromTurn === item.turn);
    return retained ? { ...item, prompt: retained.keptPrompt ?? "", response: "" } : item;
  });
}

// src/client/history/builder.ts
function turnOf(node) {
  return node.location?.turn?.turn ?? (isRecord(node.data) ? node.data.turn : void 0);
}
function hidden(node) {
  return node.visibility === "hidden" ? node : { ...node, visibility: "hidden" };
}
function conceal(node, cuts) {
  if (isEditCommand(node)) return editResultField(editResult(node), "error") ? node : hidden(node);
  return cuts.some((cut) => node.anchorSeq >= cut.from && node.anchorSeq <= cut.to) || removedTurn(turnOf(node), cuts) ? hidden(node) : node;
}
function assertChatBuilder(value) {
  if (!isRecord(value) || typeof value.replace !== "function" || typeof value.apply !== "function" || typeof value.groupInput !== "function") {
    throw new Error("Unsupported Chat builder; message editing cannot safely hide history.");
  }
}
var EditVisibilityBuilder = class {
  constructor(inner) {
    this.inner = inner;
    assertChatBuilder(inner);
    this.empty = this.decorate(inner.empty);
  }
  originals = /* @__PURE__ */ new Map();
  commands = /* @__PURE__ */ new Map();
  cuts = [];
  signature = "[]";
  empty;
  decorate(snapshot) {
    const legacy = snapshot.legacy;
    if (!legacy || !this.cuts.length) return { ...snapshot, messagePencilCuts: this.cuts };
    const nodes = legacy.nodes.filter((node) => !(node.kind === "command" && node.name === EDIT_COMMAND) && !this.cuts.some((cut) => node.seq >= cut.from && node.seq <= cut.to) && !removedTurn(node.turn, this.cuts));
    return { ...snapshot, legacy: { ...legacy, nodes }, messagePencilCuts: this.cuts };
  }
  remember(node) {
    this.originals.set(node.key, node);
    if (node.kind === "command") this.commands.set(node.key, node);
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
    this.originals.clear();
    this.commands.clear();
    for (const node of input.nodes) this.remember(node);
    this.refreshCuts();
    return this.decorate(this.inner.replace({
      ...input,
      nodes: [...this.originals.values()].map((node) => conceal(node, this.cuts))
    }));
  }
  apply(input) {
    let commandChanged = false;
    for (const node of input.upserts) {
      commandChanged ||= node.kind === "command" || this.commands.has(node.key);
      this.remember(node);
    }
    if (commandChanged && this.refreshCuts()) {
      return this.decorate(this.inner.replace({
        nodes: [...this.originals.values()].map((node) => conceal(node, this.cuts)),
        timeline: input.timeline
      }));
    }
    return this.decorate(this.inner.apply({
      ...input,
      upserts: input.upserts.map((node) => conceal(node, this.cuts))
    }));
  }
  groupInput() {
    return this.inner.groupInput();
  }
  publish() {
    this.inner.publish?.();
  }
};
function decorateChatDefinition(definition) {
  if (!definition || definition.target !== "chat" || typeof definition.create !== "function") {
    throw new Error("Chat view is unavailable.");
  }
  const original = definition.create;
  function create() {
    return new EditVisibilityBuilder(original.call(definition));
  }
  definition.create = create;
  return () => {
    if (definition.create === create) definition.create = original;
  };
}

// src/client/history/install.ts
var EMPTY_EDIT_CUTS = Object.freeze([]);
function installEditVisibility(ctx, React) {
  const ui = ctx.uiConversation;
  if (!ui?.views?.entries || !ui?.binding || !ctx.slots.entries) {
    throw new Error("Message editing requires the DSH 0.2.2 Chat registry.");
  }
  const definitions = /* @__PURE__ */ new Map();
  const entries = /* @__PURE__ */ new Map();
  const known = /* @__PURE__ */ new Set();
  let stopped = false;
  let unsubscribe = () => {
  };
  let slotChanged = () => {
  };
  function rebuild() {
    const ids = ctx.sessions.list?.getSnapshot()?.ids ?? [];
    for (const id of /* @__PURE__ */ new Set([...ids, ...known])) {
      if (ctx.sessions.binding(id)) ui.binding(id).rebuild();
    }
  }
  function ensure() {
    let changed = false;
    for (const definition of ui.views.entries()) {
      if (definition.target !== "chat" || definitions.has(definition)) continue;
      definitions.set(definition, decorateChatDefinition(definition));
      changed = true;
    }
    for (const entry of ctx.slots.entries("conversation.view")) {
      let ChatWithEditedOutline2 = function(props) {
        const cuts = props.useChat((snapshot) => snapshot.messagePencilCuts ?? EMPTY_EDIT_CUTS);
        const projection = React.useMemo(() => {
          let previous;
          let projected;
          return (key) => {
            const value = props.useProjection(key);
            if (key !== "turnOutline") return value;
            if (value !== previous) {
              previous = value;
              projected = filterOutline(value, cuts);
            }
            return projected;
          };
        }, [props.useProjection, cuts]);
        return React.createElement(original, { ...props, useProjection: projection });
      };
      var ChatWithEditedOutline = ChatWithEditedOutline2;
      if (entry.options.id !== "chat" || entries.has(entry)) continue;
      const original = entry.component;
      entry.component = ChatWithEditedOutline2;
      entries.set(entry, { original, wrapper: ChatWithEditedOutline2 });
    }
    if (changed) rebuild();
  }
  ctx.effect(() => () => {
    stopped = true;
    unsubscribe();
    slotChanged();
    for (const restore of definitions.values()) restore();
    for (const [entry, patch] of entries) {
      if (entry.component === patch.wrapper) entry.component = patch.original;
    }
    rebuild();
    definitions.clear();
    entries.clear();
    known.clear();
  });
  ensure();
  unsubscribe = ui.views.subscribe(ensure);
  slotChanged = ctx.on("slots/changed", (key) => {
    if (key === "conversation.view" && !stopped) ensure();
  });
  return (sessionId) => {
    if (known.has(sessionId)) return;
    known.add(sessionId);
    queueMicrotask(() => {
      if (!stopped && ctx.sessions.binding(sessionId)) ui.binding(sessionId).rebuild();
    });
  };
}
export {
  EditVisibilityBuilder,
  cutsOf,
  decorateChatDefinition,
  editResult,
  editResultField,
  filterOutline,
  installEditVisibility,
  removedTurn
};

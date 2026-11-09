// Generated from TypeScript by pnpm build. Edit src/, not this file.
window.__ModuleLoader__.load({
  id: "@local/dsh-message-pencil",
  factory(require) {
    const module = { exports: {} };
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react6 = __toESM(require("react"), 1);

// src/shared/protocol.ts
var EDIT_COMMAND = "message-edit";
function isTextBlock(block) {
  return block.type === "text" && "text" in block && typeof block.text === "string";
}
function isAttachmentBlock(block) {
  return (block.type === "image" || block.type === "file") && "attachment" in block && typeof block.attachment === "object" && block.attachment !== null;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/client/components/UserMessage.tsx
var import_react5 = __toESM(require("react"), 1);

// src/client/content.ts
function splitUserContent(data) {
  const content = {
    text: "",
    attachments: [],
    extraBlocks: [],
    ...data.referenceLabels ? { referenceLabels: data.referenceLabels } : {}
  };
  for (const block of data.content) {
    if (isTextBlock(block)) {
      content.text += block.text;
    } else if (isAttachmentBlock(block)) {
      content.attachments.push(block.type === "image" ? { type: "image", image: { attachment: block.attachment } } : { type: "file", file: block.attachment });
    } else {
      content.extraBlocks.push(block);
    }
  }
  return content;
}

// src/client/hooks/useMessageEditor.ts
var import_react = require("react");
function useMessageEditor({ seq, originalText, running, editMessage }) {
  const [editing, setEditing] = (0, import_react.useState)(false);
  const [text, setText] = (0, import_react.useState)(originalText);
  const [sending, setSending] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const request = (0, import_react.useRef)(null);
  const pending = (0, import_react.useRef)(false);
  const mounted = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function begin() {
    setText(originalText);
    setError("");
    request.current = null;
    setEditing(true);
  }
  function changeText(value) {
    setText(value);
    request.current = null;
  }
  async function submit() {
    if (pending.current || running) return;
    pending.current = true;
    setSending(true);
    setError("");
    try {
      request.current ??= {
        action: "edit",
        seq,
        originalText,
        text,
        requestId: crypto.randomUUID()
      };
      const result = await editMessage(request.current);
      if (result.error) {
        if (mounted.current) setError(result.error);
        return;
      }
      if (mounted.current) setEditing(false);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setSending(false);
    }
  }
  return {
    editing,
    text,
    sending,
    error,
    setError,
    begin,
    changeText,
    submit,
    cancel: () => setEditing(false)
  };
}

// src/client/components/MessageActions.tsx
var import_react3 = __toESM(require("react"), 1);

// src/client/components/Icon.tsx
var import_react2 = __toESM(require("react"), 1);
function Icon({ kind }) {
  return /* @__PURE__ */ import_react2.default.createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 18,
      height: 18,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true"
    },
    kind === "edit" ? /* @__PURE__ */ import_react2.default.createElement("path", { d: "m15.5 4.5 4 4M4 20l4.5-1 12-12a2.83 2.83 0 0 0-4-4l-12 12L4 20Z" }) : kind === "check" ? /* @__PURE__ */ import_react2.default.createElement("path", { d: "m5 12 4 4L19 6" }) : /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: 8, y: 8, width: 12, height: 13, rx: 2 }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" }))
  );
}

// src/client/components/MessageActions.tsx
function MessageActions({ text, time, editable, onEdit, onError, t }) {
  const [copied, setCopied] = (0, import_react3.useState)(false);
  const date = time ? new Date(time) : void 0;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (failure) {
      onError(errorMessage(failure));
    }
  }
  return /* @__PURE__ */ import_react3.default.createElement("div", { className: "mp-actions" }, date && /* @__PURE__ */ import_react3.default.createElement("time", { dateTime: date.toISOString(), title: date.toLocaleString() }, date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), /* @__PURE__ */ import_react3.default.createElement(
    "button",
    {
      type: "button",
      className: "mp-icon",
      title: t(copied ? "copied" : "copy"),
      "aria-label": t(copied ? "copied" : "copy"),
      onClick: () => void copy(),
      onMouseLeave: () => setCopied(false)
    },
    /* @__PURE__ */ import_react3.default.createElement(Icon, { kind: copied ? "check" : "copy" })
  ), editable && /* @__PURE__ */ import_react3.default.createElement(
    "button",
    {
      type: "button",
      className: "mp-icon",
      title: t("edit"),
      "aria-label": t("edit"),
      onClick: onEdit
    },
    /* @__PURE__ */ import_react3.default.createElement(Icon, { kind: "edit" })
  ));
}

// src/client/components/MessageEditor.tsx
var import_react4 = __toESM(require("react"), 1);
function MessageEditor({ editor, running, hasAttachments, attachments, t }) {
  const textarea = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
    textarea.current?.focus({ preventScroll: true });
  }, []);
  function onKeyDown(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && !editor.sending) {
      event.preventDefault();
      editor.cancel();
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void editor.submit();
    }
  }
  return /* @__PURE__ */ import_react4.default.createElement(
    "form",
    {
      className: "mp-editor",
      "aria-label": t("label"),
      onSubmit: (event) => {
        event.preventDefault();
        void editor.submit();
      }
    },
    hasAttachments && /* @__PURE__ */ import_react4.default.createElement("div", { className: "mp-attachments" }, attachments),
    /* @__PURE__ */ import_react4.default.createElement(
      "textarea",
      {
        ref: textarea,
        rows: 2,
        value: editor.text,
        "aria-label": t("label"),
        disabled: editor.sending,
        onChange: (event) => editor.changeText(event.target.value),
        onKeyDown
      }
    ),
    editor.error && /* @__PURE__ */ import_react4.default.createElement("div", { className: "mp-error", role: "alert" }, editor.error),
    /* @__PURE__ */ import_react4.default.createElement("div", { className: "mp-controls" }, /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", className: "mp-button", disabled: editor.sending, onClick: editor.cancel }, t("cancel")), /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        type: "submit",
        className: "mp-button mp-primary",
        disabled: editor.sending || running || !editor.text.trim() && !hasAttachments,
        title: running ? t("busy") : void 0
      },
      t(editor.sending ? "sending" : "send")
    ))
  );
}

// src/client/components/UserMessage.tsx
function UserMessage(props) {
  const { node: { data }, t } = props;
  const content = (0, import_react5.useMemo)(() => splitUserContent(data), [data]);
  const running = props.useSession((state) => state.running || state.pendingSubmissions.length > 0 || state.awaitingFirstTurn);
  const editor = useMessageEditor({
    seq: data.seq,
    originalText: content.text,
    running,
    editMessage: props.editMessage
  });
  const editable = data.source?.kind === "user" && content.extraBlocks.length === 0;
  const facts = {
    ...data.referenceLabels ? { sessionLabels: data.referenceLabels } : {},
    ...data.skillNames ? { skillNames: data.skillNames } : {}
  };
  const renderContent = (value) => props.renderFactorySlot("conversation.chat.user.content", {
    content: value,
    facts,
    interactive: true,
    loadImage: props.loadImage
  });
  return /* @__PURE__ */ import_react5.default.createElement("div", { className: "mp-row", "data-message-pencil": data.messageId }, editor.editing ? /* @__PURE__ */ import_react5.default.createElement(
    MessageEditor,
    {
      editor,
      running,
      t,
      hasAttachments: content.attachments.length > 0,
      attachments: content.attachments.length ? renderContent({ ...content, text: "" }) : null
    }
  ) : /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, null, renderContent(content), /* @__PURE__ */ import_react5.default.createElement(
    MessageActions,
    {
      text: content.text,
      time: data.time,
      editable: editable && !running,
      onEdit: editor.begin,
      onError: editor.setError,
      t
    }
  )), !editor.editing && editor.error && /* @__PURE__ */ import_react5.default.createElement("div", { className: "mp-error", role: "alert" }, editor.error));
}

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
function installEditVisibility(ctx, React6) {
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
        const projection = React6.useMemo(() => {
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
        return React6.createElement(original, { ...props, useProjection: projection });
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

// src/client/locales.ts
var LOCALE_NAMESPACE = "messagePencil";
var zh = {
  edit: "编辑这条消息",
  copy: "复制",
  copied: "已复制",
  cancel: "取消",
  send: "发送",
  sending: "发送中…",
  label: "修改消息",
  busy: "请等待回复完成，或先停止生成",
  unavailable: "编辑服务暂不可用，请刷新页面。"
};
var en = {
  edit: "Edit this message",
  copy: "Copy",
  copied: "Copied",
  cancel: "Cancel",
  send: "Send",
  sending: "Sending…",
  label: "Edit message",
  busy: "Wait for the reply to finish or stop generation",
  unavailable: "Message editing is unavailable. Refresh the page."
};
var dictionaries = { zh, en };

// src/client/styles.css
var styles_default = ".mp-row {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 6px;\n  min-width: 0;\n}\n\n.mp-actions {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n  min-height: 26px;\n}\n\n.mp-icon {\n  width: 28px;\n  height: 28px;\n  padding: 5px;\n  border: 0;\n  border-radius: 7px;\n  background: transparent;\n  color: inherit;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n}\n\n.mp-icon:hover,\n.mp-icon:focus-visible {\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n}\n\n.mp-icon:disabled {\n  cursor: default;\n  opacity: .4;\n}\n\n.mp-icon:focus-visible,\n.mp-button:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n.mp-editor {\n  width: 100%;\n  min-width: 0;\n  box-sizing: border-box;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 0;\n  border-radius: 22px;\n  padding: 16px;\n}\n\n.mp-editor textarea {\n  display: block;\n  width: 100%;\n  min-height: 2lh;\n  max-height: 50vh;\n  resize: none;\n  box-sizing: border-box;\n  field-sizing: content;\n  font: inherit;\n  line-height: 1.5;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  border: 0;\n  outline: 0;\n  padding: 0;\n}\n\n.mp-attachments {\n  margin-bottom: 12px;\n}\n\n.mp-controls {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  margin-top: 10px;\n  flex-wrap: wrap;\n}\n\n.mp-button {\n  font: inherit;\n  font-size: 13px;\n  line-height: 1.5;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 12px;\n  padding: 6px 12px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n.mp-button:hover {\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.mp-button:disabled {\n  opacity: .5;\n  cursor: default;\n}\n\n.mp-primary,\n.mp-primary:hover {\n  border-color: transparent;\n  background: var(--dsw-alias-label-primary);\n  color: var(--dsw-alias-bg-base);\n}\n\n.mp-error {\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--dsw-alias-state-error-primary);\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  margin-top: 8px;\n}\n\n@media (hover: hover) {\n  .mp-actions button {\n    opacity: 0;\n  }\n\n  .mp-row:hover .mp-actions button,\n  .mp-row:focus-within .mp-actions button {\n    opacity: 1;\n  }\n}\n";

// src/client/transport.ts
function createMessageEditor(ctx, sessionId, unavailable) {
  return async (request) => {
    const binding = ctx.sessions.binding(sessionId);
    if (!binding) throw new Error(unavailable());
    const response = await binding.ctx.remote.commands.execute(
      `/${EDIT_COMMAND} ${JSON.stringify(request)}`,
      [],
      new AbortController().signal
    );
    if (!response.ok) throw new Error(response.error.message);
    if (!response.value || response.value.result.kind === "error") {
      throw new Error(response.value?.result.text ?? unavailable());
    }
    return JSON.parse(response.value.result.text);
  };
}

// src/client/index.tsx
function CommandError({ node }) {
  const result = node.outcome?.kind === "success" ? editResult({ kind: "command", data: node }) : void 0;
  const error = editResultField(result, "error");
  return error ? /* @__PURE__ */ import_react6.default.createElement("div", { className: "mp-error", role: "alert" }, String(error)) : null;
}
var inject = ["slots", "locale", "sessions", "uiConversation"];
function apply(ctx) {
  const retainVisibility = installEditVisibility(ctx, import_react6.default);
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, language, dictionary));
  }
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "message-pencil-styles",
    order: 0
  }, () => /* @__PURE__ */ import_react6.default.createElement("style", null, styles_default)));
  const injectMessage = (sessionId) => {
    retainVisibility(sessionId);
    return { editMessage: createMessageEditor(
      ctx,
      sessionId,
      () => ctx.locale.bind(LOCALE_NAMESPACE)("unavailable")
    ) };
  };
  ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register({
    name: "conversation.chat.commandview",
    key: EDIT_COMMAND
  }, CommandError));
  ctx.slots.inject("conversation.chat.node", function* () {
    for (const key of ["user", "steering"]) {
      yield ctx.slots.register({
        name: "conversation.chat.node",
        key,
        priority: -10,
        locale: LOCALE_NAMESPACE,
        inject: injectMessage
      }, UserMessage);
    }
  });
}
    return module.exports;
  }
});

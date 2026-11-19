// Generated from TypeScript by pnpm build. Edit src/, not this file.

// src/shared/protocol.ts
var PLUGIN_NAME = "@local/dsh-message-pencil";
var EDIT_COMMAND = "message-edit";
function isTextBlock(block) {
  return block.type === "text" && "text" in block && typeof block.text === "string";
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/host/validation.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireSessionId(value) {
  if (typeof value !== "string" || !value) throw new Error("缺少会话。 / Session is required.");
  return value;
}
function requireRequest(value) {
  if (!isRecord(value)) throw new Error("Invalid action.");
  return value;
}
function requireRequestId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{8,128}$/.test(value)) throw new Error("Invalid requestId.");
  return value;
}
function editSequence(request) {
  const seq = isRecord(request) ? request.seq : void 0;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) {
    throw new Error("无效的消息位置。 / Invalid message sequence.");
  }
  return seq;
}
function editText(request) {
  if (!isRecord(request) || typeof request.text !== "string" || typeof request.originalText !== "string") {
    throw new Error("缺少消息文本。 / Missing message text.");
  }
  return { text: request.text, originalText: request.originalText };
}
function isHumanMessageEvent(event) {
  return event?.type === "user/message" && isRecord(event.data) && isRecord(event.data.source) && event.data.source.kind === "user";
}
function isTurnStartEvent(event) {
  return event.type === "turn/start" && isRecord(event.data) && typeof event.data.turn === "number" && Number.isSafeInteger(event.data.turn) && event.data.turn >= 1;
}
function parseJson(text) {
  return JSON.parse(text);
}

// src/host/content.ts
var unsupportedContent = "此消息含暂不支持重新发送的内容。 / Unsupported message content.";
function readContent(value) {
  if (!Array.isArray(value)) throw new Error(unsupportedContent);
  const blocks = value;
  return blocks.map((block) => {
    if (!isRecord(block) || typeof block.type !== "string" || block.type === "text" && typeof block.text !== "string") {
      throw new Error(unsupportedContent);
    }
    return { ...block, type: block.type };
  });
}
function messageText(content) {
  return readContent(content).filter(isTextBlock).map((block) => block.text).join("");
}
function replaceText(content, text) {
  const blocks = readContent(content);
  if (blocks.some((block) => !["text", "image", "file"].includes(block.type))) throw new Error(unsupportedContent);
  let inserted = false;
  const next = [];
  for (const block of blocks) {
    if (isTextBlock(block)) {
      if (!inserted) {
        next.push({ type: "text", text });
        inserted = true;
      }
    } else {
      next.push(structuredClone(block));
    }
  }
  if (!inserted) next.push({ type: "text", text });
  if (!text.trim() && !next.some((block) => block.type === "image" || block.type === "file")) {
    throw new Error("消息不能为空。 / Message cannot be empty.");
  }
  return next;
}

// src/host/history.ts
import { randomUUID } from "node:crypto";

// src/host/request-cut.ts
function deferCut(events, agent, message, append, flush, signal) {
  let resolve;
  let reject;
  const completion = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  void completion.catch(() => {
  });
  let claimedTurn;
  let marker;
  let failure;
  let timer;
  const stopClaim = events.on("agent/inbox/claimed", (input) => {
    if (input.agent === agent && input.message.id === message.id) claimedTurn = input.turn;
  });
  const stopRequest = events.on("agent/request", async (position, next) => {
    if (position.agent !== agent || claimedTurn !== position.turn || position.step !== 1 || marker) return next();
    try {
      const config = await next();
      if (failure) throw failure;
      position.signal.throwIfAborted();
      signal?.throwIfAborted();
      marker = append(position);
      clearTimeout(timer);
      await flush();
      resolve(marker);
      return config;
    } catch (error) {
      reject(error);
      throw error;
    }
  });
  function fail(error, cancelClaimed) {
    if (marker || failure) return;
    failure = error;
    try {
      if (!agent.inbox.remove(message.id) && cancelClaimed && claimedTurn !== void 0) {
        agent.cancel({ kind: "user" }, { keepInbox: true });
      }
      reject(error);
    } catch (cause) {
      reject(new AggregateError([error, cause], `${error.message} Could not remove the queued edit.`));
    }
  }
  const noRequest = () => new Error("重新生成未开始。 / The replacement request did not start.");
  const abort = () => fail(new Error("消息编辑已取消。 / Message edit was canceled."), true);
  const dispose = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    stopRequest();
    stopClaim();
  };
  return {
    get marker() {
      return marker;
    },
    dispose,
    async wait() {
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      if (!marker && !failure) {
        timer = setTimeout(() => fail(noRequest(), true), 3e4);
        timer.unref();
      }
      void agent.whenIdle().then(() => fail(noRequest(), false), () => fail(noRequest(), false));
      return completion;
    }
  };
}

// src/host/history.ts
var incompleteHistory = "会话轮次不完整，无法修改。 / The conversation has no complete step position.";
function editTarget(session, request) {
  const seq = editSequence(request);
  const event = session.eventAt(seq);
  if (!isHumanMessageEvent(event) || !session.surface.nodes.includes(seq)) {
    throw new Error("这条消息已变化或不可编辑，请刷新会话。 / Message is no longer editable; refresh the conversation.");
  }
  const { text, originalText } = editText(request);
  if (messageText(event.data.content) !== originalText) {
    throw new Error("消息原文已变化，请重新打开编辑器。 / Original text changed; reopen the editor.");
  }
  return { event, content: replaceText(event.data.content, text) };
}
async function editAndSend(deps, sessionId, request, signal) {
  signal?.throwIfAborted();
  const source = deps.sessions.get(sessionId);
  if (!source) throw new Error("请先打开会话。 / Open the conversation first.");
  const state = await deps.controller.state({ sessionId }, signal ?? new AbortController().signal);
  if (state.running) throw new Error("请等待回复完成，或先停止生成。 / Wait for the reply to finish or stop generation first.");
  const agent = deps.agents.get(sessionId);
  if (!agent || typeof agent.runMaintenance !== "function") {
    throw new Error("当前会话暂不可编辑，请重新打开。 / Reopen the conversation to edit.");
  }
  const { pending, cut, seq, content } = await agent.runMaintenance(async (maintenanceSignal) => {
    signal?.throwIfAborted();
    maintenanceSignal.throwIfAborted();
    const seq2 = editSequence(request);
    const { content: content2 } = editTarget(source, request);
    const nodes = [...source.surface.nodes];
    const targetIndex = nodes.indexOf(seq2);
    const removed = nodes.slice(targetIndex);
    const boundary = deps.agents.turnBoundaryOf(source);
    const opening = source.snapshotEvents().findLast((item) => isTurnStartEvent(item) && item.seq < seq2);
    const startSeq = removed[0];
    const endSeq = removed.at(-1);
    if (!opening || !isTurnStartEvent(opening) || boundary.lastTurn < 1 || targetIndex < 0 || startSeq === void 0 || endSeq === void 0) {
      throw new Error(incompleteHistory);
    }
    const prefix = nodes.slice(0, targetIndex).filter((nodeSeq) => nodeSeq > opening.seq).map((nodeSeq) => {
      const item = source.eventAt(nodeSeq);
      if (!item) throw new Error(incompleteHistory);
      return item;
    });
    const keepFirstTurn = prefix.some((item) => item.type !== "system/message");
    const firstHuman = prefix.find(isHumanMessageEvent);
    const cut2 = {
      from: seq2,
      fromTurn: opening.data.turn,
      lastTurn: boundary.lastTurn,
      keepFirstTurn,
      ...keepFirstTurn ? {
        keptPrompt: firstHuman ? messageText(firstHuman.data.content).replace(/\s+/g, " ").trim().slice(0, 50) : ""
      } : {}
    };
    agent.inbox.clear();
    const message = { id: randomUUID(), role: "user", content: content2, source: { kind: "user" } };
    const pending2 = deferCut(deps, agent, message, ({ turn, step }) => {
      const current = source.surface.nodes;
      if (current.length !== nodes.length || current.some((value, index) => value !== nodes[index])) {
        throw new Error("会话历史已变化，请重新打开编辑器。 / History changed; reopen the editor.");
      }
      const requestId = isRecord(request) ? request.requestId : void 0;
      return source.append("developer/message", {
        turn,
        step,
        message: {
          id: `message-pencil-cut:${String(requestId)}`,
          role: "developer",
          content: [],
          source: { kind: "user" }
        }
      }, { surfaceOp: { op: "replace", startSeq, endSeq }, sourceEventSeqs: removed });
    }, async () => {
      if (!await deps.sessions.flush(source)) {
        throw new Error("未找到会话持久化服务。 / Session persistence is unavailable.");
      }
    }, signal);
    try {
      agent.followup(message);
      return { pending: pending2, cut: cut2, seq: seq2, content: content2 };
    } catch (error) {
      pending2.dispose();
      throw error;
    }
  });
  try {
    const marker = await pending.wait();
    return {
      sessionId,
      editedSeq: seq,
      markerSeq: marker.seq,
      cut: { ...cut, to: marker.seq },
      attachmentCount: content.filter((block) => block.type !== "text").length
    };
  } catch (error) {
    const { marker } = pending;
    if (!marker) throw error;
    return {
      sessionId,
      editedSeq: seq,
      markerSeq: marker.seq,
      cut: { ...cut, to: marker.seq },
      historyChanged: true,
      accepted: false,
      error: errorMessage(error)
    };
  } finally {
    pending.dispose();
  }
}

// src/host/operations.ts
function listMessages(sessions, sessionId, beforeSeq) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("请先打开会话。 / Open the conversation first.");
  let before = Infinity;
  if (beforeSeq !== void 0) {
    if (typeof beforeSeq !== "number" || !Number.isSafeInteger(beforeSeq) || beforeSeq < 0) {
      throw new Error("Invalid beforeSeq.");
    }
    before = beforeSeq;
  }
  const messages = session.surface.nodes.map((seq) => session.eventAt(seq)).filter(isHumanMessageEvent).filter((event) => event.seq < before);
  return {
    sessionId,
    hasMore: messages.length > 20,
    messages: messages.slice(-20).map((event) => {
      const content = readContent(event.data.content);
      const text = messageText(content);
      return {
        seq: event.seq,
        text: text.slice(0, 4e3),
        truncated: text.length > 4e3,
        attachmentCount: content.filter((block) => block.type !== "text").length
      };
    })
  };
}
function createOperations(deps) {
  const requests = /* @__PURE__ */ new Map();
  const lifetime = new AbortController();
  const operate = async (sessionValue, value, signal) => {
    lifetime.signal.throwIfAborted();
    const sessionId = requireSessionId(sessionValue);
    const request = requireRequest(value);
    if (request.action === "list") return listMessages(deps.sessions, sessionId, request.beforeSeq);
    if (request.action !== "edit") throw new Error("Invalid action.");
    const requestId = requireRequestId(request.requestId);
    const key = `${sessionId}:${requestId}`;
    const fingerprint = JSON.stringify([request.seq, request.originalText, request.text]);
    const previous = requests.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new Error("请求标识已用于另一项修改。 / Request id already used for another edit.");
      }
      return previous.promise;
    }
    const editSignal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    const promise = editAndSend(deps, sessionId, request, editSignal);
    requests.set(key, { fingerprint, promise });
    try {
      return await promise;
    } catch (error) {
      requests.delete(key);
      throw error;
    }
  };
  return {
    operate,
    dispose() {
      lifetime.abort(new Error("插件已卸载。 / Plugin unloaded."));
      requests.clear();
    }
  };
}

// src/host/registration.ts
function registerCommand(ctx, operate) {
  ctx.commands.register({
    name: EDIT_COMMAND,
    definitionId: `${PLUGIN_NAME}:edit`,
    description: "修改历史消息，移除其后全部对话并重新生成 / Edit history, discard everything after it and regenerate",
    input: { hint: '{"action":"list"} | {"action":"edit","seq":number,"originalText":string,"text":string,"requestId":string}' },
    handler: async ({ agent, rawInput, signal }) => {
      try {
        const result = await operate(agent.id, parseJson(rawInput), signal);
        return {
          kind: "success",
          text: JSON.stringify(result),
          ..."markerSeq" in result ? { sourceEventSeq: result.markerSeq } : {}
        };
      } catch (error) {
        return { kind: "error", text: errorMessage(error) };
      }
    }
  });
}
function registerTool(ctx, operate) {
  ctx.tools.register({
    name: "edit_sent_message",
    description: "List sent user messages, or edit one in an idle conversation, discard all later messages and regenerate in that same conversation. No branch is kept. Use the pencil in the UI to edit the current conversation after the agent finishes.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "edit"] },
        sessionId: { type: "string", description: "Required for edit: a different idle conversation. For list, defaults to the current conversation." },
        beforeSeq: { type: "integer", minimum: 0, description: "For list, return up to 20 messages before this sequence; omit for the latest." },
        seq: { type: "integer", minimum: 1, description: "Sequence of the sent user message to edit." },
        originalText: { type: "string", description: "Complete original text of the message, for edit." },
        text: { type: "string", description: "Revised message text, for edit. Original attachments are retained." },
        requestId: { type: "string", description: "For edit, a unique id of 8–128 letters, digits or hyphens. Reuse only when retrying the same edit." }
      },
      required: ["action"],
      additionalProperties: false
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
    },
    execute: async (args, exec) => {
      const request = requireRequest(args);
      if (request.action === "edit" && !request.sessionId) {
        throw new Error("编辑需要指定另一个空闲会话。当前会话请在回复结束后点击铅笔。 / Specify another idle conversation to edit; use the pencil for the current one after this reply.");
      }
      const targetId = request.sessionId ?? exec.agent?.id;
      if (request.action === "list") return operate(targetId, request, exec.signal);
      const sessionId = requireSessionId(targetId);
      const agent = ctx.agents.get(sessionId);
      if (!agent) throw new Error("请先打开会话。 / Open the conversation first.");
      const execution = await ctx.commands.execute(agent, `/${EDIT_COMMAND} ${JSON.stringify(request)}`, [], exec.signal);
      if (!execution || execution.result.kind === "error") {
        throw new Error(execution?.result.text ?? "Message editing failed.");
      }
      return parseJson(execution.result.text);
    },
    presentCall: (args) => ({
      card: "generic",
      title: isRecord(args) && args.action === "list" ? "查看可编辑消息 / List messages" : "编辑消息并重新生成 / Edit and regenerate"
    })
  });
}

// src/host/index.ts
var inject = ["commands", "tools", "sessions", "agents", "sessionController"];
function apply(ctx) {
  const operations = createOperations({
    sessions: ctx.sessions,
    agents: ctx.agents,
    controller: ctx.sessionController,
    on: ctx.on.bind(ctx)
  });
  ctx.effect(() => () => operations.dispose());
  ctx.provide("messagePencil", { operate: operations.operate });
  registerCommand(ctx, operations.operate);
  registerTool(ctx, operations.operate);
}
export {
  apply,
  inject
};

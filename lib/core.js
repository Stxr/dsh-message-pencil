// Generated from TypeScript by pnpm build. Edit src/, not this file.

// src/shared/protocol.ts
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
function eventStep(event) {
  return event && isRecord(event.data) ? event.data.step : void 0;
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
  return agent.runMaintenance(async (maintenanceSignal) => {
    signal?.throwIfAborted();
    maintenanceSignal.throwIfAborted();
    const seq = editSequence(request);
    const { content } = editTarget(source, request);
    const nodes = source.surface.nodes;
    const targetIndex = nodes.indexOf(seq);
    const removed = nodes.slice(targetIndex);
    const boundary = deps.agents.turnBoundaryOf(source);
    const step = eventStep(source.eventAt(boundary.lastStepStartSeq));
    const opening = source.snapshotEvents().findLast((item) => isTurnStartEvent(item) && item.seq < seq);
    const startSeq = removed[0];
    const endSeq = removed.at(-1);
    if (!opening || !isTurnStartEvent(opening) || typeof step !== "number" || !Number.isSafeInteger(step) || step < 1 || boundary.lastTurn < 1 || targetIndex < 0 || startSeq === void 0 || endSeq === void 0) {
      throw new Error(incompleteHistory);
    }
    const prefix = nodes.slice(0, targetIndex).filter((nodeSeq) => nodeSeq > opening.seq).map((nodeSeq) => {
      const item = source.eventAt(nodeSeq);
      if (!item) throw new Error(incompleteHistory);
      return item;
    });
    const keepFirstTurn = prefix.some((item) => item.type !== "system/message");
    const firstHuman = prefix.find(isHumanMessageEvent);
    const cut = {
      from: seq,
      fromTurn: opening.data.turn,
      lastTurn: boundary.lastTurn,
      keepFirstTurn,
      ...keepFirstTurn ? {
        keptPrompt: firstHuman ? messageText(firstHuman.data.content).replace(/\s+/g, " ").trim().slice(0, 50) : ""
      } : {}
    };
    let marker;
    let accepted = false;
    try {
      const requestId = isRecord(request) ? request.requestId : void 0;
      marker = source.append("developer/message", {
        turn: boundary.lastTurn,
        step,
        message: {
          id: `message-pencil-cut:${String(requestId)}`,
          role: "developer",
          content: [],
          source: { kind: "user" }
        }
      }, { surfaceOp: { op: "replace", startSeq, endSeq }, sourceEventSeqs: [...removed] });
      agent.inbox.clear();
      if (!await deps.sessions.flush(source)) throw new Error("未找到会话持久化服务。 / Session persistence is unavailable.");
      maintenanceSignal.throwIfAborted();
      signal?.throwIfAborted();
      agent.followup({ id: randomUUID(), role: "user", content, source: { kind: "user" } });
      accepted = true;
      if (!await deps.sessions.flush(source)) throw new Error("未找到会话持久化服务。 / Session persistence is unavailable.");
      return {
        sessionId,
        editedSeq: seq,
        markerSeq: marker.seq,
        cut: { ...cut, to: marker.seq },
        attachmentCount: content.filter((block) => block.type !== "text").length
      };
    } catch (error) {
      if (!marker) throw error;
      return {
        sessionId,
        editedSeq: seq,
        markerSeq: marker.seq,
        cut: { ...cut, to: marker.seq },
        historyChanged: true,
        accepted,
        error: errorMessage(error)
      };
    }
  });
}
export {
  editAndSend,
  editTarget,
  messageText,
  replaceText
};

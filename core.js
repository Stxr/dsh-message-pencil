import { randomUUID } from 'node:crypto';

/** Shared validation and edit operation used by the command and agent tool. */
export function messageText(content) {
  return content.filter(block => block.type === 'text').map(block => block.text).join('');
}

/** Replace text while retaining the order and bytes of image/file blocks. */
export function replaceText(content, text) {
  const unsupported = content.some(block => !['text', 'image', 'file'].includes(block.type));
  if (unsupported) throw new Error('此消息含暂不支持重新发送的内容。 / Unsupported message content.');
  let inserted = false;
  const next = [];
  for (const block of content) {
    if (block.type === 'text') {
      if (!inserted) { next.push({ type: 'text', text }); inserted = true; }
    } else next.push(structuredClone(block));
  }
  if (!inserted) next.push({ type: 'text', text });
  if (!text.trim() && !next.some(block => block.type === 'image' || block.type === 'file')) {
    throw new Error('消息不能为空。 / Message cannot be empty.');
  }
  return next;
}

/** Only human-authored, currently visible, committed messages can be edited. */
export function editTarget(session, request) {
  if (!Number.isSafeInteger(request.seq) || request.seq < 1) throw new Error('无效的消息位置。 / Invalid message sequence.');
  const event = session.eventAt(request.seq);
  if (!event || event.type !== 'user/message' || event.data.source?.kind !== 'user' || !session.surface.nodes.includes(request.seq)) {
    throw new Error('这条消息已变化或不可编辑，请刷新会话。 / Message is no longer editable; refresh the conversation.');
  }
  if (typeof request.text !== 'string' || typeof request.originalText !== 'string') throw new Error('缺少消息文本。 / Missing message text.');
  if (messageText(event.data.content) !== request.originalText) throw new Error('消息原文已变化，请重新打开编辑器。 / Original text changed; reopen the editor.');
  return { event, content: replaceText(event.data.content, request.text) };
}

/** Replace the current history suffix, then regenerate in the same conversation. */
export async function editAndSend(deps, sessionId, request, signal) {
  signal?.throwIfAborted();
  const source = deps.sessions.get(sessionId);
  if (!source) throw new Error('请先打开会话。 / Open the conversation first.');
  const state = await deps.controller.state({ sessionId }, signal ?? new AbortController().signal);
  if (state.running) throw new Error('请等待回复完成，或先停止生成。 / Wait for the reply to finish or stop generation first.');
  const agent = deps.agents.get(sessionId);
  if (!agent || typeof agent.runMaintenance !== 'function') throw new Error('当前会话暂不可编辑，请重新打开。 / Reopen the conversation to edit.');
  return agent.runMaintenance(async maintenanceSignal => {
    signal?.throwIfAborted();
    maintenanceSignal.throwIfAborted();
    const { content } = editTarget(source, request);
    const nodes = source.surface.nodes;
    const removed = nodes.slice(nodes.indexOf(request.seq));
    const boundary = deps.agents.turnBoundaryOf(source);
    const step = source.eventAt(boundary.lastStepStartSeq)?.data.step;
    const opening = source.snapshotEvents().findLast(event => event.type === 'turn/start' && event.seq < request.seq);
    if (!opening || !Number.isSafeInteger(step) || step < 1 || boundary.lastTurn < 1) throw new Error('会话轮次不完整，无法修改。 / The conversation has no complete step position.');
    const prefix = nodes.slice(0, nodes.indexOf(request.seq)).filter(seq => seq > opening.seq).map(seq => source.eventAt(seq));
    const keepFirstTurn = prefix.some(event => event.type !== 'system/message');
    const firstHuman = prefix.find(event => event.type === 'user/message' && event.data.source.kind === 'user');
    const cut = { from: request.seq, fromTurn: opening.data.turn, lastTurn: boundary.lastTurn, keepFirstTurn,
      ...(keepFirstTurn ? { keptPrompt: firstHuman ? messageText(firstHuman.data.content).replace(/\s+/g, ' ').trim().slice(0, 50) : '' } : {}) };
    let marker;
    let accepted = false;
    try {
      // An empty developer message changes the surface but derives to no model
      // message, avoiding an empty prompt or an artificial placeholder.
      marker = source.append('developer/message', {
        turn: boundary.lastTurn, step,
        message: { id: `message-pencil-cut:${request.requestId}`, role: 'developer', content: [], source: { kind: 'user' } },
      }, { surfaceOp: { op: 'replace', startSeq: removed[0], endSeq: removed.at(-1) }, sourceEventSeqs: [...removed] });
      agent.inbox.clear();
      if (!await deps.sessions.flush(source)) throw new Error('未找到会话持久化服务。 / Session persistence is unavailable.');
      maintenanceSignal.throwIfAborted();
      signal?.throwIfAborted();
      agent.followup({ id: randomUUID(), role: 'user', content, source: { kind: 'user' } });
      accepted = true;
      if (!await deps.sessions.flush(source)) throw new Error('未找到会话持久化服务。 / Session persistence is unavailable.');
      return { sessionId, editedSeq: request.seq, markerSeq: marker.seq, cut: { ...cut, to: marker.seq }, attachmentCount: content.filter(block => block.type !== 'text').length };
    } catch (error) {
      if (!marker) throw error;
      return { sessionId, editedSeq: request.seq, markerSeq: marker.seq, cut: { ...cut, to: marker.seq }, historyChanged: true, accepted,
        error: error instanceof Error ? error.message : String(error) };
    }
  });
}

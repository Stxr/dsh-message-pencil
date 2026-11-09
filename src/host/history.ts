import { randomUUID } from 'node:crypto';
import { errorMessage } from '../shared/protocol.js';
import type { EditCut, EditResult, MessageContent } from '../shared/protocol.js';
import { messageText, replaceText } from './content.js';
import type { EditDependencies, HostSession, HumanMessageEvent, SessionEvent } from './types.js';
import { editSequence, editText, eventStep, isHumanMessageEvent, isRecord, isTurnStartEvent } from './validation.js';

const incompleteHistory = '会话轮次不完整，无法修改。 / The conversation has no complete step position.';

/** 只允许修改当前 surface 上仍可见、已提交的人类消息。 */
export function editTarget(session: HostSession, request: unknown): { event: HumanMessageEvent; content: MessageContent } {
  const seq = editSequence(request);
  const event = session.eventAt(seq);
  if (!isHumanMessageEvent(event) || !session.surface.nodes.includes(seq)) {
    throw new Error('这条消息已变化或不可编辑，请刷新会话。 / Message is no longer editable; refresh the conversation.');
  }
  const { text, originalText } = editText(request);
  if (messageText(event.data.content) !== originalText) {
    throw new Error('消息原文已变化，请重新打开编辑器。 / Original text changed; reopen the editor.');
  }
  return { event, content: replaceText(event.data.content, text) };
}

/** 在同一会话内替换历史后缀，再提交新输入以重新生成。 */
export async function editAndSend(
  deps: EditDependencies,
  sessionId: string,
  request: unknown,
  signal?: AbortSignal,
): Promise<EditResult> {
  signal?.throwIfAborted();
  const source = deps.sessions.get(sessionId);
  if (!source) throw new Error('请先打开会话。 / Open the conversation first.');
  const state = await deps.controller.state({ sessionId }, signal ?? new AbortController().signal);
  if (state.running) throw new Error('请等待回复完成，或先停止生成。 / Wait for the reply to finish or stop generation first.');
  const agent = deps.agents.get(sessionId);
  if (!agent || typeof agent.runMaintenance !== 'function') {
    throw new Error('当前会话暂不可编辑，请重新打开。 / Reopen the conversation to edit.');
  }
  return agent.runMaintenance(async maintenanceSignal => {
    signal?.throwIfAborted();
    maintenanceSignal.throwIfAborted();
    const seq = editSequence(request);
    const { content } = editTarget(source, request);
    const nodes = source.surface.nodes;
    const targetIndex = nodes.indexOf(seq);
    const removed = nodes.slice(targetIndex);
    const boundary = deps.agents.turnBoundaryOf(source);
    const step = eventStep(source.eventAt(boundary.lastStepStartSeq));
    const opening = source.snapshotEvents().findLast(item => isTurnStartEvent(item) && item.seq < seq);
    const startSeq = removed[0];
    const endSeq = removed.at(-1);
    if (!opening || !isTurnStartEvent(opening) || typeof step !== 'number' || !Number.isSafeInteger(step)
      || step < 1 || boundary.lastTurn < 1 || targetIndex < 0 || startSeq === undefined || endSeq === undefined) {
      throw new Error(incompleteHistory);
    }
    const prefix = nodes.slice(0, targetIndex).filter(nodeSeq => nodeSeq > opening.seq).map(nodeSeq => {
      const item = source.eventAt(nodeSeq);
      if (!item) throw new Error(incompleteHistory);
      return item;
    });
    const keepFirstTurn = prefix.some(item => item.type !== 'system/message');
    const firstHuman = prefix.find(isHumanMessageEvent);
    const cut: Omit<EditCut, 'to'> = {
      from: seq,
      fromTurn: opening.data.turn,
      lastTurn: boundary.lastTurn,
      keepFirstTurn,
      ...(keepFirstTurn ? {
        keptPrompt: firstHuman ? messageText(firstHuman.data.content).replace(/\s+/g, ' ').trim().slice(0, 50) : '',
      } : {}),
    };
    let marker: SessionEvent | undefined;
    let accepted = false;
    try {
      // 空 developer 消息只替换 surface，不派生模型输入，也不制造占位提示词。
      const requestId = isRecord(request) ? request.requestId : undefined;
      marker = source.append('developer/message', {
        turn: boundary.lastTurn,
        step,
        message: {
          id: `message-pencil-cut:${String(requestId)}`,
          role: 'developer',
          content: [],
          source: { kind: 'user' },
        },
      }, { surfaceOp: { op: 'replace', startSeq, endSeq }, sourceEventSeqs: [...removed] });
      agent.inbox.clear();
      // 截断先落盘，再接收新输入；第二次 flush 失败时仍必须报告输入已接受。
      if (!await deps.sessions.flush(source)) throw new Error('未找到会话持久化服务。 / Session persistence is unavailable.');
      maintenanceSignal.throwIfAborted();
      signal?.throwIfAborted();
      agent.followup({ id: randomUUID(), role: 'user', content, source: { kind: 'user' } });
      accepted = true;
      if (!await deps.sessions.flush(source)) throw new Error('未找到会话持久化服务。 / Session persistence is unavailable.');
      return {
        sessionId,
        editedSeq: seq,
        markerSeq: marker.seq,
        cut: { ...cut, to: marker.seq },
        attachmentCount: content.filter(block => block.type !== 'text').length,
      };
    } catch (error) {
      // marker 追加后历史已改变，错误也作为成功命令的结果返回，供界面保留截断记录。
      if (!marker) throw error;
      return {
        sessionId,
        editedSeq: seq,
        markerSeq: marker.seq,
        cut: { ...cut, to: marker.seq },
        historyChanged: true,
        accepted,
        error: errorMessage(error),
      };
    }
  });
}

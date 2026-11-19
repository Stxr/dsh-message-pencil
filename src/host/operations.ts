import type { EditResult, ListResult } from '../shared/protocol.js';
import { messageText, readContent } from './content.js';
import { editAndSend } from './history.js';
import type { EditDependencies, Operate, SessionStore } from './types.js';
import { isHumanMessageEvent, requireRequest, requireRequestId, requireSessionId } from './validation.js';

function listMessages(sessions: SessionStore, sessionId: string, beforeSeq: unknown): ListResult {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('请先打开会话。 / Open the conversation first.');
  let before = Infinity;
  if (beforeSeq !== undefined) {
    if (typeof beforeSeq !== 'number' || !Number.isSafeInteger(beforeSeq) || beforeSeq < 0) {
      throw new Error('Invalid beforeSeq.');
    }
    before = beforeSeq;
  }
  // 只枚举当前 surface，已被替换的旧消息不会再次暴露为可编辑目标。
  const messages = session.surface.nodes.map(seq => session.eventAt(seq))
    .filter(isHumanMessageEvent).filter(event => event.seq < before);
  return {
    sessionId,
    hasMore: messages.length > 20,
    messages: messages.slice(-20).map(event => {
      const content = readContent(event.data.content);
      const text = messageText(content);
      return {
        seq: event.seq,
        text: text.slice(0, 4000),
        truncated: text.length > 4000,
        attachmentCount: content.filter(block => block.type !== 'text').length,
      };
    }),
  };
}

export function createOperations(deps: EditDependencies): { operate: Operate; dispose(): void } {
  const requests = new Map<string, { fingerprint: string; promise: Promise<EditResult> }>();
  const lifetime = new AbortController();
  const operate: Operate = async (sessionValue, value, signal) => {
    lifetime.signal.throwIfAborted();
    const sessionId = requireSessionId(sessionValue);
    const request = requireRequest(value);
    if (request.action === 'list') return listMessages(deps.sessions, sessionId, request.beforeSeq);
    if (request.action !== 'edit') throw new Error('Invalid action.');
    const requestId = requireRequestId(request.requestId);
    const key = `${sessionId}:${requestId}`;
    const fingerprint = JSON.stringify([request.seq, request.originalText, request.text]);
    const previous = requests.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new Error('请求标识已用于另一项修改。 / Request id already used for another edit.');
      }
      return previous.promise;
    }
    // 缓存运行中的 Promise，命令与工具并发重试也只能截断和发送一次。
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
      lifetime.abort(new Error('插件已卸载。 / Plugin unloaded.'));
      requests.clear();
    },
  };
}

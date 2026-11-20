import type { EditRequest } from '../shared/protocol.js';
import type { HumanMessageEvent, SessionEvent, TurnStartEvent } from './types.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireSessionId(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('缺少会话。 / Session is required.');
  return value;
}

export function requireRequest(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid action.');
  return value;
}

export function requireRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{8,128}$/.test(value)) throw new Error('Invalid requestId.');
  return value;
}

/** 文本和位置在维护锁内校验，避免预校验之后历史发生变化。 */
export function editSequence(request: unknown): number {
  const seq = isRecord(request) ? request.seq : undefined;
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) {
    throw new Error('无效的消息位置。 / Invalid message sequence.');
  }
  return seq;
}

export function editText(request: unknown): Pick<EditRequest, 'text' | 'originalText'> {
  if (!isRecord(request) || typeof request.text !== 'string' || typeof request.originalText !== 'string') {
    throw new Error('缺少消息文本。 / Missing message text.');
  }
  return { text: request.text, originalText: request.originalText };
}

export function isHumanMessageEvent(event: SessionEvent | undefined): event is HumanMessageEvent {
  return event?.type === 'user/message' && isRecord(event.data)
    && isRecord(event.data.source) && event.data.source.kind === 'user';
}

export function isTurnStartEvent(event: SessionEvent): event is TurnStartEvent {
  return event.type === 'turn/start' && isRecord(event.data)
    && typeof event.data.turn === 'number' && Number.isSafeInteger(event.data.turn) && event.data.turn >= 1;
}

/** JSON.parse 的结果始终以 unknown 进入后续校验。 */
export function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

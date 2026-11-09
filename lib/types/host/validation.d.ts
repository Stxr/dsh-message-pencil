import type { EditRequest } from '../shared/protocol.js';
import type { HumanMessageEvent, SessionEvent, TurnStartEvent } from './types.js';
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function requireSessionId(value: unknown): string;
export declare function requireRequest(value: unknown): Record<string, unknown>;
export declare function requireRequestId(value: unknown): string;
/** 文本和位置在维护锁内校验，避免预校验之后历史发生变化。 */
export declare function editSequence(request: unknown): number;
export declare function editText(request: unknown): Pick<EditRequest, 'text' | 'originalText'>;
export declare function isHumanMessageEvent(event: SessionEvent | undefined): event is HumanMessageEvent;
export declare function isTurnStartEvent(event: SessionEvent): event is TurnStartEvent;
export declare function eventStep(event: SessionEvent | undefined): unknown;
/** JSON.parse 的结果始终以 unknown 进入后续校验。 */
export declare function parseJson(text: string): unknown;

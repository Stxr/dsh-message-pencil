import type { MessageContent } from '../shared/protocol.js';
/** 历史数据也经过边界校验；未知块允许读取，但重新发送时明确拒绝。 */
export declare function readContent(value: unknown): MessageContent;
export declare function messageText(content: unknown): string;
/** 第一处文本替换为新正文；附件仍在原位置，完整克隆其原值。 */
export declare function replaceText(content: unknown, text: string): MessageContent;

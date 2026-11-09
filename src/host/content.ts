import { isTextBlock } from '../shared/protocol.js';
import type { MessageContent, UnknownBlock } from '../shared/protocol.js';
import { isRecord } from './validation.js';

const unsupportedContent = '此消息含暂不支持重新发送的内容。 / Unsupported message content.';

/** 历史数据也经过边界校验；未知块允许读取，但重新发送时明确拒绝。 */
export function readContent(value: unknown): MessageContent {
  if (!Array.isArray(value)) throw new Error(unsupportedContent);
  const blocks: unknown[] = value;
  return blocks.map((block): UnknownBlock => {
    if (!isRecord(block) || typeof block.type !== 'string'
      || (block.type === 'text' && typeof block.text !== 'string')) {
      throw new Error(unsupportedContent);
    }
    return { ...block, type: block.type };
  });
}

export function messageText(content: unknown): string {
  return readContent(content).filter(isTextBlock).map(block => block.text).join('');
}

/** 第一处文本替换为新正文；附件仍在原位置，完整克隆其原值。 */
export function replaceText(content: unknown, text: string): MessageContent {
  const blocks = readContent(content);
  if (blocks.some(block => !['text', 'image', 'file'].includes(block.type))) throw new Error(unsupportedContent);
  let inserted = false;
  const next: MessageContent = [];
  for (const block of blocks) {
    if (isTextBlock(block)) {
      if (!inserted) {
        next.push({ type: 'text', text });
        inserted = true;
      }
    } else {
      next.push(structuredClone(block));
    }
  }
  if (!inserted) next.push({ type: 'text', text });
  if (!text.trim() && !next.some(block => block.type === 'image' || block.type === 'file')) {
    throw new Error('消息不能为空。 / Message cannot be empty.');
  }
  return next;
}

import { isAttachmentBlock, isTextBlock } from '../shared/protocol';
import type { UserContent, UserMessageData } from './types';

/** 只做宿主 user-content Factory 的参数转换，附件渲染仍交给宿主。 */
export function splitUserContent(data: UserMessageData): UserContent {
  const content: UserContent = {
    text: '',
    attachments: [],
    extraBlocks: [],
    ...(data.referenceLabels ? { referenceLabels: data.referenceLabels } : {}),
  };

  for (const block of data.content) {
    if (isTextBlock(block)) {
      content.text += block.text;
    } else if (isAttachmentBlock(block)) {
      content.attachments.push(block.type === 'image'
        ? { type: 'image', image: { attachment: block.attachment } }
        : { type: 'file', file: block.attachment });
    } else {
      content.extraBlocks.push(block);
    }
  }

  return content;
}

import type { ComponentType, ReactNode } from 'react';
import type { Attachment, ContentBlock, EditRequest, EditResult, MessageContent } from '../shared/protocol';
import type { Translate } from './locales';

export interface UserMessageData {
  seq: number;
  messageId: string;
  content: MessageContent;
  source?: { kind: string };
  time?: number;
  referenceLabels?: unknown;
  skillNames?: unknown;
}

export interface UserContent {
  text: string;
  attachments: Array<
    | { type: 'image'; image: { attachment: Attachment } }
    | { type: 'file'; file: Attachment }
  >;
  extraBlocks: ContentBlock[];
  referenceLabels?: unknown;
}

export interface SessionState {
  running: boolean;
  pendingSubmissions: readonly unknown[];
  awaitingFirstTurn: boolean;
}

export interface UserMessageProps {
  node: { data: UserMessageData };
  t: Translate;
  useSession<T>(selector: (state: SessionState) => T): T;
  editMessage(request: EditRequest): Promise<EditResult>;
  renderFactorySlot(name: 'conversation.chat.user.content', props: {
    content: UserContent;
    facts: { sessionLabels?: unknown; skillNames?: unknown };
    interactive: boolean;
    loadImage: unknown;
  }): ReactNode;
  loadImage: unknown;
}

/** 命令视图只读取 outcome；完整的 ChatNode 类型由历史适配层隔离。 */
export interface CommandViewProps {
  node: { outcome?: { kind: string; text?: string } };
}

export type MessageComponent = ComponentType<UserMessageProps>;

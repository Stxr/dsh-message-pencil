/** Host、Client 和历史回放共用的消息编辑协议。这里不依赖 DSH 或 React。 */
export declare const PLUGIN_NAME = "@local/dsh-message-pencil";
export declare const EDIT_COMMAND = "message-edit";
/** 附件由宿主解释；编辑时只复制原值，不重建或重新上传。 */
export interface Attachment {
    attachmentId: string;
    name?: string;
    bytes?: number;
    [key: string]: unknown;
}
export interface TextBlock {
    type: 'text';
    text: string;
}
export interface ImageBlock {
    type: 'image';
    attachment: Attachment;
}
export interface FileBlock {
    type: 'file';
    attachment: Attachment;
}
/** 旧记录可能包含未来版本的内容块，必须保留并在编辑前拒绝。 */
export interface UnknownBlock {
    type: string;
    [key: string]: unknown;
}
export type ContentBlock = TextBlock | ImageBlock | FileBlock | UnknownBlock;
export type MessageContent = ContentBlock[];
export declare function isTextBlock(block: ContentBlock): block is TextBlock;
export declare function isAttachmentBlock(block: ContentBlock): block is ImageBlock | FileBlock;
export interface ListRequest {
    action: 'list';
    sessionId?: string;
    beforeSeq?: number;
}
export interface EditRequest {
    action: 'edit';
    sessionId?: string;
    seq: number;
    originalText: string;
    text: string;
    requestId: string;
}
export type MessageRequest = ListRequest | EditRequest;
/** 同时用于模型 surface 截断结果和 Client 的历史/提纲过滤。 */
export interface EditCut {
    from: number;
    to: number;
    fromTurn: number;
    lastTurn: number;
    keepFirstTurn: boolean;
    keptPrompt?: string;
}
export interface EditResult {
    sessionId: string;
    editedSeq: number;
    markerSeq: number;
    cut: EditCut;
    attachmentCount?: number;
    historyChanged?: boolean;
    accepted?: boolean;
    error?: string;
}
export interface ListedMessage {
    seq: number;
    text: string;
    truncated: boolean;
    attachmentCount: number;
}
export interface ListResult {
    sessionId: string;
    hasMore: boolean;
    messages: ListedMessage[];
}
export type MessageResult = EditResult | ListResult;
export declare function errorMessage(error: unknown): string;

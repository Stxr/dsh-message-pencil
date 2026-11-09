import type { EditResult, MessageContent } from '../shared/protocol.js';
import type { EditDependencies, HostSession, HumanMessageEvent } from './types.js';
/** 只允许修改当前 surface 上仍可见、已提交的人类消息。 */
export declare function editTarget(session: HostSession, request: unknown): {
    event: HumanMessageEvent;
    content: MessageContent;
};
/** 在同一会话内替换历史后缀，再提交新输入以重新生成。 */
export declare function editAndSend(deps: EditDependencies, sessionId: string, request: unknown, signal?: AbortSignal): Promise<EditResult>;

import type { EditRequest, EditResult } from '../shared/protocol';
import type { ClientContext } from './context';
/** 唯一的 UI→Host 通道；与 Agent 工具共用同一个 /message-edit 命令。 */
export declare function createMessageEditor(ctx: ClientContext, sessionId: string, unavailable: () => string): (request: EditRequest) => Promise<EditResult>;

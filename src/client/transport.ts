import { EDIT_COMMAND } from '../shared/protocol';
import type { EditRequest, EditResult } from '../shared/protocol';
import type { ClientContext } from './context';

/** 唯一的 UI→Host 通道；与 Agent 工具共用同一个 /message-edit 命令。 */
export function createMessageEditor(ctx: ClientContext, sessionId: string, unavailable: () => string) {
  return async (request: EditRequest): Promise<EditResult> => {
    const binding = ctx.sessions.binding(sessionId);
    if (!binding) throw new Error(unavailable());
    const response = await binding.ctx.remote.commands.execute(
      `/${EDIT_COMMAND} ${JSON.stringify(request)}`, [], new AbortController().signal,
    );
    if (!response.ok) throw new Error(response.error.message);
    if (!response.value || response.value.result.kind === 'error') {
      throw new Error(response.value?.result.text ?? unavailable());
    }
    // 这里的对端是同版本 Host 命令，历史日志的宽松解析另由 history/results 管理。
    return JSON.parse(response.value.result.text) as EditResult;
  };
}

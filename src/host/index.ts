import { createOperations } from './operations.js';
import { registerCommand, registerTool } from './registration.js';
import type { HostContext } from './types.js';

export const inject = ['commands', 'tools', 'sessions', 'agents', 'sessionController'];

/** 命令、工具和 Client RPC 共用同一操作与去重状态。 */
export function apply(ctx: HostContext): void {
  const operations = createOperations({
    sessions: ctx.sessions,
    agents: ctx.agents,
    controller: ctx.sessionController,
  });
  ctx.effect(() => () => operations.dispose());
  ctx.provide('messagePencil', { operate: operations.operate });
  registerCommand(ctx, operations.operate);
  registerTool(ctx, operations.operate);
}

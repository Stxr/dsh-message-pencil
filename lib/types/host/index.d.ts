import type { HostContext } from './types.js';
export declare const inject: string[];
/** 命令、工具和 Client RPC 共用同一操作与去重状态。 */
export declare function apply(ctx: HostContext): void;

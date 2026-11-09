import type { ClientContext } from './context';
/** Client 源码入口；构建器将导出交给 DSH 的 ModuleLoader factory。 */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;

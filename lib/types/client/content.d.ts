import type { UserContent, UserMessageData } from './types';
/** 只做宿主 user-content Factory 的参数转换，附件渲染仍交给宿主。 */
export declare function splitUserContent(data: UserMessageData): UserContent;

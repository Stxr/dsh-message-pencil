/** Same-session edit history adaptation; no DOM or event-log mutation. */
export { editResult, editResultField } from './results.js';
export { cutsOf, removedTurn, filterOutline } from './cuts.js';
export { EditVisibilityBuilder, decorateChatDefinition } from './builder.js';
export { installEditVisibility } from './install.js';
export type {
  DecoratedChatSnapshot, Dispose, HistoryApplyInput, HistoryChatBuilder, HistoryChatComponent,
  HistoryChatNode, HistoryChatSnapshot, HistoryChatViewProps, HistoryContext, HistoryLegacyNode,
  HistoryNodeLocation, HistoryOutlineItem, HistoryReplaceInput, HistoryViewDefinition, HistoryViewEntry,
} from './types.js';

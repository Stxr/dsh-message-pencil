import type { EditCut } from '../../shared/protocol.js';
import type { HistoryChatNode, HistoryOutlineItem } from './types.js';
/** Keep the original cut validation; optional preview fields are not revalidated. */
export declare function cutsOf(commands: Iterable<Pick<HistoryChatNode, 'kind' | 'data'>>): EditCut[];
export declare function removedTurn(turn: unknown, cuts: readonly EditCut[]): boolean;
export declare function filterOutline<Item extends HistoryOutlineItem>(outline: readonly Item[], cuts: readonly EditCut[]): readonly Item[];
export declare function filterOutline(outline: unknown, cuts: readonly EditCut[]): unknown;

import type { EditResult } from '../../shared/protocol.js';
import type { HistoryChatNode } from './types.js';
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function isEditCommand(node: Pick<HistoryChatNode, 'kind' | 'data'>): boolean;
/** Parse successful edit-command output, including output from older versions. */
export declare function editResult(node: Pick<HistoryChatNode, 'kind' | 'data'>): unknown;
/** Optional protocol fields remain unknown until the consumer validates them. */
export declare function editResultField(result: unknown, key: keyof EditResult): unknown;

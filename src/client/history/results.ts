import { EDIT_COMMAND } from '../../shared/protocol.js';
import type { EditResult } from '../../shared/protocol.js';
import type { HistoryChatNode } from './types.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isEditCommand(node: Pick<HistoryChatNode, 'kind' | 'data'>): boolean {
  return node.kind === 'command' && isRecord(node.data) && node.data.name === EDIT_COMMAND;
}

/** Parse successful edit-command output, including output from older versions. */
export function editResult(node: Pick<HistoryChatNode, 'kind' | 'data'>): unknown {
  if (!isEditCommand(node) || !isRecord(node.data)) return undefined;
  const outcome = node.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== 'success') return undefined;
  try {
    // The command protocol is JSON, but historical commands need not contain a
    // complete EditResult. Consumers validate only the fields they actually use.
    return JSON.parse(outcome.text as string) as unknown;
  } catch {
    // Other command versions may have human-readable output.
    return undefined;
  }
}

/** Optional protocol fields remain unknown until the consumer validates them. */
export function editResultField(result: unknown, key: keyof EditResult): unknown {
  return isRecord(result) ? result[key] : undefined;
}

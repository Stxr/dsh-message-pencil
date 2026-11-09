import type { EditCut } from '../../shared/protocol.js';
import { editResult, editResultField, isRecord } from './results.js';
import type { HistoryChatNode, HistoryOutlineItem } from './types.js';

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isEditCut(value: unknown): value is EditCut {
  if (!isRecord(value)) return false;
  return isSafeInteger(value.from) && isSafeInteger(value.to)
    && isSafeInteger(value.fromTurn) && isSafeInteger(value.lastTurn)
    && value.from <= value.to && value.fromTurn >= 1 && value.fromTurn <= value.lastTurn
    && typeof value.keepFirstTurn === 'boolean';
}

/** Keep the original cut validation; optional preview fields are not revalidated. */
export function cutsOf(commands: Iterable<Pick<HistoryChatNode, 'kind' | 'data'>>): EditCut[] {
  const cuts: EditCut[] = [];
  for (const node of commands) {
    const cut = editResultField(editResult(node), 'cut');
    if (isEditCut(cut)) cuts.push(cut);
  }
  return cuts;
}

export function removedTurn(turn: unknown, cuts: readonly EditCut[]): boolean {
  return isSafeInteger(turn) && cuts.some(cut =>
    turn >= cut.fromTurn + (cut.keepFirstTurn ? 1 : 0) && turn <= cut.lastTurn);
}

export function filterOutline<Item extends HistoryOutlineItem>(
  outline: readonly Item[], cuts: readonly EditCut[],
): readonly Item[];
export function filterOutline(outline: unknown, cuts: readonly EditCut[]): unknown;
export function filterOutline(outline: unknown, cuts: readonly EditCut[]): unknown {
  if (!Array.isArray(outline) || !cuts.length) return outline;
  // The native turnOutline projection supplies these records. Other projection
  // keys and an absent outline pass through without changing their identity.
  const items = outline as readonly HistoryOutlineItem[];
  return items.filter(item => !removedTurn(item.turn, cuts)).map(item => {
    const retained = cuts.findLast(cut => cut.keepFirstTurn && cut.fromTurn === item.turn);
    return retained ? { ...item, prompt: retained.keptPrompt ?? '', response: '' } : item;
  });
}

import type * as React from 'react';
import type { EditCut } from '../../shared/protocol.js';

export type Dispose = () => void;

/** Only the native location coordinates that history visibility reads. */
export interface HistoryNodeLocation {
  readonly kind?: string;
  readonly turn?: { readonly turn: number };
}

/** DSH Chat nodes keep renderer-specific payloads opaque at this boundary. */
export interface HistoryChatNode {
  readonly key: string;
  readonly kind: string;
  readonly anchorSeq: number;
  readonly visibility: 'visible' | 'hidden';
  readonly location?: HistoryNodeLocation;
  readonly data: unknown;
}

export interface HistoryLegacyNode {
  readonly kind: string;
  readonly seq: number;
  readonly turn?: number;
  readonly name?: string;
}

export interface HistoryChatSnapshot {
  readonly legacy?: { readonly nodes: readonly HistoryLegacyNode[] };
  readonly messagePencilCuts?: readonly EditCut[];
}

export type DecoratedChatSnapshot<Snapshot extends HistoryChatSnapshot> = Snapshot & {
  readonly messagePencilCuts: readonly EditCut[];
};

export interface HistoryReplaceInput<Node extends HistoryChatNode, Timeline> {
  readonly nodes: readonly Node[];
  readonly timeline: Timeline;
  readonly changedTurns?: readonly number[];
}

export interface HistoryApplyInput<Node extends HistoryChatNode, Timeline> {
  readonly upserts: readonly Node[];
  readonly timeline: Timeline;
  readonly changedTurns?: readonly number[];
}

/** Native grouping and timeline values pass through without interpretation. */
export interface HistoryChatBuilder<
  Node extends HistoryChatNode = HistoryChatNode,
  Snapshot extends HistoryChatSnapshot = HistoryChatSnapshot,
  Timeline = unknown,
  GroupInput = unknown,
> {
  readonly empty: Snapshot;
  replace(input: HistoryReplaceInput<Node, Timeline>): Snapshot;
  apply(input: HistoryApplyInput<Node, Timeline>): Snapshot;
  groupInput(): GroupInput;
  publish?(): void;
}

/** Registry factories erase their target-specific builder and snapshot types. */
export interface HistoryViewDefinition {
  readonly target: string;
  create(): unknown;
}

/** The native slot registry also stores components as unknown. */
export interface HistoryViewEntry {
  readonly options: { readonly id?: string };
  component: unknown;
}

export interface HistoryOutlineItem {
  readonly turn: number;
  readonly prompt?: string;
  readonly response?: string;
}

/** Only these two injected hooks are changed or read by the Chat wrapper. */
export interface HistoryChatViewProps {
  useChat<Value>(selector: (snapshot: HistoryChatSnapshot) => Value): Value;
  useProjection(key: string): unknown;
}

export type HistoryChatComponent = React.ComponentType<HistoryChatViewProps>;

/** Client contexts can extend this subset without importing DSH internals. */
export interface HistoryContext {
  readonly uiConversation: {
    readonly views: {
      entries(): Iterable<HistoryViewDefinition>;
      subscribe(listener: () => void): Dispose;
    };
    binding(sessionId: string): { rebuild(): void };
  };
  readonly sessions: {
    readonly list?: { getSnapshot(): { readonly ids: readonly string[] } | undefined };
    binding(sessionId: string): unknown;
  };
  readonly slots: {
    entries(key: 'conversation.view'): Iterable<HistoryViewEntry>;
  };
  on(event: 'slots/changed', listener: (key: string) => void): Dispose;
  effect(execute: () => Dispose): unknown;
}

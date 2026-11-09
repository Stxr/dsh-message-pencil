import type * as React from 'react';
import type { EditCut } from '../../shared/protocol.js';
import { decorateChatDefinition } from './builder.js';
import { filterOutline } from './cuts.js';
import type {
  Dispose, HistoryChatComponent, HistoryChatViewProps, HistoryContext,
  HistoryViewDefinition, HistoryViewEntry,
} from './types.js';

type ReactRuntime = typeof React;
const EMPTY_EDIT_CUTS: readonly EditCut[] = Object.freeze([]);

interface ComponentPatch {
  readonly original: unknown;
  readonly wrapper: HistoryChatComponent;
}

/** Keep DSH's native renderers, selectors, grouping and paging machinery. */
export function installEditVisibility(ctx: HistoryContext, React: ReactRuntime): (sessionId: string) => void {
  const ui = ctx.uiConversation;
  if (!ui?.views?.entries || !ui?.binding || !ctx.slots.entries) {
    throw new Error('Message editing requires the DSH 0.2.2 Chat registry.');
  }
  const definitions = new Map<HistoryViewDefinition, Dispose>();
  const entries = new Map<HistoryViewEntry, ComponentPatch>();
  const known = new Set<string>();
  let stopped = false;
  let unsubscribe: Dispose = () => {};
  let slotChanged: Dispose = () => {};

  function rebuild(): void {
    const ids = ctx.sessions.list?.getSnapshot()?.ids ?? [];
    for (const id of new Set([...ids, ...known])) {
      // Looking up a Conversation binding can retain a Session. Only rebuild
      // sessions whose native Session binding is still retained.
      if (ctx.sessions.binding(id)) ui.binding(id).rebuild();
    }
  }

  function ensure(): void {
    let changed = false;
    for (const definition of ui.views.entries()) {
      if (definition.target !== 'chat' || definitions.has(definition)) continue;
      definitions.set(definition, decorateChatDefinition(definition));
      changed = true;
    }
    for (const entry of ctx.slots.entries('conversation.view')) {
      if (entry.options.id !== 'chat' || entries.has(entry)) continue;
      const original = entry.component;
      function ChatWithEditedOutline(props: HistoryChatViewProps): React.ReactElement {
        const cuts = props.useChat(snapshot => snapshot.messagePencilCuts ?? EMPTY_EDIT_CUTS);
        const projection = React.useMemo(() => {
          let previous: unknown;
          let projected: unknown;
          return (key: string): unknown => {
            const value = props.useProjection(key);
            if (key !== 'turnOutline') return value;
            if (value !== previous) {
              previous = value;
              projected = filterOutline(value, cuts);
            }
            return projected;
          };
        }, [props.useProjection, cuts]);
        // Native StoredEntry erases the component type. The checked Chat slot
        // identity supplies these hook props; all other props pass through.
        return React.createElement(original as HistoryChatComponent, { ...props, useProjection: projection });
      }
      entry.component = ChatWithEditedOutline;
      entries.set(entry, { original, wrapper: ChatWithEditedOutline });
    }
    if (changed) rebuild();
  }

  // Own restoration before the first mutation: startup can fail during rebuild.
  ctx.effect(() => () => {
    stopped = true;
    unsubscribe();
    slotChanged();
    for (const restore of definitions.values()) restore();
    for (const [entry, patch] of entries) {
      if (entry.component === patch.wrapper) entry.component = patch.original;
    }
    rebuild();
    definitions.clear();
    entries.clear();
    known.clear();
  });
  ensure();
  unsubscribe = ui.views.subscribe(ensure);
  slotChanged = ctx.on('slots/changed', key => {
    if (key === 'conversation.view' && !stopped) ensure();
  });
  return sessionId => {
    if (known.has(sessionId)) return;
    known.add(sessionId);
    queueMicrotask(() => {
      if (!stopped && ctx.sessions.binding(sessionId)) ui.binding(sessionId).rebuild();
    });
  };
}

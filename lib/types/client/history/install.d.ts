import type * as React from 'react';
import type { HistoryContext } from './types.js';
type ReactRuntime = typeof React;
/** Keep DSH's native renderers, selectors, grouping and paging machinery. */
export declare function installEditVisibility(ctx: HistoryContext, React: ReactRuntime): (sessionId: string) => void;
export {};

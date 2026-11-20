import type { EditEvents, HostAgent, RequestPosition, SessionEvent, UserMessage } from './types.js';
/** Queue a resend under maintenance, then cut in the open step that claims it. */
export declare function deferCut(events: EditEvents, agent: HostAgent, message: UserMessage, append: (position: RequestPosition) => SessionEvent, flush: () => Promise<void>, signal?: AbortSignal): {
    readonly marker: SessionEvent | undefined;
    dispose: () => void;
    wait(): Promise<SessionEvent>;
};

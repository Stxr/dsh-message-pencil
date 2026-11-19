import type { MessageContent, MessageResult, TextBlock } from '../shared/protocol.js';
/** 只描述本插件实际调用的 DSH 能力，避免绑定宿主的内部实现类型。 */
export interface SessionEvent {
    seq: number;
    type: string;
    data: unknown;
}
export interface HumanMessageEvent extends SessionEvent {
    type: 'user/message';
    data: {
        source: {
            kind: 'user';
        };
        content: unknown;
    };
}
export interface TurnStartEvent extends SessionEvent {
    type: 'turn/start';
    data: {
        turn: number;
    };
}
export interface UserMessage {
    id: string;
    role: 'user';
    content: MessageContent;
    source: {
        kind: 'user';
    };
}
export interface CutMarkerData {
    turn: number;
    step: number;
    message: {
        id: string;
        role: 'developer';
        content: [];
        source: {
            kind: 'user';
        };
    };
}
export interface ReplaceIntent {
    surfaceOp: {
        op: 'replace';
        startSeq: number;
        endSeq: number;
    };
    sourceEventSeqs: number[];
}
export interface HostSession {
    surface: {
        nodes: readonly number[];
    };
    eventAt(seq: number): SessionEvent | undefined;
    snapshotEvents(): readonly SessionEvent[];
    append(type: 'developer/message', data: CutMarkerData, intent: ReplaceIntent): SessionEvent;
}
export interface HostAgent {
    id: string;
    inbox: {
        clear(): void;
        remove(messageId: string): boolean;
    };
    runMaintenance?<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>;
    whenIdle(): Promise<void>;
    cancel(cause: {
        kind: 'user';
    }, options: {
        keepInbox: true;
    }): void;
    followup(message: UserMessage): unknown;
}
export interface SessionStore {
    get(sessionId: string): HostSession | undefined;
    flush(session: HostSession): boolean | Promise<boolean>;
}
export interface AgentStore {
    get(sessionId: string): HostAgent | undefined;
    turnBoundaryOf(session: HostSession): {
        lastTurn: number;
    };
}
export interface SessionController {
    state(input: {
        sessionId: string;
    }, signal: AbortSignal): Promise<{
        running: boolean;
    }>;
}
export interface RequestPosition {
    agent: HostAgent;
    turn: number;
    step: number;
    signal: AbortSignal;
}
export interface ClaimedInput {
    agent: HostAgent;
    turn: number;
    message: {
        id: string;
    };
}
export interface EditEvents {
    on(event: 'agent/inbox/claimed', listener: (input: ClaimedInput) => void): () => void;
    on(event: 'agent/request', listener: (position: RequestPosition, next: () => Promise<unknown>) => Promise<unknown>): () => void;
}
export interface EditDependencies extends EditEvents {
    sessions: SessionStore;
    agents: AgentStore;
    controller: SessionController;
}
export type Operate = (sessionId: unknown, request: unknown, signal?: AbortSignal) => Promise<MessageResult>;
export interface CommandOutcome {
    kind: 'success' | 'error';
    text: string;
    sourceEventSeq?: number;
}
export interface CommandDefinition {
    name: string;
    definitionId: string;
    description: string;
    input: {
        hint: string;
    };
    handler(input: {
        agent: Pick<HostAgent, 'id'>;
        rawInput: string;
        signal?: AbortSignal;
    }): Promise<CommandOutcome>;
}
export interface CommandService {
    register(definition: CommandDefinition): unknown;
    execute(agent: HostAgent, line: string, attachments: readonly unknown[], signal?: AbortSignal): Promise<{
        result: CommandOutcome;
    } | undefined>;
}
export interface ToolExecution {
    agent?: Pick<HostAgent, 'id'>;
    signal?: AbortSignal;
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: {
        schema: Record<string, unknown>;
        render(args: unknown, value: unknown): TextBlock[];
    };
    execute(args: unknown, execution: ToolExecution): Promise<unknown>;
    presentCall(args: unknown): {
        card: 'generic';
        title: string;
    };
}
export interface HostContext extends EditEvents {
    sessions: SessionStore;
    agents: AgentStore;
    sessionController: SessionController;
    commands: CommandService;
    tools: {
        register(definition: ToolDefinition): unknown;
    };
    effect(factory: () => () => void): unknown;
    provide(name: 'messagePencil', service: {
        operate: Operate;
    }): unknown;
}

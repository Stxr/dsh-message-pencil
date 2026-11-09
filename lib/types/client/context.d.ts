import type { ComponentType } from 'react';
import type { HistoryContext, Dispose } from './history';
import type { Translate } from './locales';
export interface CommandOutcome {
    kind: string;
    text: string;
}
type CommandResponse = {
    ok: true;
    value?: {
        result: CommandOutcome;
    };
} | {
    ok: false;
    error: {
        message: string;
    };
};
export interface SessionBinding {
    ctx: {
        remote: {
            commands: {
                execute(line: string, attachments: readonly unknown[], signal: AbortSignal): Promise<CommandResponse>;
            };
        };
    };
}
interface SlotOptions {
    name: 'shell.overlay' | 'conversation.chat.commandview' | 'conversation.chat.node';
    id?: string;
    key?: string;
    order?: number;
    priority?: number;
    locale?: string;
    inject?: (sessionId: string) => unknown;
}
/** 仅声明本插件需要的宿主服务，私有 Chat 接口集中在 history/。 */
export interface ClientContext extends HistoryContext {
    readonly sessions: Omit<HistoryContext['sessions'], 'binding'> & {
        binding(sessionId: string): SessionBinding | undefined;
    };
    readonly slots: HistoryContext['slots'] & {
        register<Props>(options: SlotOptions, component: ComponentType<Props>): Dispose;
        inject(name: SlotOptions['name'], register: () => Dispose | Iterable<Dispose>): void;
    };
    readonly locale: {
        register(namespace: string, language: string, dictionary: Record<string, string>): Dispose;
        bind(namespace: string): Translate;
    };
}
export {};

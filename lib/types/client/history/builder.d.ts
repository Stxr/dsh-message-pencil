import type { DecoratedChatSnapshot, Dispose, HistoryApplyInput, HistoryChatBuilder, HistoryChatNode, HistoryChatSnapshot, HistoryReplaceInput, HistoryViewDefinition } from './types.js';
/** Version-checked adapter around DSH 0.2.2's registered Chat snapshot builder. */
export declare class EditVisibilityBuilder<Node extends HistoryChatNode = HistoryChatNode, Snapshot extends HistoryChatSnapshot = HistoryChatSnapshot, Timeline = unknown, GroupInput = unknown> {
    private readonly inner;
    private readonly originals;
    private readonly commands;
    private cuts;
    private signature;
    readonly empty: DecoratedChatSnapshot<Snapshot>;
    constructor(inner: HistoryChatBuilder<Node, Snapshot, Timeline, GroupInput>);
    private decorate;
    private remember;
    private refreshCuts;
    replace(input: HistoryReplaceInput<Node, Timeline>): DecoratedChatSnapshot<Snapshot>;
    apply(input: HistoryApplyInput<Node, Timeline>): DecoratedChatSnapshot<Snapshot>;
    groupInput(): GroupInput;
    publish(): void;
}
/** Preserve other wrappers and restore the exact factory on unload. */
export declare function decorateChatDefinition(definition: HistoryViewDefinition): Dispose;

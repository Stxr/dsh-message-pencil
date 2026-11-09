import { EDIT_COMMAND } from '../../shared/protocol.js';
import type { EditCut } from '../../shared/protocol.js';
import { cutsOf, removedTurn } from './cuts.js';
import { editResult, editResultField, isEditCommand, isRecord } from './results.js';
import type {
  DecoratedChatSnapshot, Dispose, HistoryApplyInput, HistoryChatBuilder, HistoryChatNode,
  HistoryChatSnapshot, HistoryReplaceInput, HistoryViewDefinition,
} from './types.js';

function turnOf(node: HistoryChatNode): unknown {
  return node.location?.turn?.turn ?? (isRecord(node.data) ? node.data.turn : undefined);
}

function hidden<Node extends HistoryChatNode>(node: Node): Node {
  return node.visibility === 'hidden' ? node : { ...node, visibility: 'hidden' };
}

function conceal<Node extends HistoryChatNode>(node: Node, cuts: readonly EditCut[]): Node {
  if (isEditCommand(node)) return editResultField(editResult(node), 'error') ? node : hidden(node);
  return cuts.some(cut => node.anchorSeq >= cut.from && node.anchorSeq <= cut.to)
    || removedTurn(turnOf(node), cuts) ? hidden(node) : node;
}

function assertChatBuilder(value: unknown): asserts value is HistoryChatBuilder {
  if (!isRecord(value) || typeof value.replace !== 'function'
    || typeof value.apply !== 'function' || typeof value.groupInput !== 'function') {
    throw new Error('Unsupported Chat builder; message editing cannot safely hide history.');
  }
}

/** Version-checked adapter around DSH 0.2.2's registered Chat snapshot builder. */
export class EditVisibilityBuilder<
  Node extends HistoryChatNode = HistoryChatNode,
  Snapshot extends HistoryChatSnapshot = HistoryChatSnapshot,
  Timeline = unknown,
  GroupInput = unknown,
> {
  private readonly originals = new Map<string, Node>();
  private readonly commands = new Map<string, Node>();
  private cuts: EditCut[] = [];
  private signature = '[]';
  readonly empty: DecoratedChatSnapshot<Snapshot>;

  constructor(private readonly inner: HistoryChatBuilder<Node, Snapshot, Timeline, GroupInput>) {
    assertChatBuilder(inner);
    this.empty = this.decorate(inner.empty);
  }

  private decorate(snapshot: Snapshot): DecoratedChatSnapshot<Snapshot> {
    const legacy = snapshot.legacy;
    if (!legacy || !this.cuts.length) return { ...snapshot, messagePencilCuts: this.cuts };
    // Hidden settled assistants can still contribute native legacy rows. Filter
    // that compatibility slice as well as concealing the original Chat nodes.
    const nodes = legacy.nodes.filter(node => !(node.kind === 'command' && node.name === EDIT_COMMAND)
      && !this.cuts.some(cut => node.seq >= cut.from && node.seq <= cut.to)
      && !removedTurn(node.turn, this.cuts));
    return { ...snapshot, legacy: { ...legacy, nodes }, messagePencilCuts: this.cuts };
  }

  private remember(node: Node): void {
    this.originals.set(node.key, node);
    if (node.kind === 'command') this.commands.set(node.key, node);
    else this.commands.delete(node.key);
  }

  private refreshCuts(): boolean {
    const next = cutsOf(this.commands.values());
    const signature = JSON.stringify(next);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.cuts = next;
    return true;
  }

  replace(input: HistoryReplaceInput<Node, Timeline>): DecoratedChatSnapshot<Snapshot> {
    this.originals.clear();
    this.commands.clear();
    for (const node of input.nodes) this.remember(node);
    this.refreshCuts();
    return this.decorate(this.inner.replace({
      ...input,
      nodes: [...this.originals.values()].map(node => conceal(node, this.cuts)),
    }));
  }

  apply(input: HistoryApplyInput<Node, Timeline>): DecoratedChatSnapshot<Snapshot> {
    let commandChanged = false;
    for (const node of input.upserts) {
      commandChanged ||= node.kind === 'command' || this.commands.has(node.key);
      this.remember(node);
    }
    if (commandChanged && this.refreshCuts()) {
      // A changed cut must revisit previously loaded nodes, including nodes
      // concealed by a cut that was just removed or replaced.
      return this.decorate(this.inner.replace({
        nodes: [...this.originals.values()].map(node => conceal(node, this.cuts)),
        timeline: input.timeline,
      }));
    }
    return this.decorate(this.inner.apply({
      ...input,
      upserts: input.upserts.map(node => conceal(node, this.cuts)),
    }));
  }

  groupInput(): GroupInput { return this.inner.groupInput(); }
  publish(): void { this.inner.publish?.(); }
}

/** Preserve other wrappers and restore the exact factory on unload. */
export function decorateChatDefinition(definition: HistoryViewDefinition): Dispose {
  if (!definition || definition.target !== 'chat' || typeof definition.create !== 'function') {
    throw new Error('Chat view is unavailable.');
  }
  const original = definition.create;
  function create(): EditVisibilityBuilder {
    // The registry erases builder types; the constructor checks this native
    // interface before reading its snapshot or invoking any builder methods.
    return new EditVisibilityBuilder(original.call(definition) as HistoryChatBuilder);
  }
  definition.create = create;
  return () => { if (definition.create === create) definition.create = original; };
}

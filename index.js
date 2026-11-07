import { editAndSend, messageText } from './core.js';

export const inject = ['commands', 'tools', 'sessions', 'agents', 'sessionController'];

/** Register the shared operation, its UI command and its discoverable agent tool. */
export function apply(ctx) {
  const requests = new Map();
  let disposed = false;
  ctx.effect(() => () => { disposed = true; requests.clear(); });
  const deps = { sessions: ctx.sessions, agents: ctx.agents, controller: ctx.sessionController };
  async function operate(sessionId, request, signal) {
    if (disposed) throw new Error('插件已卸载。 / Plugin unloaded.');
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('缺少会话。 / Session is required.');
    if (request.action === 'list') {
      const session = ctx.sessions.get(sessionId);
      if (!session) throw new Error('请先打开会话。 / Open the conversation first.');
      const before = request.beforeSeq ?? Infinity;
      if (request.beforeSeq !== undefined && (!Number.isSafeInteger(before) || before < 0)) throw new Error('Invalid beforeSeq.');
      const messages = session.surface.nodes.map(seq => session.eventAt(seq)).filter(event => event && event.seq < before && event.type === 'user/message' && event.data.source?.kind === 'user');
      return { sessionId, hasMore: messages.length > 20, messages: messages.slice(-20).map(event => ({
        seq: event.seq, text: messageText(event.data.content).slice(0, 4000),
        truncated: messageText(event.data.content).length > 4000,
        attachmentCount: event.data.content.filter(block => block.type !== 'text').length,
      })) };
    }
    if (request.action !== 'edit') throw new Error('Invalid action.');
    if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,128}$/.test(request.requestId)) throw new Error('Invalid requestId.');
    const key = `${sessionId}:${request.requestId}`;
    const fingerprint = JSON.stringify([request.seq, request.originalText, request.text]);
    const previous = requests.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('请求标识已用于另一项修改。 / Request id already used for another edit.');
      return previous.promise;
    }
    const promise = editAndSend(deps, sessionId, request, signal);
    requests.set(key, { fingerprint, promise });
    try { return await promise; }
    catch (error) { requests.delete(key); throw error; }
  }
  ctx.provide('messagePencil', { operate });
  ctx.commands.register({
    name: 'message-edit', definitionId: '@local/dsh-message-pencil:edit',
    description: '修改历史消息，移除其后全部对话并重新生成 / Edit history, discard everything after it and regenerate',
    input: { hint: '{"action":"list"} | {"action":"edit","seq":number,"originalText":string,"text":string,"requestId":string}' },
    handler: async ({ agent, rawInput, signal }) => {
      try {
        const result = await operate(agent.id, JSON.parse(rawInput), signal);
        return { kind: 'success', text: JSON.stringify(result), ...(result.markerSeq === undefined ? {} : { sourceEventSeq: result.markerSeq }) };
      } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : String(error) }; }
    },
  });
  ctx.tools.register({
    name: 'edit_sent_message',
    description: 'List sent user messages, or edit one in an idle conversation, discard all later messages and regenerate in that same conversation. No branch is kept. Use the pencil in the UI to edit the current conversation after the agent finishes.',
    parameters: {
      type: 'object', properties: {
        action: { type: 'string', enum: ['list', 'edit'] },
        sessionId: { type: 'string', description: 'Required for edit: a different idle conversation. For list, defaults to the current conversation.' },
        beforeSeq: { type: 'integer', minimum: 0, description: 'For list, return up to 20 messages before this sequence; omit for the latest.' },
        seq: { type: 'integer', minimum: 1, description: 'Sequence of the sent user message to edit.' },
        originalText: { type: 'string', description: 'Complete original text of the message, for edit.' },
        text: { type: 'string', description: 'Revised message text, for edit. Original attachments are retained.' },
        requestId: { type: 'string', description: 'For edit, a unique id of 8–128 letters, digits or hyphens. Reuse only when retrying the same edit.' },
      }, required: ['action'], additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec) => {
      if (args.action === 'edit' && !args.sessionId) throw new Error('编辑需要指定另一个空闲会话。当前会话请在回复结束后点击铅笔。 / Specify another idle conversation to edit; use the pencil for the current one after this reply.');
      const sessionId = args.sessionId ?? exec.agent?.id;
      if (args.action === 'list') return operate(sessionId, args, exec.signal);
      const agent = ctx.agents.get(sessionId);
      if (!agent) throw new Error('请先打开会话。 / Open the conversation first.');
      const execution = await ctx.commands.execute(agent, '/message-edit ' + JSON.stringify(args), [], exec.signal);
      if (!execution || execution.result.kind === 'error') throw new Error(execution?.result.text ?? 'Message editing failed.');
      return JSON.parse(execution.result.text);
    },
    presentCall: args => ({ card: 'generic', title: args.action === 'list' ? '查看可编辑消息 / List messages' : '编辑消息并重新生成 / Edit and regenerate' }),
  });
}

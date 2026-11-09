import { EDIT_COMMAND, PLUGIN_NAME, errorMessage } from '../shared/protocol.js';
import type { HostContext, Operate } from './types.js';
import { isRecord, parseJson, requireRequest, requireSessionId } from './validation.js';

export function registerCommand(ctx: HostContext, operate: Operate): void {
  ctx.commands.register({
    name: EDIT_COMMAND,
    definitionId: `${PLUGIN_NAME}:edit`,
    description: '修改历史消息，移除其后全部对话并重新生成 / Edit history, discard everything after it and regenerate',
    input: { hint: '{"action":"list"} | {"action":"edit","seq":number,"originalText":string,"text":string,"requestId":string}' },
    handler: async ({ agent, rawInput, signal }) => {
      try {
        const result = await operate(agent.id, parseJson(rawInput), signal);
        return {
          kind: 'success',
          text: JSON.stringify(result),
          ...('markerSeq' in result ? { sourceEventSeq: result.markerSeq } : {}),
        };
      } catch (error) {
        return { kind: 'error', text: errorMessage(error) };
      }
    },
  });
}

export function registerTool(ctx: HostContext, operate: Operate): void {
  ctx.tools.register({
    name: 'edit_sent_message',
    description: 'List sent user messages, or edit one in an idle conversation, discard all later messages and regenerate in that same conversation. No branch is kept. Use the pencil in the UI to edit the current conversation after the agent finishes.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'edit'] },
        sessionId: { type: 'string', description: 'Required for edit: a different idle conversation. For list, defaults to the current conversation.' },
        beforeSeq: { type: 'integer', minimum: 0, description: 'For list, return up to 20 messages before this sequence; omit for the latest.' },
        seq: { type: 'integer', minimum: 1, description: 'Sequence of the sent user message to edit.' },
        originalText: { type: 'string', description: 'Complete original text of the message, for edit.' },
        text: { type: 'string', description: 'Revised message text, for edit. Original attachments are retained.' },
        requestId: { type: 'string', description: 'For edit, a unique id of 8–128 letters, digits or hyphens. Reuse only when retrying the same edit.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, exec) => {
      const request = requireRequest(args);
      if (request.action === 'edit' && !request.sessionId) {
        throw new Error('编辑需要指定另一个空闲会话。当前会话请在回复结束后点击铅笔。 / Specify another idle conversation to edit; use the pencil for the current one after this reply.');
      }
      const targetId = request.sessionId ?? exec.agent?.id;
      if (request.action === 'list') return operate(targetId, request, exec.signal);
      const sessionId = requireSessionId(targetId);
      const agent = ctx.agents.get(sessionId);
      if (!agent) throw new Error('请先打开会话。 / Open the conversation first.');
      // 通过命令执行，沿用宿主的命令历史记录和 sourceEventSeq 关联。
      const execution = await ctx.commands.execute(agent, `/${EDIT_COMMAND} ${JSON.stringify(request)}`, [], exec.signal);
      if (!execution || execution.result.kind === 'error') {
        throw new Error(execution?.result.text ?? 'Message editing failed.');
      }
      return parseJson(execution.result.text);
    },
    presentCall: args => ({
      card: 'generic',
      title: isRecord(args) && args.action === 'list' ? '查看可编辑消息 / List messages' : '编辑消息并重新生成 / Edit and regenerate',
    }),
  });
}

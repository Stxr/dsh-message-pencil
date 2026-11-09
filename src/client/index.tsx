import React from 'react';
import { EDIT_COMMAND } from '../shared/protocol';
import { UserMessage } from './components/UserMessage';
import type { ClientContext } from './context';
import { editResult, editResultField, installEditVisibility } from './history';
import { dictionaries, LOCALE_NAMESPACE } from './locales';
import styles from './styles.css';
import { createMessageEditor } from './transport';
import type { CommandViewProps } from './types';

function CommandError({ node }: CommandViewProps) {
  const result = node.outcome?.kind === 'success'
    ? editResult({ kind: 'command', data: node }) : undefined;
  const error = editResultField(result, 'error');
  return error ? <div className="mp-error" role="alert">{String(error)}</div> : null;
}

/** Client 源码入口；构建器将导出交给 DSH 的 ModuleLoader factory。 */
export const inject = ['slots', 'locale', 'sessions', 'uiConversation'];

export function apply(ctx: ClientContext) {
  const retainVisibility = installEditVisibility(ctx, React);
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, language, dictionary));
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'message-pencil-styles', order: 0,
  }, () => <style>{styles}</style>));

  const injectMessage = (sessionId: string) => {
    retainVisibility(sessionId);
    return { editMessage: createMessageEditor(ctx, sessionId,
      () => ctx.locale.bind(LOCALE_NAMESPACE)('unavailable')) };
  };

  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
    name: 'conversation.chat.commandview', key: EDIT_COMMAND,
  }, CommandError));

  ctx.slots.inject('conversation.chat.node', function* () {
    // 只替换外层渲染器，不重复声明宿主已经拥有的子插槽。
    for (const key of ['user', 'steering']) {
      yield ctx.slots.register({ name: 'conversation.chat.node', key, priority: -10,
        locale: LOCALE_NAMESPACE, inject: injectMessage }, UserMessage);
    }
  });
}

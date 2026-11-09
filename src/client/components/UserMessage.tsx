import React, { useMemo } from 'react';
import { splitUserContent } from '../content';
import { useMessageEditor } from '../hooks/useMessageEditor';
import type { UserContent, UserMessageProps } from '../types';
import { MessageActions } from './MessageActions';
import { MessageEditor } from './MessageEditor';

/** 替换消息外壳，正文与附件继续复用 DSH 的 user-content Factory。 */
export function UserMessage(props: UserMessageProps) {
  const { node: { data }, t } = props;
  const content = useMemo(() => splitUserContent(data), [data]);
  const running = props.useSession(state =>
    state.running || state.pendingSubmissions.length > 0 || state.awaitingFirstTurn);
  const editor = useMessageEditor({ seq: data.seq, originalText: content.text,
    running, editMessage: props.editMessage });
  const editable = data.source?.kind === 'user' && content.extraBlocks.length === 0;
  const facts = {
    ...(data.referenceLabels ? { sessionLabels: data.referenceLabels } : {}),
    ...(data.skillNames ? { skillNames: data.skillNames } : {}),
  };

  const renderContent = (value: UserContent) => props.renderFactorySlot('conversation.chat.user.content', {
    content: value, facts, interactive: true, loadImage: props.loadImage,
  });

  return (
    <div className="mp-row" data-message-pencil={data.messageId}>
      {editor.editing
        ? <MessageEditor editor={editor} running={running} t={t}
            hasAttachments={content.attachments.length > 0}
            attachments={content.attachments.length ? renderContent({ ...content, text: '' }) : null} />
        : <>
            {renderContent(content)}
            <MessageActions text={content.text} time={data.time} editable={editable && !running}
              onEdit={editor.begin} onError={editor.setError} t={t} />
          </>}
      {!editor.editing && editor.error && <div className="mp-error" role="alert">{editor.error}</div>}
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Translate } from '../locales';
import type { useMessageEditor } from '../hooks/useMessageEditor';

interface MessageEditorProps {
  editor: ReturnType<typeof useMessageEditor>;
  running: boolean;
  hasAttachments: boolean;
  attachments: ReactNode;
  t: Translate;
}

/** 编辑表单只负责交互；草稿/请求生命周期集中在 useMessageEditor。 */
export function MessageEditor({ editor, running, hasAttachments, attachments, t }: MessageEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { textarea.current?.focus({ preventScroll: true }); }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 中文输入法的选词回车不能提交。229 是旧浏览器的 IME 兼容值。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && !editor.sending) {
      event.preventDefault();
      editor.cancel();
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void editor.submit();
    }
  }

  return (
    <form className="mp-editor" aria-label={t('label')}
      onSubmit={event => { event.preventDefault(); void editor.submit(); }}>
      {hasAttachments && <div className="mp-attachments">{attachments}</div>}
      <textarea ref={textarea} rows={2} value={editor.text} aria-label={t('label')}
        disabled={editor.sending} onChange={event => editor.changeText(event.target.value)}
        onKeyDown={onKeyDown} />
      {editor.error && <div className="mp-error" role="alert">{editor.error}</div>}
      <div className="mp-controls">
        <button type="button" className="mp-button" disabled={editor.sending} onClick={editor.cancel}>
          {t('cancel')}
        </button>
        <button type="submit" className="mp-button mp-primary"
          disabled={editor.sending || running || (!editor.text.trim() && !hasAttachments)}
          title={running ? t('busy') : undefined}>
          {t(editor.sending ? 'sending' : 'send')}
        </button>
      </div>
    </form>
  );
}

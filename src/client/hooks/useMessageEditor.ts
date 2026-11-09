import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../shared/protocol';
import type { EditRequest, EditResult } from '../../shared/protocol';

interface EditorOptions {
  seq: number;
  originalText: string;
  running: boolean;
  editMessage(request: EditRequest): Promise<EditResult>;
}

/** 管理当前页面的草稿和提交；同一草稿重试时复用 requestId，避免重复截断。 */
export function useMessageEditor({ seq, originalText, running, editMessage }: EditorOptions) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(originalText);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<EditRequest | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function begin() {
    setText(originalText);
    setError('');
    request.current = null;
    setEditing(true);
  }

  function changeText(value: string) {
    setText(value);
    request.current = null;
  }

  async function submit() {
    if (pending.current || running) return;
    pending.current = true;
    setSending(true);
    setError('');
    try {
      request.current ??= {
        action: 'edit', seq, originalText, text, requestId: crypto.randomUUID(),
      };
      const result = await editMessage(request.current);
      if (result.error) {
        if (mounted.current) setError(result.error);
        return;
      }
      if (mounted.current) setEditing(false);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setSending(false);
    }
  }

  return { editing, text, sending, error, setError, begin, changeText, submit,
    cancel: () => setEditing(false) };
}

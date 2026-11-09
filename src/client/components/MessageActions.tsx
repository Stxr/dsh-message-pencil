import React, { useState } from 'react';
import { errorMessage } from '../../shared/protocol';
import type { Translate } from '../locales';
import { Icon } from './Icon';

interface MessageActionsProps {
  text: string;
  time?: number;
  editable: boolean;
  onEdit(): void;
  onError(error: string): void;
  t: Translate;
}

export function MessageActions({ text, time, editable, onEdit, onError, t }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const date = time ? new Date(time) : undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (failure) {
      onError(errorMessage(failure));
    }
  }

  return (
    <div className="mp-actions">
      {date && <time dateTime={date.toISOString()} title={date.toLocaleString()}>
        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </time>}
      <button type="button" className="mp-icon" title={t(copied ? 'copied' : 'copy')}
        aria-label={t(copied ? 'copied' : 'copy')} onClick={() => void copy()}
        onMouseLeave={() => setCopied(false)}>
        <Icon kind={copied ? 'check' : 'copy'} />
      </button>
      {editable && <button type="button" className="mp-icon" title={t('edit')}
        aria-label={t('edit')} onClick={onEdit}>
        <Icon kind="edit" />
      </button>}
    </div>
  );
}

import React from 'react';
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
export declare function MessageEditor({ editor, running, hasAttachments, attachments, t }: MessageEditorProps): React.JSX.Element;
export {};

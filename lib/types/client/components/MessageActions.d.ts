import React from 'react';
import type { Translate } from '../locales';
interface MessageActionsProps {
    text: string;
    time?: number;
    editable: boolean;
    onEdit(): void;
    onError(error: string): void;
    t: Translate;
}
export declare function MessageActions({ text, time, editable, onEdit, onError, t }: MessageActionsProps): React.JSX.Element;
export {};

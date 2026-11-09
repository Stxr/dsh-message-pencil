import type { EditRequest, EditResult } from '../../shared/protocol';
interface EditorOptions {
    seq: number;
    originalText: string;
    running: boolean;
    editMessage(request: EditRequest): Promise<EditResult>;
}
/** 管理当前页面的草稿和提交；同一草稿重试时复用 requestId，避免重复截断。 */
export declare function useMessageEditor({ seq, originalText, running, editMessage }: EditorOptions): {
    editing: boolean;
    text: string;
    sending: boolean;
    error: string;
    setError: import("react").Dispatch<import("react").SetStateAction<string>>;
    begin: () => void;
    changeText: (value: string) => void;
    submit: () => Promise<void>;
    cancel: () => void;
};
export {};

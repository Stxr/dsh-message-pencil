export declare const LOCALE_NAMESPACE = "messagePencil";
declare const zh: {
    edit: string;
    copy: string;
    copied: string;
    cancel: string;
    send: string;
    sending: string;
    label: string;
    busy: string;
    unavailable: string;
};
export type TranslationKey = keyof typeof zh;
export type Translate = (key: TranslationKey) => string;
export declare const dictionaries: {
    zh: {
        edit: string;
        copy: string;
        copied: string;
        cancel: string;
        send: string;
        sending: string;
        label: string;
        busy: string;
        unavailable: string;
    };
    en: Record<"edit" | "copy" | "copied" | "cancel" | "send" | "sending" | "label" | "busy" | "unavailable", string>;
};
export {};

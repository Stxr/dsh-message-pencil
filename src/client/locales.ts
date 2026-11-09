export const LOCALE_NAMESPACE = 'messagePencil';

const zh = {
  edit: '编辑这条消息',
  copy: '复制',
  copied: '已复制',
  cancel: '取消',
  send: '发送',
  sending: '发送中…',
  label: '修改消息',
  busy: '请等待回复完成，或先停止生成',
  unavailable: '编辑服务暂不可用，请刷新页面。',
};

export type TranslationKey = keyof typeof zh;
export type Translate = (key: TranslationKey) => string;

const en: Record<TranslationKey, string> = {
  edit: 'Edit this message',
  copy: 'Copy',
  copied: 'Copied',
  cancel: 'Cancel',
  send: 'Send',
  sending: 'Sending…',
  label: 'Edit message',
  busy: 'Wait for the reply to finish or stop generation',
  unavailable: 'Message editing is unavailable. Refresh the page.',
};

export const dictionaries = { zh, en };

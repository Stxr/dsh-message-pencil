/** 保留原 core.js 的四个导出，兼容既有消费者与测试入口。 */
export { messageText, replaceText } from './content.js';
export { editAndSend, editTarget } from './history.js';

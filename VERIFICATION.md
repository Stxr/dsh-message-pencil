# 验证记录

日期：2026-11-07（Asia/Shanghai）。版本：@local/dsh-message-pencil 1.1.2。实际宿主：DeepSeek Harness Desktop 0.2.2-rc.1，desktop profile。

## 已修复的现场问题

1.1.0 在已有会话列表的桌面窗口启动时，对未在本地保留的 Session 调用 uiConversation.binding，实际抛出 `unknown session`，使 Client 插件进入 FAILED（state 3）。此前仅凭 Plugin Manager 的 applied 或另一页面的注册项判断桌面窗口正常并不充分。

1.1.1 先检查 sessions.binding，仅重建已经保留的会话；排队重建执行前再次检查，防止会话已被释放。原生 factory 和组件的恢复 effect 在第一次修改前注册，启动失败也能清理已安装的包装。

1.1.2 按用户要求移除忙碌时的灰色禁用图标：running、pendingSubmissions 或 awaitingFirstTurn 期间不渲染铅笔。完全空闲时才渲染，并与复制按钮使用相同的消息悬浮规则；显示的铅笔没有 disabled 属性。

## 自动化检查

- JavaScript 语法检查通过。
- `node tests/run.js`：24 项通过、0 失败；先重建自包含 Client 产物。
- 14 项 Host 操作测试覆盖同会话截断、保留前缀、附件、首条消息、插话和自动回合前缀、忙碌/取消/过期拒绝、截断前后失败、请求去重、工具与 UI 共用命令。
- 2 项实际 SlotCore 注册测试覆盖挂载、原生子插槽声明冲突和卸载恢复。
- 5 项实际 Session surface / ChatSnapshotBuilder 测试覆盖历史重放、空 developer 标记、旧消息和分组/导航/兼容行移除、提纲过滤、错误可见性及 factory 恢复。
- 新增 3 项启动生命周期回归测试，复现侧栏含未保留会话、排队后释放会话、启动中重建失败，并检查只重建保留会话及回滚原生包装。
- 这些原生实现测试使用同级参考源码 0.2.2-alpha.2；下面的现场检查另外使用实际安装的发行版。

## 当前发行版现场验收

使用桌面进程现有 Web 后端进行真实 UI 操作，没有启动替代服务器。通过应用公开的 authenticatedUrl 打开同一 desktop profile 的验证页面，没有读取凭据文件。以独立测试会话完成两次真实模型生成，未编辑用户已有对话。

- 原始输入要求回复 PENCIL_BEFORE，实际收到对应回复。
- 未悬浮时，复制和铅笔的 computed opacity 均为 0；移入消息后均为 1，且 disabled 均为 false。
- 实际点击铅笔，将输入改为要求回复 PENCIL_AFTER，并点击发送。
- 正在生成、回复尚未完成时，铅笔 DOM 数量为 0；生成结束后恢复一个可点击的铅笔。
- 实际收到 PENCIL_AFTER；聊天区域仅保留新问题及新回复，没有 PENCIL_BEFORE。
- 修改前后 sessionId 完全相同；旧消息表面序号 9、10、11、12、17 均退出当前模型表面，新消息序号为 28、29、30、31、35。截断 markerSeq 为 22，没有调用 fork。
- 本地验证曾保留结构化结果；公开仓库只记录以上脱敏结论，不包含本机会话标识、调试脚本或原始运行记录。
- 独立测试会话经过内容校验后已归档，验证浏览器页面已关闭。
- 验证页面关闭后，再对剩余桌面 Client 查询 Slots，message-edit 命令视图仍为 active，确认不是只在验证页面生效。
- Plugin Manager inventory 确认安装且启用的是 1.1.2，本地 link 来源不变；真正停用/启用时两次均为 changed: true、application: applied、warnings: []。

本次没有使用自动鼠标直接操控原生桌面窗口；真实点击发生在连接同一桌面进程的验证页面，桌面窗口的加载状态另由运行时 Inspector 和 Slots 确认。图片/文件附件由自动化行为测试覆盖，本次真实模型用例为纯文本。

## 历史及兼容性

DSH 底层审计日志保持只追加，轨迹或原始日志仍可查看被撤回记录。正常聊天及后续模型输入使用截断后的历史，没有独立旧会话副本。操作不撤销文件、命令或外部操作；已经压缩或替换的消息不接受编辑。

Client 包含针对 0.2.2-rc.1 的私有 Chat builder / 提纲兼容适配，升级宿主后须复验。1.1.2 已修复失败回滚；此前失败页面遗留的旧包装需通过一次页面重新加载清除。本地链接源目录须保留。

公开发行只包含插件源码、构建产物、许可证、脱敏文档与可复现测试；本机 Inspector/浏览器脚本及原始测试会话记录均不发布。

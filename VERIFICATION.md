# 验证记录

## DSH 0.2.2-rc.5 源码适配

- 以正式发行提交 `9c2670d3bce5275e0d1610272958121af87787bb` 的 Session surface、ChatSnapshotBuilder 与 SlotCore 运行 `pnpm check`。另外用 Desktop 安装内的 Electron 44.7.0 执行下方隔离测试。
- 原版在真实 v4 恢复校验中报 `developer/message does not match an open turn and step`。适配版在重发首步写入截断，连续编辑两次后保留原会话 ID、前缀和文件引用，旧后缀退出模型输入。实际 JSONL 持久化文件通过严格校验，新的 Cordis Host 能重新打开会话并发送下一条消息。
- 隔离测试使用安装版 Cordis、AgentLoop、Commands 与 JSONL 持久化，模型回复由本地测试中间件提供，`sessionController.state()` 使用最小替身。Client 通过发行源码和 React 回归验证。当前桌面 profile 和真实浏览器交互未参与测试。

```sh
pnpm build
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" tests/installed-host-recovery.cjs
```

## TypeScript 模块化迁移（2026-11-10）

本节记录 1.1.3 的 TypeScript 模块化重构。Host / Client 的维护入口改为 TypeScript / TSX；DSH 按 `package.json` 的 `exports` 加载 `lib/` 中的编译产物，运行时版本要求仍为 `0.2.2-rc.1`。

- 改造前基线：原有 24 项测试全部通过。
- 严格 TypeScript 检查：覆盖 `src/` 与 `scripts/`，无类型错误，不使用 `@ts-nocheck` 或显式 `any` 绕过检查。
- 重新编译：生成 Host ESM、Client ModuleLoader 脚本、核心/历史回归入口以及类型声明。Client 只从宿主获取 React，不包含运行时 npm 依赖。
- 改造后回归：保留原有 24 项断言，新增 5 项编译后 Client 交互测试，共 29 项通过、0 失败。
- 新增交互覆盖：运行中/排队/等待首轮隐藏铅笔、未知内容块拒绝编辑、宿主附件保留、IME 选词和普通回车不提交、Cmd+Enter 提交、Esc/取消丢弃草稿、重复提交抑制、失败后复用请求 ID，以及截断后重发失败的提示。
- 完整回归直接加载新编译的 `lib/`，原生 surface、ChatSnapshotBuilder 和 SlotCore 仍使用固定参考提交 `ce7073d51254c26cd63b22a60835b8f948deb447`。
- 重复构建校验：全部 30 个 JS / 类型声明产物的 SHA-256 完全一致。
- 独立打包检查：使用 `pnpm pack` 生成运行包，在没有 `node_modules` 的临时目录解压后成功导入 Host；Client 的 ModuleLoader factory 仅请求宿主 `react`，类型声明、patch、图标和语言资源均存在。
- 本地工具版本：Node.js 24.21.0、pnpm 11.28.5；CI 保持 Node.js 24 / pnpm 10.18.3，并执行同一 `pnpm check` 流程。

本次未在正在使用的 DSH profile 中重新安装或切换插件，也未进行真实模型对话的桌面现场验收。下方 2026-11-07 的现场记录属于此前 JavaScript 发行版，不能作为本次 TypeScript 产物的现场验证结果。React 交互测试使用真实 React 渲染器，不模拟浏览器布局和鼠标悬浮；测试工具会提示 react-test-renderer 已弃用，不影响测试结果。

## 此前发行版验证（2026-11-07）

日期：2026-11-07（Asia/Shanghai）。版本：@local/dsh-message-pencil 1.1.2。实际宿主：DeepSeek Harness Desktop 0.2.2-rc.1，desktop profile。

## 已修复的现场问题

1.1.0 在已有会话列表的桌面窗口启动时，对未在本地保留的 Session 调用 uiConversation.binding，实际抛出 `unknown session`，使 Client 插件进入 FAILED（state 3）。此前仅凭 Plugin Manager 的 applied 或另一页面的注册项判断桌面窗口正常并不充分。

1.1.1 先检查 sessions.binding，仅重建已经保留的会话；排队重建执行前再次检查，防止会话已被释放。原生 factory 和组件的恢复 effect 在第一次修改前注册，启动失败也能清理已安装的包装。

1.1.2 按用户要求移除忙碌时的灰色禁用图标：running、pendingSubmissions 或 awaitingFirstTurn 期间不渲染铅笔。完全空闲时才渲染，并与复制按钮使用相同的消息悬浮规则；显示的铅笔没有 disabled 属性。

## 自动化检查

- JavaScript 语法检查通过。
- 当时的 JavaScript 测试入口为 `node tests/run.js`（现已由 `scripts/test.ts` 替代）：24 项通过、0 失败；先重建自包含 Client 产物。
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

# 消息编辑 / Message editing

为 DeepSeek Harness 0.2.2-rc.1 提供 Codex 风格的已发送用户消息编辑。当前版本 1.1.2。

Edit a sent user message and regenerate in the same conversation. Earlier messages stay; the edited message and everything after it are replaced. The pencil appears with Copy on hover, only after generation finishes.

把鼠标移到用户消息，点击复制按钮右侧的铅笔。原消息气泡切换为简洁编辑框，保留正文、已有附件和「取消 / 发送」按钮。编辑后点击「发送」，或按 Cmd/Ctrl+Enter；Enter 换行，Esc 或「取消」放弃编辑。中文输入法选词的回车不会提交。

提交后保持原会话及其 ID：目标消息之前的对话保留，目标消息和其后所有消息退出聊天视图及模型上下文，再提交修改后的正文和原附件生成回复。不会创建分支或在侧栏保留旧会话副本。第一条消息也能编辑。直接发送未改变的文字同样会截断后续对话并重新生成。

已有图片和文件附件自动保留，当前版本仅编辑正文；不提供新增/删除附件或编辑助手回复。提交排队或任务执行期间不渲染铅笔，完全结束后才恢复。空闲时铅笔与复制共用悬浮样式，鼠标移到该消息才出现，移开隐藏；显示的铅笔没有禁用状态。未保存的草稿只保留在当前页面，切换会话或刷新会丢失。此操作不撤销已经执行的文件修改、命令或外部操作。

## 安装和卸载

### 从插件索引安装

DSH 不内置索引源，需要**用户自行添加**。仓库的 `dsh-plugin` topic 仅用于发现，不会自动把插件加入 DSH 列表。

1. 打开「插件」，在实验插件中启用 **Custom plugin indexes（自定义插件索引）**。
2. 进入 **Discover（发现）**，选择 **Add index source（添加索引源）**。
3. 粘贴下面的直连 JSON 地址，然后在索引中选择「消息编辑」并确认安装：

```text
https://raw.githubusercontent.com/Stxr/dsh-message-pencil/main/index.json
```

索引把每个版本固定到完整 Git commit SHA，并声明与插件相同的 DSH 版本要求。请核对安装确认页中的来源；索引源按 profile 保存。

### 直接安装

也可以在插件管理器的「添加插件」中输入：

```text
git+https://github.com/Stxr/dsh-message-pencil.git#v1.1.2
```

或从 [Releases](https://github.com/Stxr/dsh-message-pencil/releases) 下载安装包，解压后通过插件管理器安装**解压目录**。下载的运行包已包含构建好的 Client，无需本地编译。该目录可能作为本地链接使用，安装后请保留。

插件名称为「消息编辑」。安装影响当前 profile 的所有会话；升级后若窗口仍显示旧组件，重新加载一次页面，桌面端可按 Cmd+R。卸载可在「已安装」中停用或移除。

## 历史和兼容性

Host 使用原生 `surfaceOp: replace` 替换历史尾部，通过空 developer 消息删除对应模型输入，再用完整用户消息重新生成。修改在 Agent 的空闲维护操作中执行，避免与另一项生成操作交错；提交新消息前先持久化截断结果。请求去重可避免重复点击产生两次修改。

聊天列表、工具过程、已加载轮次导航及统计兼容数据沿用原生 Chat builder 的隐藏语义；全历史轮次导航也会过滤被截断轮次。消息正文和附件继续由宿主 user-content Factory 渲染。界面不操作其他插件的 DOM。

DSH 的底层审计日志只追加，不物理擦除旧记录；「轨迹」或原始日志仍可能查看这些记录。停用插件会恢复原生历史展示，但不会把旧内容放回模型上下文。这里没有创建或保留独立的旧会话。

当前宿主没有公开的聊天历史过滤接口。Client 因此包含两处有版本检查且卸载时恢复的适配：包装已注册的 Chat builder factory，以及装饰原生 Chat 组件的轮次提纲读取。它们属于私有兼容接口，仅针对声明的 0.2.2-rc.1；升级 DSH 后必须复验。注册资源和包装均随插件卸载恢复。

## 自动化

UI 使用 `/message-edit` 命令。`edit_sent_message` 工具调用同一操作并记录相同命令结果：`list` 返回最近 20 条可编辑用户消息，`beforeSeq` 向前分页；`edit` 必须指定另一个空闲会话的 `sessionId`，并提供完整原文以检查过期编辑。Agent 当前会话须在回复结束后通过铅笔编辑。

成功返回原 `sessionId`、`editedSeq`、`markerSeq` 和截断范围。如果截断后重新发送失败，返回 `historyChanged: true`、`accepted` 与错误，界面保留错误提示。工具列表中超过 4000 字符的正文标记为 `truncated`，编辑时须从原始会话读取完整文本。

## 验证

源码测试需要 Node.js 24、pnpm 10 和相邻的 DSH 参考源码。运行包不包含开发测试，请从源码仓库检出：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git deepseek-harness-latest
git -C deepseek-harness-latest checkout ce7073d51254c26cd63b22a60835b8f948deb447
git clone https://github.com/Stxr/dsh-message-pencil.git
cd dsh-message-pencil
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
```

测试直接加载相邻参考源码的 Session surface、ChatSnapshotBuilder 和 React-free SlotCore。该固定提交为 0.2.2-alpha.2；目标运行时仍是 0.2.2-rc.1，参考测试不能替代发行版现场验收。24 项检查覆盖历史截断、附件、首条消息、插话、过期原文、忙碌/取消拒绝、去重、侧栏会话生命周期及卸载恢复。详细结果与现场验证限制见 [VERIFICATION.md](VERIFICATION.md)。

`pnpm build` 从 `visibility.js` 更新自包含 `client.js`，发行仓库已提交构建产物。运行时不需要额外 npm 依赖。

## 发布与发现

本仓库采用 `dsh-plugin` topic，并提供上面的用户自选索引；添加 topic 不代表官方审核或收录。索引规范和自行添加步骤参见 [DSH 0.2.2-rc.1 官方插件索引指南](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/docs/user/guide/plugin-market.md)。每次发行先提交源码并打版本标签，再在后续提交更新索引，使索引指向该版本的不可变源码提交。

## 参考方案

- https://github.com/sh1robana/dsh-plugin-message-edit ：0.3.3 的支持范围未包含本机 0.2.2-rc.1。
- https://github.com/Renzic-Stone/DSH-EasyRewrite ：3.0.0 引用旧客户端接口，采用分支及归档语义。
- https://github.com/WyxBUPT-22/dsh-plugin-edit-message ：回填最后一条消息。
- https://github.com/DDDMUC/dsh-edit-turn ：包含 DOM 及投影补丁。
- https://github.com/SiriLee/dsh-rewind ：同会话回退；参考了其利用原生隐藏语义包装 Chat builder 的兼容思路。未加入文件回退或快照功能。

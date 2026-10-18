# 助手执行机制

贝壳助手使用自建多模型运行时，通过 Chat Completions 调用已配置的模型。并未接入官方 Codex 托管 harness，也未自动安装外部 DeepSeek agent。模型、工具、审批和运行预算分别管理。

## 多步骤任务

`update_plan` 保存本轮的简短执行清单，状态为待办、进行中、完成或受阻。完成与受阻必须附结果或原因；这属于模型提交的执行记录，不是独立验证器。简单问答无需创建计划，技能受限工具列表仍然生效。

模型尝试结束回复时，如清单仍有待办或进行中项目，运行时最多提醒两次继续处理。达到预算、仍有未完成项或受阻时，保留已有结果并把本轮标为未完成，不记录成成功。计划随工具事件持久化；跨轮继续时仍需重新核对真实状态。

## 工具与上下文

助手工具定义以 `src/shared/domain/assistant/tools/defs.ts` 为准，并导出到 `src/shared/data/assistantTools.json` 供 Go 运行时读取。图像反推、视频规格和抽帧在服务端执行；抽帧结果会作为下一轮的视觉上下文，单轮最多 20 张、合计 5MB。请求可以带 `mcpServers`，后端用 HTTP JSON-RPC 列出并调用工具，这类调用需要审批。`spawn_subagent` 在当前回合内启动最多 2 轮的子任务，子任务不能再拆分。

相同参数重复调用超过上限会拒绝该次调用，并要求调整参数或复用结果，其他工具仍可使用。总轮次、调用数、截止时间限制仍有效；不会无限重试，也不会自动重放可能计费的生成操作。

超过 12,000 字符的单条工具输出存入本轮结果库。累计工具文本超过 48,000 字符时，将更早的输出换成摘要预览与读取索引，保留最近四条。`read_tool_result` 可分页回读全文；只有开放该工具才进行这种处理。用户消息、推理字段及工具调用与结果的配对关系不被切断。这是工具文本预算，不是完整模型 token 窗口估算；结果库仅在当前轮有效。

流式工具调用按上游索引组装，保留参数与模型附加字段。空回复、缺少结束标记、长度截断及上游中止均不算成功，不执行截断的工具参数。非流式降级遵守相同结束状态检查；通道不支持工具时明确报错。

上游 Chat Completions 的 SSE 在读到每个 `reasoning_content` 或 `content` 片段时就转发给客户端：先发 `item/started`，再发 `item/agentReasoning/delta` 或 `item/agentMessage/delta`，回合文本收齐后用同一个 `itemId` 发 `item/agentReasoning/completed` 与 `item/agentMessage/completed`。完整思考文本仍会再发一次 `thinking`，供尚未接增量事件的界面使用。工具开始与结束同时发送 `item/toolCall/started`、`item/toolCall/completed` 和原有的 `tool_call`、`tool_result`；审批结束发送 `item/approval/resolved`。

网络错误、429 和 5xx 只在首个片段写出之前重试，最多 2 次，间隔按 `Retry-After` 或 400ms 起的指数退避，上限 8 秒。已经向客户端输出片段后不再重试，避免把同一段回复写两遍。

## DeepSeek 兼容

官方路由的思考模式移除不支持的 `tool_choice`，并将工具调用消息的空 content 规范为字符串。连续工具轮保留 `reasoning_content`，普通历史中的已保存思考内容也通过消息构建器回传；非流式回复使用相同规则。早期对话仍可能由会话记忆压缩，未保存的历史思考不能恢复。

## 验证与边界

验证脚本放在项目外，使用模拟上游覆盖执行计划续跑、工具索引、推理回传、重复调用恢复、工具结果分页与异常结束，不调用付费模型。静态检查与构建使用 `pnpm check`。真实模型的任务质量仍需实际使用评估，模拟通过不代表达到 Codex 水平。

当前内置工具主要覆盖商品采集、资产查询、文档读取、受限 JavaScript 数据处理及工作区操作，不具备通用联网搜索或任意系统终端能力。审批限制不会因执行计划而绕过。

依据：[OpenAI Agents 架构](https://developers.openai.com/api/docs/guides/agents-api/architecture)、[DeepSeek 思考与工具调用](https://api-docs.deepseek.com/guides/thinking_mode/)、[DeepSeek Oh My Pi 集成](https://api-docs.deepseek.com/quick_start/agent_integrations/oh_my_pi/)。

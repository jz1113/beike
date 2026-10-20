# 助手思考强度与原生文本协议

## 路由规则

Gemini、Claude 的文本及图片理解默认分别使用 Gemini Generate Content、Anthropic Messages 原生接口。设置中的单模型 `textProtocol` 可以显式选择 `auto`、`gemini`、`anthropic` 或 `openai`；显式配置优先于型号推断。OpenAI 类型的聚合渠道不会强制其中的 Gemini、Claude 使用兼容接口。

路由只改变所选渠道的请求格式、认证头与端点，不替换已保存的地址、密钥或模型 ID。渠道不支持原生接口时明确返回错误，由用户选择兼容协议；系统不会静默切协议、换渠道或重复提交原生付费请求。图片生成和视频生成保持独立协议。

## 能力与参数

原生型号能力以 `src/shared/domain/models/textModelCapabilities.json` 为真源，后端使用其嵌入副本，`pnpm check:shared-data` 校验一致性。型号识别使用实际上游 ID，不使用界面显示名称或渠道条目 ID。未知别名可使用原生接口，但不猜测该型号的思考参数。

- Gemini 4 Argon 支持低、中、高，分别发送 `generationConfig.thinkingConfig.thinkingLevel: low / medium / high`。Gemini 3 的档位按具体型号区分；Gemini 2.5 使用 `thinkingBudget`，不与 level 同时发送。
- Claude 的新型号使用自适应思考及适用的 `output_config.effort`；旧型号使用带 `budget_tokens` 的扩展思考。界面档位按已核实型号提供，输出上限需同时容纳思考与正文，不能直接套用 OpenAI 的 `reasoning_effort`。预算档位是本产品的取值策略，不是厂商允许的最大预算：Gemini 2.5 为 2048／8192／12288，旧 Claude 为 1024／2048／3072，以给默认输出上限保留正文空间。
- 官方 Claude Haiku 5.5 ID 是 `claude-haiku-5-5`，原生支持低、中、高、极高；`claude-5.5-haiku` 等未核实的网关别名只按 Claude 前缀路由，不冒认同一能力。界面继续使用现有四档，不将 `max` 与 `xhigh` 混为一档。
- 显式 OpenAI 兼容的 Claude 不宣称支持原生思考控制；其他兼容型号沿用既有档位规则。GPT、Grok 使用 `reasoning_effort`，Qwen、Kimi、DeepSeek 的特殊映射与原生 Gemini/Claude 配置相互独立。
- 界面保存的档位在切换型号、渠道或协议后归一化。原生请求在发送前再次校验能力，不把无效档位直接透传给厂商。
- 思考内容展示的是厂商允许返回的摘要；省略摘要不代表思考关闭，也不代表没有思考 token 费用。

助手主链、最终回复、摘要和图片筛选使用同一原生适配层。辅助摘要与筛图使用其专用输出预算，不从网页展示历史中重建签名或工具调用。

## 工具、多轮与流式

Gemini 的 `thoughtSignature`、Claude 的 thinking/signature/redacted-thinking 块按原始内容块保留，回传时保持顺序。所有工具结果先完整成组返回，再补充工具产生的图片和执行提醒；工具参数不完整、断流、截断或安全拦截都不执行工具。

签名是服务端内部上下文，不作为普通正文、思考摘要或客户端事件发送。一次执行中的工具轮次保留完整原生消息；跨用户回合仅从同工作区、同会话、同模型、同渠道凭证的已完成回合恢复匹配的最终原生消息。浏览器提交的展示历史不能覆盖签名，旧的工具调用不按展示文本重放。上下文压缩可以总结早期文本，但不伪造签名。

SSE 流支持厂商原生内容块、工具参数增量、思考摘要、结束状态与错误。Gemini 的输出用量计入厂商报告的思考 token；缺少用量报告时不伪造零用量作为真实计费数据。

## 验证边界

正式测试使用本地模拟上游覆盖端点、认证、流式/非流式、思考参数、工具往返、签名保真及错误路径。完整检查运行 `pnpm check`。这些结果验证项目序列化和解析行为，不代表已验证某个聚合网关对所有型号的原生支持；真实渠道付费验证需单独确认。

## 官方依据

- [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [Gemini thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures)
- [Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [DeepSeek 思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)

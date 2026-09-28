# 助手思考强度适配

核对日期：2026-09-27。能力表位于 `src/shared/domain/assistant/reasoning.ts`，界面和服务端共同使用，未知模型不猜测参数。

| 模型 | 手动档位 | Chat Completions 参数 |
| --- | --- | --- |
| 已适配 GPT、Grok 4.6 / 4.7 | 低、中、高、极高 | `reasoning_effort: low / medium / high / xhigh` |
| Gemini 3.1 Pro Preview、3.7 / 3.8 Flash | 低、中、高 | `reasoning_effort: low / medium / high` |
| Qwen 3.8 Max | 低、中、极高 | `reasoning_effort: low / medium / xhigh` |
| Kimi K3 | 低、高、极高 | `reasoning_effort: low / high / max` |
| DeepSeek V4 / V4.1 Flash、官方 Flash / V4 Pro | 低、高、极高 | `reasoning_effort: low / high / max`，开启 thinking |
| Claude（当前 OpenAI 兼容通道） | 未适配 | 不发送强度参数；原生接口配置不能直接等同兼容接口 |

界面仅保留手动档位。旧“自动”偏好和未设置值迁移为固定默认：支持中的模型使用中，Kimi / DeepSeek 使用高。不会再根据提示词复杂度调整强度。接口仍接受旧 auto 值以兼容已打开的客户端，但会执行同样的固定映射。切换模型或故障回退时归一化：Gemini 的极高降为高；Qwen 的高映射极高；Kimi / DeepSeek 的中映射高。极高是产品名称，在 Kimi / DeepSeek 上明确映射为 max。

所有助手流式请求、工具兼容请求、最终回复、记忆摘要与图片筛选共享适配。推理模型使用供应商默认采样参数；Qwen 不同时发送 thinking_budget。工具轮次回传 Kimi / Qwen / DeepSeek reasoning_content，流式工具调用保留通道返回的 extra_content（如 Gemini 签名）。Kimi 输出预算使用 max_completion_tokens。

## 官方依据

- [Grok reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning)：4.6 及以上提供四档，不能关闭推理。
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) 与 [Thinking](https://ai.google.dev/gemini-api/docs/thinking)：兼容接口支持 reasoning_effort；上述三个模型支持 low / medium / high。
- [Qwen OpenAI Chat](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)：Qwen 3.8 原生三档为 low / medium / xhigh，high 是 xhigh 的兼容映射；与 thinking_budget 互斥。
- [Kimi Chat Completions](https://platform.kimi.com/docs/api/chat)：K3 始终推理，三档 low / high / max；Preserved Thinking 要求保留返回的推理上下文。
- [DeepSeek 思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)：三档 low / high / max，官方兼容值 medium / xhigh 均映射 high。因此产品极高显式发送 max。
- [Claude OpenAI compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk)：reasoning_effort 被忽略；[原生 effort](https://platform.claude.com/docs/en/build-with-claude/effort) 使用 output_config.effort。尚无本项目 Comfly 通道的已核实映射，不增加无效滑杆。

## 验证边界

上述资料确认厂商契约。项目通过 Comfly 调用的模型已按兼容格式发送参数，但这不等同于已确认网关实际执行每个强度：本次使用 mock 请求断言验证服务端序列化、流式 / 非流式一致性、模型回退与工具上下文回传，没有消耗生产 API 额度。未找到可核实的 Comfly Claude 强度转换契约，保留明确的“未适配”状态，需网关原生适配或确认其参数映射后再开放。

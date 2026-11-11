# 模型官方 API 接入与配置

打开「设置 → API 接入 → 添加服务商」，按下表填写协议、Base URL 和对应账户的凭证，再到该服务商的模型管理添加或同步模型并保存。表中的模型 ID 用于贝壳设置，实际出站 ID 的映射见备注。同名模型使用不同渠道时分别绑定，画布和 Agent 创作里选择对应的渠道条目。

连接检测用于确认服务商配置和模型列表。需要人工添加的型号可直接用表中 ID。出图、出片、工具调用等能力以所选渠道的实际请求为准。密钥填写在设置页，表中只提供公开地址与参数。

- [服务商配置](#服务商配置)
- [多模态对话与视觉分析](#多模态对话与视觉分析) · [文本协议与思考强度](#文本协议与思考强度)
- [生图与图像编辑](#生图与图像编辑) · [视频生成](#视频生成) · [语音合成与音频处理](#语音合成与音频处理)
- [现有渠道兼容](#现有渠道兼容) · [调用与回执](#调用与回执) · [接入维护流程](#接入维护流程)

## 服务商配置

### 拉取范围

设置、画布和 Agent 的模型列表按以下系列及版本顺序展示。同一版本的多条渠道保留相对顺序。

- 多模态保留 Gemini 4 / 3.8、GPT 6.1 / 6 / 5.6、Claude 5.5 / 5.1 / 5 / 4.8、Grok 4.7、DeepSeek V4.1 Flash、Kimi K3.1 Pro、豆包 Seed 2.0、GLM 5.3 和小米 MiMo。
- 绘图保留 Gemini 3.1 Flash Image / Nano Banana 2 / 2.1、GPT Image 2.6 / 2.5 / 2、Grok 4.2 Image 和 Seedream 5 / 4.5。
- 视频保留 Veo 3.1、Omni Flash 1.0 / 1.2、Sora 2、Grok Imagine Video 1.5、Wan 3.0 的标准版和 Prime、Seedance 2.5 / 2.0、MiniMax H3、可灵 4.0 / 4.0 Flash 和 Vidu Q4。

拉取结果取上游返回的型号与贝壳筛选规则的交集。同步时保留上游原始 ID，包括带服务商前缀的已匹配型号。画布与 Agent 创作使用同一份名单。已保存的旧渠道配置仍用于查看历史任务与核对原回执。动作迁移节点继续使用已配置的动作控制专用线路。

### 多模态对话

| 服务商 | 贝壳协议 | Base URL | 调用与模型选择 | 官方资料 |
| --- | --- | --- | --- | --- |
| OpenAI | `openai` | `https://api.openai.com` | 使用该账户可见的型号，走 `/v1/chat/completions` | [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) |
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com` | 使用 Google 模型 ID，文本、图片与视频理解走 `generateContent` 或 `streamGenerateContent` | [Gemini API](https://ai.google.dev/api/generate-content) · [视频理解](https://aistudio.google.com/docs/video-understanding?hl=zh-cn) |
| Anthropic | `anthropic` | `https://api.anthropic.com` | 使用 Anthropic 模型 ID，走 `/v1/messages` | [Messages](https://platform.claude.com/docs/en/api/messages) |
| xAI | `openai` | `https://api.x.ai` | `grok-4.7`，走 `/v1/chat/completions` | [Grok 4.7](https://docs.x.ai/developers/grok-4-7) · [Chat Completions](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions) |
| DeepSeek | `openai` | `https://api.deepseek.com` | 使用该账户可见的型号，走 `/chat/completions` | [DeepSeek API](https://api-docs.deepseek.com/zh-cn/) |
| Kimi | `openai` | `https://api.moonshot.cn/v1` | `kimi-k3.1-pro`、`kimi-k3.1-pro-highspeed`，走 `/v1/chat/completions` | [K3.1 Pro](https://platform.kimi.com/docs/guide/kimi-k3-1-pro-quickstart) |
| 火山方舟豆包 | `openai` | `https://ark.cn-beijing.volces.com/api/v3` | Seed 2.0 系列使用账户开通的模型 ID，走 `/api/v3/chat/completions` | [Chat Completions](https://api.volcengine.com/api-explorer/?action=ChatCompletions&groupName=Chat+API&serviceCode=ark&version=2024-01-01) |
| 智谱 | `openai` | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3`、`glm-5.3-flash`，走 `/api/paas/v4/chat/completions`。GLM 5.3 官方模型接收文本输入 | [GLM 5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) · [对话补全](https://docs.bigmodel.cn/api-reference/模型-api/对话补全) |
| 小米 MiMo | `openai` | `https://api.xiaomimimo.com/v1` | 使用账户可见的 MiMo 型号，走 `/v1/chat/completions` | [API 接入](https://mimo.mi.com/docs/zh-CN/quick-start/faq/api-integration) |
| 其他兼容服务商 | `openai` | 填服务商提供的兼容 Base URL | 使用该渠道提供的模型 ID 和 Key，按 OpenAI Chat Completions 格式发送 | [请求格式](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) |

### 绘图

| 服务商 | 贝壳协议 | Base URL | 可配置模型 ID 与端点 | 官方资料 |
| --- | --- | --- | --- | --- |
| 火山方舟 Seedream | `custom` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seedream-5-0-pro-260628`、`doubao-seedream-5-0-flash-260915`、`doubao-seedream-5-0-260128`、`doubao-seedream-4-5-251128` 等账户已开通型号，提交到 `/api/v3/images/generations` | [图片生成](https://console.volcengine.com/ark/region:cn-beijing/docs/image-generation-api) · [方舟模型列表](https://console.volcengine.com/ark/region:cn-beijing/docs/model-list) |
| OpenAI GPT Image | `openai` | `https://api.openai.com` | 可填 `gpt-image-2`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`、`gpt-image-2.6-flare`、`gpt-image-2.6-sunburst`，走 `/v1/images/generations` 或 `/v1/images/edits` | [生成](https://developers.openai.com/api/reference/resources/images/methods/generate) · [编辑](https://developers.openai.com/api/reference/resources/images/methods/edit) |
| Google Nano Banana | `gemini` | `https://generativelanguage.googleapis.com` | 使用账户可见的 `gemini-nano-banana-2.1`、`gemini-3.1-flash-image` 或对应 Preview ID，走 `/v1beta/models/{model}:generateContent`。兼容渠道可能将 3.1 Flash Image 标为 `nano-banana-2` | [图片生成与尺寸](https://aistudio.google.com/docs/image-generation?hl=zh-cn) |
| Grok 4.2 Image | `openai` | 填支持该型号的渠道地址 | `grok-4.2-image`，用该渠道的生图与编辑协议 | [网关生成](https://gpt-best.apifox.cn/api-512857860) · [网关编辑](https://gpt-best.apifox.cn/api-512878064) |

### 视频

| 服务商 | 贝壳协议 | Base URL | 可配置模型 ID 与端点 | 官方资料 |
| --- | --- | --- | --- | --- |
| 火山方舟 Seedance | `custom` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seedance-2.5`、`doubao-seedance-2.0-mini`、`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`。前两个分别映射为方舟的 `doubao-seedance-2-5-260628` 和 `doubao-seedance-2-0-mini-260615`。提交与查询使用 `/api/v3/contents/generations/tasks` | [创建视频任务](https://console.volcengine.com/ark/region:cn-beijing/docs/create-video-generation-task-api) |
| Google Cloud Veo 3.1 | `custom` | `https://REGION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/REGION/publishers/google` | `veo3.1`、`veo3.1-fast` 映射到 GA 模型 `veo-3.1-generate-001`、`veo-3.1-fast-generate-001`。使用对应项目的 OAuth 访问令牌，提交 `:predictLongRunning`，查询 `:fetchPredictOperation` | [Veo 3.1 模型](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate.md) |
| Gemini Omni Flash / fal | `fal` | `https://queue.fal.run` | 添加 `gemini-omni-1.0-flash` 或 `gemini-omni-1.2-flash`，使用 fal Key。两版按各自模式和规格提交 | [1.0](https://fal.ai/models/google/gemini-omni-flash/api) · [1.2 文生](https://fal.ai/models/google/gemini-omni-flash/v1.2/text-to-video/api) · [图生](https://fal.ai/models/google/gemini-omni-flash/v1.2/image-to-video/api) · [参考](https://fal.ai/models/google/gemini-omni-flash/v1.2/reference-to-video/api) |
| Sora 2 系列 | `openai` | 填仍提供 Sora 的渠道地址 | `sora-2`、`sora-2-pro` 沿用已有网关协议，服务商可用性由渠道确认 | [网关文生](https://gpt-best.apifox.cn/api-358024351) · [OpenAI API 下线公告](https://developers.openai.com/api/docs/deprecations#2026-03-24-sora-2-video-generation-models-and-videos-api) |
| 可灵 | `custom` | `https://api-singapore.klingai.com` | `kling-4.0`、`kling-4.0-flash`。用官方 Bearer 凭证，按模式走 `/text-to-video/{model}`、`/image-to-video/{model}` 或 `/omni-video/{model}`，以 `/tasks?task_ids=...` 查询 | [可灵 4.0](https://kling.ai/document-api/api/video/4-0/video-omni) · [4.0 Flash](https://kling.ai/document-api/api/video/4-0-flash/video-omni) |
| Vidu | `custom` | `https://api.vidu.cn` | `viduq4-preview`。使用 Vidu Token，按方式走 `/ent/v2/reference2video` 或 `/ent/v2/img2video`，用 `/ent/v2/tasks/{id}/creations` 查询 | [Vidu Q4](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/reference-to-video) |
| 阿里云百炼 Wan 3.0 | `dashscope` | `https://WORKSPACE_ID.cn-beijing.maas.aliyuncs.com` | `wan3.0-video`、`wan3.0-video-prime`。填写所属地域的工作空间地址与 Key，提交 `/api/v1/services/aigc/video-generation/video-synthesis`，查询 `/api/v1/tasks/{task_id}` | [Wan 3.0 API](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference) |
| MiniMax H3 | `custom` | `https://api.minimax.cn` | `MiniMax-H3`，提交 `/v2/video_generation`，查询 `/v2/query/video_generation/{task_id}` | [H3 创建任务](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create) |
| xAI Grok Imagine | `openai` | `https://api.x.ai` | `grok-imagine-video-1.5`，走 `/v1/videos/generations` 和 `/v1/videos/{request_id}`。当前贝壳的 1.5 官方路线提供生成，编辑与延长受线路限制 | [Videos API](https://docs.x.ai/developers/rest-api-reference/inference/videos) |

### 语音

| 服务商 | 贝壳协议 | Base URL | 可配置模型 ID 与端点 | 官方资料 |
| --- | --- | --- | --- | --- |
| MiniMax | `custom` | `https://api.minimax.cn` | `speech-2.8-hd` 等账户可见的型号，走 `/v1/t2a_v2` | [同步语音合成](https://platform.minimax.cn/docs/api-reference/speech-t2a-http) |
| OpenAI | `openai` | `https://api.openai.com` | `gpt-4o-mini-tts` 等账户可见的型号，走 `/v1/audio/speech` | [Create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create) |

### 渠道限制

- 「设置 → fal 模型」从 fal 官网 Explore 拉取模型目录，按官方模型组展示，提交端点在详情里。搜索、勾选和下载名单都在此处。已有 fal 官方队列配置时，已选的 Omni Flash 1.0 / 1.2 可同步到视频设置。其余模型的选择保存在当前浏览器，供后续接入时核对。 [fal Explore](https://fal.ai/explore)

- **Gemini Omni Flash 1.0 / 1.2** 的贝壳视频节点使用上表的 fal 队列。1.0 提供文生、首帧、参考图与编辑，界面使用 720P，生成时长 3–10 秒。1.2 提供 360P / 720P / 1080P / 4K，常规生成 3–15 秒，延长新增 3–10 秒，编辑时长与画幅沿用源视频。声音由模型生成。旧网关的 `omni_flash-10s` 沿用原协议恢复历史任务。
- **Midjourney 与 Qwen Image** 已退出本次绘图选择范围，已保存的历史任务沿用原渠道查询。

## 多模态对话与视觉分析

### 对话 · 路由与凭证

前端通过统一路由层携带当前模型、渠道地址、密钥和协议配置。业务调用进入 Go 领域接口，再由 gateway 转换为上游消息格式：

- 自动模式按型号选择协议。Gemini 使用 GenerateContent / StreamGenerateContent，Claude 使用 Anthropic Messages，兼容网关的服务商标签不会覆盖这两类型号的默认协议。
- 单模型 `textProtocol` 可以显式选择 OpenAI 兼容；其他聊天模型沿用兼容请求。
- 千问 / DashScope 兼容端点为 `/compatible-mode/v1/chat/completions`，模型发现使用 `/compatible-mode/v1/models`。

原生请求失败直接报告错误，不静默跨协议、跨渠道或跨模型重投。渠道只支持兼容格式时应在设置中明确配置，不能把拉取模型列表成功当作图文生成已经验收。

图片、工具调用与思考内容由对应适配器转换。原生上下文签名由服务端保留并校验，业务层不要手工把签名拼到正文。助手的工具执行、流式事件、预算与重试规则由[助手执行机制](assistant-runtime.md)维护。

### 对话 · 按业务调用

项目没有用一个通用“视觉抽取”端点承担所有任务：

- 助手回合使用 `/api/assistant/turn/start`，带会话与工具上下文。
- 电商图文分析使用 `/api/generate/analyze`，读取当前商品图、类目创作技能与镜头数量。
- 文案使用 `/api/generate/copywriting`。
- 素材反推使用 `/api/catalog/assets/deconstruct`，后台图集队列另有任务接口。
- 封面与关键词使用各自领域接口；电商视频使用 `/api/sales` 与画布节点，流程见[电商视频](video-sales.md)。

`POST /api/generate/analyze` 接收 `productTitle`、`imageUrls`、`shotCount` 及类目技能字段；镜头数省略时为 4。有效生产请求需携带当前商品图与匹配的类目创作技能，不应照抄演示数据直接调用。

响应主体是 `prompts`、`assetTrace`、`modelUsed` 以及商品指纹、场景等结构化信息；不是任意 `task` / `instructions` 请求返回 `extracted` 的通用 OCR 接口。商品和母本图片的职责及排序见[图组绑定规则](workshop-asset-binding.md)。

### 对话 · 验证与参考

优先验证选定渠道的文本、图片读取、结构化输出、工具及流式结束状态，分别记录结果。空响应、截断、断流不能当作正常完成；实际重试策略依对应业务执行器，不统一承诺自动降级。

实现入口为 `src/backend/internal/gateway/`，电商图文响应见 `src/backend/internal/generate/analyze.go`，路由见 `src/backend/internal/app/server.go`，对外契约见 `src/shared/contracts/openapi.yaml`。

## 文本协议与思考强度

### 思考强度 · 路由规则

Gemini、Claude 的文本及图片理解默认分别使用 Gemini Generate Content、Anthropic Messages 原生接口。设置中的单模型 `textProtocol` 可以显式选择 `auto`、`gemini`、`anthropic` 或 `openai`；显式配置优先于型号推断。OpenAI 类型的聚合渠道不会强制其中的 Gemini、Claude 使用兼容接口。

路由只改变所选渠道的请求格式、认证头与端点，不替换已保存的地址、密钥或模型 ID。渠道不支持原生接口时明确返回错误，由用户选择兼容协议；系统不会静默切协议、换渠道或重复提交原生付费请求。图片生成和视频生成保持独立协议。

### 思考强度 · 能力与参数

原生型号能力以 `src/shared/domain/models/textModelCapabilities.json` 为真源，后端使用其嵌入副本，`pnpm check:shared-data` 校验一致性。型号识别使用实际上游 ID，不使用界面显示名称或渠道条目 ID。未知别名可使用原生接口，但不猜测该型号的思考参数。

- Gemini 4 Argon 支持低、中、高，分别发送 `generationConfig.thinkingConfig.thinkingLevel: low / medium / high`。Gemini 3 的档位按具体型号区分；Gemini 2.5 使用 `thinkingBudget`，不与 level 同时发送。
- Claude 的新型号使用自适应思考及适用的 `output_config.effort`；旧型号使用带 `budget_tokens` 的扩展思考。界面档位按已核实型号提供，输出上限需同时容纳思考与正文，不能直接套用 OpenAI 的 `reasoning_effort`。预算档位是本产品的取值策略，不是厂商允许的最大预算：Gemini 2.5 为 2048／8192／12288，旧 Claude 为 1024／2048／3072，以给默认输出上限保留正文空间。
- 官方 Claude Haiku 5.5 ID 是 `claude-haiku-5-5`，与 Claude 4.7/4.8/5/5.5 及 OpenAI GPT-5.6/GPT-6 系列一起支持最高 `max`（最高）思考强度；Claude 4.6 支持 `low / medium / high / max`。`claude-5.5-haiku` 等未核实的网关别名只按 Claude 前缀路由，不冒认同一能力。
- 显式 OpenAI 兼容的 Claude 不宣称支持原生思考控制；其他兼容型号沿用既有档位规则。GPT、Grok 使用 `reasoning_effort`，Qwen、Kimi、DeepSeek 的特殊映射与原生 Gemini/Claude 配置相互独立。
- 界面保存的档位在切换型号、渠道或协议后归一化。原生请求在发送前再次校验能力，不把无效档位直接透传给厂商。
- 思考内容展示的是厂商允许返回的摘要；省略摘要不代表思考关闭，也不代表没有思考 token 费用。

助手主链、最终回复、摘要和图片筛选使用同一原生适配层。辅助摘要与筛图使用其专用输出预算，不从网页展示历史中重建签名或工具调用。

### 思考强度 · 工具、多轮与流式

Gemini 的 `thoughtSignature`、Claude 的 thinking/signature/redacted-thinking 块按原始内容块保留，回传时保持顺序。所有工具结果先完整成组返回，再补充工具产生的图片和执行提醒；工具参数不完整、断流、截断或安全拦截都不执行工具。

签名是服务端内部上下文，不作为普通正文、思考摘要或客户端事件发送。一次执行中的工具轮次保留完整原生消息；跨用户回合仅从同工作区、同会话、同模型、同渠道凭证的已完成回合恢复匹配的最终原生消息。浏览器提交的展示历史不能覆盖签名，旧的工具调用不按展示文本重放。上下文压缩可以总结早期文本，但不伪造签名。

SSE 流支持厂商原生内容块、工具参数增量、思考摘要、结束状态与错误。Gemini 的输出用量计入厂商报告的思考 token；缺少用量报告时不伪造零用量作为真实计费数据。

### 思考强度 · 验证边界

正式测试使用本地模拟上游覆盖端点、认证、流式/非流式、思考参数、工具往返、签名保真及错误路径。完整检查运行 `pnpm check`。这些结果验证项目序列化和解析行为，不代表已验证某个聚合网关对所有型号的原生支持；真实渠道付费验证需单独确认。

### 思考强度 · 官方依据

- [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [Gemini thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures)
- [Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [DeepSeek 思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)

## 生图与图像编辑

### 生图 · 项目接口

提交使用 `POST /api/generate/image`，查询使用同一路径的 GET。以下为请求体示例；应用鉴权、工作区和所选渠道凭证由前端统一请求层携带。幂等标识通过 `x-idempotency-key` 请求头传递，客户端须在请求前保存并在恢复时复用。

```json
{
  "model": "gpt-image-2",
  "prompt": "保持参考图中的沙发款式、面料与颜色，置于自然光客厅，商品完整入画。",
  "size": "2448x3264",
  "quality": "high",
  "aspectRatio": "3:4",
  "referenceImages": ["https://example.com/assets/sofa.jpg"]
}
```

参考图支持 `images`、`referenceImages`、`productReferenceImages`、`compositionReferenceImages`，以及商品、人脸、场景等专用单图字段。普通调用优先用一种明确的数组表达，避免重复注入。`references` 不是此接口读取的参考图字段；常规参考图编辑也不能等同于已经接入局部蒙版重绘。

后端省略模型时使用 `gpt-image-2`，省略尺寸时使用 `2448x3264`；质量通常为 high，hub 来源默认 medium。功能页面可以显式选择不同配置，最终尺寸仍受模型适配器校验。像素尺寸直接表达宽高，不能把 1024×1536 标为“4K”。

提交可能返回异步任务，也可能同步返回 `status: "SUCCESS"` 与 `resultUrl`。响应包括 `taskId`、`recordId`、实际模型及尺寸；同步结果也会建立本地任务号，不能据此推断上游存在异步任务。

### 生图 · 协议选择

- `openai`：默认的 Images 兼容协议。通常使用 `/v1/images/generations`，有参考图的 GPT Image、Qwen Edit 等按适配器走 `/v1/images/edits`。不能把一种网关的 JSON 格式推广为所有官方 Edits 接口的格式。
- `dashscope`：显式选择此协议，或使用千问 / DashScope 域名时采用原生图像协议。聚合网关上的 Qwen 模型不会仅因名称相同就切换协议。
- `gemini`：显式选择此协议，或使用 `generativelanguage.googleapis.com` 时走 `/v1beta/models/{model}:generateContent`（携带 `generationConfig.responseModalities: ["IMAGE"]` 与 `generationConfig.imageConfig`），响应提取跳过 `thought: true` 的中间思考图。
- 火山方舟：Seedream 绑定方舟域名时提交到 `POST /api/v3/images/generations`。按官方型号校验像素面积、比例及参考图数量，发送 `size` 和 `image`，同步结果使用上游报告的 `data[0].size`。Comfly 等聚合网关保留各自的兼容路由。
- `fal`：添加服务商时选择 fal 预设，保存队列 API Key，再将 `qwen-image-3` 绑定到该渠道。公共目录可核验端点是否发布，生成权限以实际队列 Key 为准。
- `template`：按服务商保存的请求模板提交和查询，用于现有协议无法表达的平台。

画布分别保存像素尺寸档位和模型生成质量。GPT Image 的生成质量单独传递给后端，Seedream 使用像素尺寸表达清晰度。OpenAI 官方地址调用同步 Images Generate / Edit 接口，网关的异步查询继续使用原渠道。

OpenAI 图片接口文档也包含 DALL·E 2 的 Variations 和 GPT Image 的流式预览事件。当前画布使用生成、编辑和生成任务回执。 [Variations 参考](https://developers.openai.com/api/reference/resources/images/methods/create_variation) · [生成流式事件](https://developers.openai.com/api/reference/resources/images/generation-streaming-events) · [编辑流式事件](https://developers.openai.com/api/reference/resources/images/edit-streaming-events)

xAI 官方地址使用原生图片生成或 JSON 编辑。单图编辑使用 `image` 对象，多图编辑使用 `images` 数组，最多五张，保持引用顺序。当前官方模型为 `grok-imagine-image-2.0`，旧模型 ID 的可用性由原渠道决定。 [xAI Images REST API](https://docs.x.ai/developers/rest-api-reference/inference/images)

### 历史生图 · Qwen Image 3 / fal

无参考图走 `alibaba/qwen-image-3/text-to-image`，有参考图走 `alibaba/qwen-image-3/edit`。队列鉴权为 `Authorization: Key`，发送 `image_size.width` 和 `image_size.height`，编辑发送有序 `image_urls`，最多三张。接受回执保存 `request_id`，查询使用两个子端点共用的 `/alibaba/qwen-image-3/requests/{id}/status` 和结果地址。只读目录目前未返回 Midjourney，已有项目的 Midjourney 路线仍使用原网关。

[fal 队列文档](https://fal.ai/docs/documentation/model-apis/inference/queue) · [文生图](https://fal.ai/models/alibaba/qwen-image-3/text-to-image/api) · [参考图编辑](https://fal.ai/models/alibaba/qwen-image-3/edit/api)

OpenAI 兼容协议内仍有模型差异：Gemini / Nano Banana 系列（`gemini-nano-banana-2.1`、`gemini-3.1-flash-image`、`gemini-3.1-flash-lite-image`、`gemini-3-pro-image`、`gemini-2.5-flash-image`、`nano-banana-pro`、`nano-banana`）发送 `aspect_ratio` / `aspectRatio`、大写 `image_size` / `imageSize`（`1K` / `2K` / `4K`）与 `response_format: "url"`，不发送 `size`、`n`、`quality`（`auto` / `default` 时省略宽高比以跟随参考图或默认 `1:1`；2.1 与 3.1 Flash 支持 `1:1`、`1:4`、`1:8`、`2:3`、`3:2`、`3:4`、`4:1`、`4:3`、`4:5`、`5:4`、`8:1`、`9:16`、`16:9`、`21:9` 共 14 种比例，Pro / Lite / 2.5 Flash 支持 10 种常规比例，最多支持 14 张参考图）；Grok 图像按适配映射 `aspect_ratio`，不发送 `quality`；Midjourney 使用网关 Imagine / Action / Fetch 流程。能力、编辑支持与尺寸选项以 `src/shared/domain/models/model-catalog/`、前端图像尺寸规则和 Go 后端实现为准，不在本文重复维护另一张型号能力表。

### 历史生图 · 千问 / DashScope

配置地址可为 `https://maas.qianwenaiapi.com` 或 DashScope 服务地址；具体接入受渠道能力约束。

- 历史 Qwen-Image 调用使用同步 `/api/v1/services/aigc/multimodal-generation/generation`。文本和图片放入 `input.messages[].content`，尺寸转换为 `parameters.size` 的“宽*高”格式。
- Wan 2.6 / 2.7 图像使用异步 `/api/v1/services/aigc/image-generation/generation`，带 `X-DashScope-Async: enable`，由 `/api/v1/tasks/{task_id}` 查询。更早的旧版万相图像协议尚未适配。
- 推理字段按型号映射为 `prompt_extend`、`enable_thinking` 或 `thinking_mode`；不发送 OpenAI 的 `quality`。`wan2.7-image-pro` 才保留界面 4K 选项。
- 同一服务商的对话与模型发现分别使用 `/compatible-mode/v1/chat/completions`、`/compatible-mode/v1/models`，不能与图像端点混用。

### 生图 · 素材与恢复

私有存储参考图须先转换为上游可访问的签名地址。超大参考图按传输规则生成副本，不覆盖原图：单张超过 8MB 且不超过 25MB 时，转换为不超过 8MB 的 JPEG 后提交。素材转换失败应明确报错，不能少带图片继续执行。

响应丢失时先用 `GET /api/generate/image?taskKey=原幂等标识` 核对本地记录，取得任务号后继续 `?taskId=原任务号` 查询。查询沿用原模型、渠道和所需协议信息；未知提交先核对，不自动创建新付费任务。上游结果地址的可用期由渠道决定，获得结果后应保存到受管理的素材存储，不能承诺永久直链。

### 生图 · 请求模板与维护

模板保存在浏览器服务商配置，提交时使用 `requestTemplate`，轮询时使用 `x-request-template`。占位符为 `{{model}}`、`{{prompt}}`、`{{size}}`、`{{width}}`、`{{height}}`、`{{n}}`、`{{images}}`、`{{negativePrompt}}`、`{{taskId}}`；`{{apiKey}}` 仅允许出现在请求头。地址须为公网 HTTPS，禁止设置 Host、Cookie，整体不超过 32KB。

结果路径用点号，例如 `output.choices.0.message.content.0.image`。异步模板需额外设置轮询地址、状态路径、成功值及失败值；设置页提供千问同步和异步预设。

新增协议实现 `imageProtocol` 并在 `resolveImageProtocol` 注册，提交和查询必须同时适配。代码入口为 `src/backend/internal/generate/image_submit.go`，同目录的 `image_run.go` 与 `image_execute.go` 处理适配和执行。封面和电商图文的业务规则分别见[封面](poster.md)、[图组绑定](workshop-asset-binding.md)。

## 视频生成

### 视频 · 项目请求

提交为 `POST /api/generate/video`。下面只展示业务请求体，应用鉴权、工作区及渠道凭证由前端统一请求层携带。请求前必须保存稳定的 `clientTaskId`，重试和恢复沿用该标识。

```json
{
  "model": "doubao-seedance-2.0-mini",
  "prompt": "人物保持同一身份，在明亮展厅自然转身，镜头稳定，衣服外观沿用首帧。",
  "duration": 5,
  "aspect_ratio": "16:9",
  "resolution": "720P",
  "ref_mode": "first_last_frame",
  "first_frame_image": "https://example.com/assets/start.jpg",
  "last_frame_image": "https://example.com/assets/end.jpg",
  "audio": true,
  "clientTaskId": "sales-demo-unique-id"
}
```

实际字段使用 `aspect_ratio`、`first_frame_image`、`last_frame_image`、`camera_motion`、`camera_control`，不用 `aspectRatio`、`firstFrameUrl`、`lastFrameUrl`、`cameraMotion`。全能参考使用 `images` / `videos` / `audios` 数组；`audio` 只控制输出声音，不能替代音频参考输入。`ref_mode` 可为 `omni`、`first_frame`、`last_frame`、`first_last_frame`、`text`、`edit`、`extend`、`motion_control`，实际允许值按型号和渠道校验；尾帧单独生成仅向 H3 官方 / 秘塔原生线路开放，动作控制向可灵官方及 Comfly 的 3.0 / 2.6 线路开放。

### 视频 · 已接入参数

| 当前渠道型号 | 输出时长 | 接入清晰度 | 接入方式与限制 |
| --- | --- | --- | --- |
| kling-4.0 | 3–30 秒 | 720P / 1080P | 可灵官方文生、首帧、首尾帧、全能参考、视频编辑 |
| kling-4.0-flash | 3–20 秒 | 720P | 可灵官方文生、单首帧、全能参考、视频编辑 |
| doubao-seedance-2.5 | 4–30 秒 | 480P / 720P / 1080P | 全能参考、首帧、首尾帧、文生、编辑、延长；编辑跟随原视频时长 |
| doubao-seedance-2-0-260128 | 4–15 秒 | 480P / 720P / 1080P / 4K | 与 2.5 同一组方式；参考图保持 reference_image，编辑和延长写 omni_reference_task_type |
| doubao-seedance-2-0-fast-260128 | 4–15 秒 | 480P / 720P | 同上，并去掉不支持的高清选项 |
| doubao-seedance-2.0-mini | 4–15 秒 | 480P / 720P | 同上；保留渠道模型别名 |
| veo3.1 | 4 / 6 / 8 秒；延长新增 7 秒（Cloud）或 8 秒（Comfly） | 720P / 1080P / 4K | 全能参考最多 3 张，与首尾帧互斥；参考图、首尾帧和高分辨率限定 8 秒；延长方式见下文 |
| veo3.1-fast | 4 / 6 / 8 秒；延长同上 | 渠道保留 720P / 1080P / 4K，Cloud Fast 最高 1080P | 同上；Comfly Fast 使用其文档中的 `veo3.1` 别名 |
| omni_flash-10s | 10 秒 | 720P | 文本及公网图片走 [统一 JSON](https://gpt-best.apifox.cn/api-514127998)，含本地素材、视频参考或视频修改时走 [文件上传](https://gpt-best.apifox.cn/api-483608139)。文生、首帧、首尾帧、全能参考、编辑和延长均以官方来源 / 参考标签明确素材角色；图片与视频合计最多 7 项。[查询进度](https://gpt-best.apifox.cn/api-483608140) 使用创建返回的任务 ID，比例 `16:9` / `9:16` |
| kling-video-v3 | 3–15 秒；动作控制跟随素材 | 720P / 1080P / 4K；动作控制最高 1080P | 文生、首帧、首尾帧；官方及 Comfly 线路另提供动作控制，需要一张人物图和一段视频 |
| kling-video-v3-omni | 3–15 秒；编辑跟随原片 | 720P / 1080P / 4K | 全能参考、首帧、首尾帧、文生、编辑、延长；延长使用 feature 视频并明确生成下一镜头，编辑源标为 base；含视频最多 4 图，否则最多 7 图 |
| kling-video-v2-6 | 3–10 秒；动作控制跟随素材 | 720P / 1080P | 文生、首帧、首尾帧；官方及 Comfly 线路另提供动作控制 |
| kling-video-v2-5-turbo | 5 / 10 秒 | 720P / 1080P | 文生、首帧、首尾帧；不提供参考视频入口 |
| MiniMax-H3 | 4–15 秒 | 768P / 2K | 文生、首帧、首尾帧、全能参考分开；官方原生线路另支持仅尾帧生成；全能参考可混合图片、视频和音频。2K 是分辨率，不是再生成接口 |
| MiniMax-H3（秘塔） | 所有清晰度均为 4–15 整数秒 | 480P / 768P / 1080P / 2K | 应用主动限制为最多 15 秒，避免超时长翻倍计费；1080P 与 2K 独立，保留全能参考音频及仅尾帧生成 |
| wan3.0-video | 2–30 秒 | 480P / 720P / 1080P | 首尾帧与参考图、参考视频互斥；支持自动比例和 21:9 |
| grok-imagine-video-1.5 | 1–15 秒 | 480P / 720P / 1080P；参考图、首尾帧或预置音色最高 720P | 官方直连走 `/v1/videos/generations`，中转保留 `/xai/v1/videos/generations`。参考图最多 14 张；官方预置音色最多 3 个。1.5 官方及 Comfly 线路不开放编辑、延长；Comfly 这两个接口公布的是旧版 grok-imagine-video |
| viduq3 | 3–16 秒 | 540P / 720P / 1080P | 只接全能参考，提交 `reference2video`，最多 7 张参考图 |
| viduq3-mix | 3–15 秒 | 720P / 1080P | 只接全能参考，提交 `reference2video`，最多 7 张参考图 |
| viduq3-turbo | 1–16 秒；全能参考 ≥3 秒 | 540P / 720P / 1080P | 文生、首帧、首尾帧、全能参考分别走 text2video、img2video、start-end2video、reference2video，参考图最多 7 张 |
| viduq3-pro | 1–16 秒 | 540P / 720P / 1080P | 仅支持首帧、首尾帧、文生（img2video、start-end2video、text2video），不支持 reference2video |
| viduq4-preview | 3–16 秒 | 540P / 720P / 1080P / 2K / 4K | 全能参考最多 15 张图、3 段参考音频；首帧不接参考音频。声音默认开启且可关闭。`vidu-q4-preview` 与 `viduq4` 查同一份能力，提交仍用所选原始型号 |
| sora-2 | 保留渠道 10 / 15 秒 | 保留渠道档位 | 保留已有渠道配置；是否可用须渠道确认 |
| sora-2-pro | 保留渠道 10 / 15 / 25 秒 | 保留渠道档位 | 同上；渠道时长不代表官方 API 规格 |

默认分辨率优先 480P，不支持时选 720P，仍不支持时选择能力列表最低档；保留用户已选且模型支持的更高档。Veo 清晰度和时长按渠道、生成方式区分：Cloud Fast 最高 1080P；普通生成的高分辨率限定 8 秒，延长独立校验。具体规格由 `src/backend/internal/generate/video_specs.go` 和共享模型能力维护。

### 视频 · 素材与组合限制

MiniMax-H3 提示词最多 7000 个 Unicode 字符，Wan 3.0 最多 20000 个；应用在上传素材和创建视频任务前拒绝超长正文，不静默截断，保留用户原稿供精简。H3 非原样传输时追加的静音说明也计入上限。[H3 官方接口](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create.md)、[Wan 3.0 官方接口](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference)。Wan 请求显式传入 `seed` 时保留至 `parameters.seed`，允许 `-1` 或 `0`～`2147483647` 的整数；不传则保持供应商随机生成。同种子仅用于减少复测变量，不保证结果完全相同。

首帧、仅尾帧各要求一张图，首尾帧要求两张图，均不带参考视频；文生不带视觉素材。参考模式中的一张图仍然是主体、外观或风格参考，不能自动改成首帧。编辑和延长必须有目标视频，Grok 的这两种方式限定一段视频且不带图片；官方及 Comfly 已核实的这两个接口仅使用旧版 `grok-imagine-video`，1.5 在提交前明确拒绝，不自动更换模型。

模型校验上限：Vidu Q3 系列 7 图、Vidu Q4 15 图、Veo 全能参考 3 图、Wan 10 图 / 5 视频、H3 9 图 / 3 视频且合计不超过 12、Grok 全能参考 14 图、可灵 Omni 无视频时 7 图、带视频时 4 图，最多 1 段视频。Seedance 目录上限见下一节。HTTP 的 `images` / `videos` 数组另有 30 / 10 通用上限；目录上限更大不代表当前接口接受更多素材。

图片和视频各按自己的输入顺序编号，提示词先提到“图片2”不会改变实际数组排序。首尾帧与全能参考的角色不能混发；远程素材的编码、分辨率、体积及总时长仍受上游校验，尚未完成统一元数据预检。

参考人声通过 `audios` 真实进入视频请求，接入 Seedance 2.0 系列、Seedance 2.5、MiniMax-H3、Wan 3.0 与 Vidu Q4 Preview 的 `omni` 模式；不支持的型号、其他模式或显式关闭声音时携带参考音频均在提交前拒绝，不默默忽略。Seedance 与 H3 音频映射为 `content` 中的 `audio_url` 对象及 `role=reference_audio`；Wan 映射为 `input.media` 中的 `type=reference_audio`；Vidu Q4 映射为顶层 `sounds` 数组，并显式发送 `audio=true`。音频按输入顺序独立编号为“音频1”等，其他厂商 TTS `voice_id` 不直接传给视频模型。

Grok 1.5 普通账号使用官方预置音色，内部字段为独立的 `voice_ids`（最多 3 个），出站映射为 `reference_audios: [{voice_id: "eve"}]`，提示词用 `<AUDIO_0>` 等引用。预置音色可与图片组合或单独使用，最高 720P，不能与文件 `audios`、关闭声音或编辑/延长混用。电商真人口播中须明确选择 Grok 官方音色；原声音库绑定保留，文件样本不会被悄悄改用或发送给 Grok。官方自有音频文件参考仅向获准合作伙伴开放，本应用不把该权限当作普通账号能力。[Grok 参考音色说明](https://docs.x.ai/developers/model-capabilities/video/reference-to-video#reference-audio)。

H3 参考音频最多 3 段，每段 2–15 秒且总长不超过 15 秒，格式为 MP3/WAV，每个文件不超过 15 MB。参考音频可与参考图片、参考视频组合，不能与 `first_frame` / `last_frame` 混用。本地样本复用下述格式转换、时长检测和截取提交副本流程；远程引用须为公网 HTTP(S) 链接，编码、大小和时长交由上游校验。官方 V2 没有 `generate_audio` 开关，人声作为参考条件进入 `content`。

Vidu Q4 参考音频最多 3 段，每段 3–12 秒，只接 MP3，不另设 12 秒总长限制，且必须同时有参考图片。本地样本超长时从开头自动截取提交副本并转成 MP3；编码预留少量帧填充空间，转换后重新检测实际时长，确保不超过 12 秒。声音库原件与试听不变，不变速、不补静音；不足 3 秒时明确提示更换样本。应用本地源文件仍沿用 15 MiB 上限。公网 HTTP(S) 音频链接直接提交，远程编码、大小和时长由上游校验，不接受 OSS 或 `asset://` 引用。提交诊断记录 `sounds` 的数量、顺序、声音开关，以及本地源时长、实际提交时长和是否截取，不记录完整音频链接。Q4 首帧在 `preserve_prompt` 下关闭 `is_rec` 提示词扩写；参考生接口不发送该字段。

音色参考与本片口播分别提供：可重复使用同一份声音样本，每次只修改提示词中的实际台词，无需先合成本次完整口播。提示词须明确音频只提供音色与说话特征，不照读样本原句；这属于参考条件生成，不承诺音色或台词完全一致。[Seedance 官方提示词说明](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh)要求明确各素材提供的外貌、动作或音色；[Wan 3.0 官方指南](https://help.aliyun.com/zh/model-studio/wan3-video-generation-guide)直接演示提取参考音频的音色并说出新台词。Wan 2.6 的 `input.audio_url` 和 Wan 2.7 图生视频的 `driving_audio` 属于音轨驱动，不能视为同一用途。样本链接失效时需重新提供可访问地址，不代表要重新合成声音文件。

Seedance 2.0 最多 3 段参考音频，单段 2–15 秒且总长不超过 15 秒，至少同时提供一张图片或一段视频；图片、视频、音频合计采用 [Dreamina 官方说明](https://dreamina.capcut.com/tools/seedance-2-0)的保守上限 12 份。Seedance 2.5 最多 10 段音频，单段 2–30 秒且总长不超过 30 秒，允许仅参考音频，图片、视频和音频合计最多 50 份。Wan 3.0 最多 5 段，单段 1–15 秒且总长不超过 15 秒，与首帧/首尾帧互斥，不使用 Wan 2.7 的 `driving_audio`；参考音频只按已核实的 `wan3.0-video` / `wan3.0-video-prime` 型号放行，不推断后续版本能力。三者均使用 MP3/WAV，单文件不超过 15 MiB。本地音频在上传前核对工作区、字节格式、源文件大小和实际时长。超过单段或本地音频合计上限时，按输入顺序保留开头片段，并为后续每段预留最低时长，不丢弃参考音频；不足最低时长则在上传与生成前报错。已有 M4A、AAC、OGG、FLAC、OPUS 样本及需要截取的 MP3/WAV 经 FFmpeg 生成 PCM16 单声道 WAV 提交副本，再检测实际输出时长。未超长且格式已受支持的 MP3/WAV 原字节直通；声音库原件与试听不变，不变速、不补静音。临时文件在成功、失败或取消后清理，重复已接受任务不重新转换或上传。原 MP3/WAV 继续核对格式，不用转换兜底接收伪造或未知格式。随后按请求对象存储配置上传，以可访问的 HTTP(S) 链接提交。Seedance 参考音频不自动注册为 `Audio` 素材，也不复用此前自动注册的音频素材缓存，避免部分渠道对音频 `asset://` 返回 1007 错误。显式传入的 Seedance `asset://` 仍沿用原验证路径；图片与视频预检及素材缓存保持原有规则。自动截取只处理应用本地样本；公网 URL、OSS 临时链接或 Seedance `asset://` 的编码、大小及完整总时长仍由上游校验，不下载或改写这些远程引用。参考音色会参与生成，不保证逐样本或逐波形一致。

万相参考图片支持公网 URL 或 Base64，本地图片由后端转换。参考视频必须使用公网 HTTP(S) 链接；当前工作区的 `/storage/` 视频（包括深度参考视频）会按请求头、请求体或服务端环境的对象存储配置自动上传，OSS 私有桶使用 24 小时签名读取链接，无需开启公共读。参考视频上传沿用 32 MiB 上限，与生成结果是否持久化独立；未配置存储、上传失败或素材不属于当前工作区时，在调用视频生成前返回明确错误。任务先以原素材地址领取防重回执，再上传素材，重复提交同一任务不会因签名变化重复上传或生成。

### 视频 · Seedance 请求与创作要点

- 参考图与首帧语义不同。一个 reference_image 仍然是外观、主体或风格参考；只有明确选择首帧/首尾帧时才发 first_frame / last_frame。
- 2.0 与 2.5 都露出全能参考、首帧、首尾帧、文生、编辑和延长。2.5 的首帧、首尾帧、编辑和延长跟随素材比例；普通参考模式保留选定比例。编辑发 `duration=-1` 和 `omni_reference_task_type=edit`；延长发 `extend`。提示词必须同时明确编辑或延长意图。
- 能力目录与 HTTP 校验中 2.5 图/视频上限为 30 / 10，2.0 系列为 9 / 3。素材分别按类型编号，图片1和视频1可以同时存在。排列依据上传顺序，不因在提示词中先提到图片2就交换素材位置。
- 先写主体、环境与主要动作，再写镜头、视觉风格、台词与声音。多个素材各自明确用途；不要重复堆砌相互矛盾的镜头要求。
- 2.5 长叙事可按整数秒分段，时间范围与总时长一致；2.0 使用“镜头一、镜头二”表达顺序，不能承诺精确时间轴控制。电商视频在 2.0 系列中将原时间标为动作定位记录，口播依照镜头顺序与语义停顿，不强制每个短动作段重新起腔。图生视频主要描述画面接下来如何变化，避免反复重述静态图片。
- 编辑写明目标素材、修改范围、保留范围。延长写后续动作与镜头，不重写原片剧情。

[Seedance 2.5 官方说明](https://ark.volcengine.com/region:cn-beijing/docs/ark/seedance-2-5) · [Seedance 2.0 官方说明](https://ark.volcengine.com/region:cn-beijing/docs/ark/seedance-2-0) · [创建视频任务](https://ark.volcengine.com/region:cn-beijing/docs/ark/create-video-generation-task-api)

### 视频 · 渠道路由与字段映射

分发实现见 `src/backend/internal/generate/video_endpoints.go`，字段构造由同目录各家族适配文件维护；前端只维护能力和输入约束，不另存一套端点及请求组装实现。

- 火山官方 `ark.<region>.volces.com` 只使用 `/api/v3/contents/generations/tasks` 及对应任务查询，不附加网关前缀或降级为统一格式。其他渠道的 Seedance 首选 `/seedance/v3/contents/generations/tasks`。切换到统一 `/v2/videos/generations` 时将 `content` 转为 `prompt`、`images` 和 `video`。需要参考音频、多视频或无法用统一格式表达图片角色的任务只使用官方格式。参考素材写 `reference_image`，首尾帧才写对应帧角色。当渠道支持 `/seedance/v3/assets/create` 与 `/seedance/v3/assets/query` 时，可通过 `POST /api/generate/seedance/precheck` 在深度转换、素材入库或选用阶段提前完成本地视频 2~30 秒时长校验及 Seedance 合规检测，也可以在提交视频时自动上传并轮询等待状态变为 `Active` 后以 `asset://{assetId}` 引用；若素材包含敏感内容或检测未通过，在提交视频任务前直接拦截并提示更换素材。
- Seedance 素材缓存按渠道、凭证摘要、型号及工作区隔离，预检携带当前型号。缓存复用前重新查询状态；明确不存在、删除或过期时从原始素材重新注册，鉴权或合规失败直接拦截。404 不再视为审核通过；查询接口不支持且新建素材未确认 `Active` 时，使用原始素材链接且预检不标为通过。素材重建发生在生成提交之前，不会自动重发已经提交的付费任务。
- Comfly 的[素材上传](https://gpt-best.apifox.cn/api-440932655)与[状态查询](https://gpt-best.apifox.cn/api-441771025)接口不提供型号选择参数。其 [Seedance 2.5 官方格式](https://gpt-best.apifox.cn/api-515548387)支持公网素材 URL，因此在 `ai.comfly.org` / `comfly.org` 的 2.5 请求中，自动注册的图片和视频完成合规检查后仍使用原始 HTTP(S) 链接提交，避免依赖素材接口与生成接口的资产作用域一致。本地 `/storage/` 素材重新上传并使用本次签名链接，不把本地路径发往上游；显式输入的 `asset://` 仍校验并原样使用。已授权人像的资产引用方式仍取决于上游规则，不能将预检通过视为生成必然成功。
- 可灵官方使用 `/v1/videos/text2video`、`image2video` 或 `omni-video`，网关保留 `/kling` 前缀。Omni 参考图不标帧 type，首尾帧写 `image_list.type`；视频参考使用 `video_list.refer_type=feature`，编辑使用 `base`，省略时长、关闭 multi_shot，视频原声随用户声音开关保留或丢弃，`sound` 固定 off。可灵比例仅为 16:9 / 9:16 / 1:1，不因字段允许 image_tail 就推断支持仅尾帧。
- 可灵官方动作控制使用 `/motion-control/kling-3.0` 或 `/motion-control/kling-2.6`，采用 contents / settings，人物朝向跟随参考视频，允许输入 3–30 秒视频，实际时长由上游提取到的有效动作决定；不发送用户生成时长和比例。查询使用 `/tasks?task_ids=...`，按精确任务 ID 读取 data 数组及 outputs 中的视频。Comfly 使用已核实的旧版 `/kling/v1/videos/motion-control` 与对应 GET 查询，携带 `model_name`、`image_url`、`video_url`、`character_orientation=video`、`mode=std/pro` 以及 `keep_original_sound`；不把新版 contents / settings 发给该接口。其他未核实渠道不显示动作控制。本地图片转换为裸 Base64，视频必须为公网地址或经已配置对象存储上传的工作区素材。
- Wan 在千问 / DashScope 主机只走原生 `/api/v1/services/aigc/video-generation/video-synthesis`；Comfly 使用 `/qwen/api/v1/...`。Comfly 的透传端点明确拒绝路由时，可切换到 `/v1/videos` 的统一 JSON 并查询同一格式的任务地址。其他网关按 `/wan`、`/qwen`、原生路径排列候选，保留 `{ model, input, parameters }` 和异步请求头。
- Vidu 官方 api.vidu.cn / api.vidu.com 使用 `/ent/v2` 和 `Authorization: Token ...`，提交与查询都不加网关前缀；其他网关保留原协议。按方式使用 `text2video`、`img2video`、`start-end2video`、`reference2video`；保留渠道别名，不把所有型号重写为 Q4。
- Vidu 图片在提交前统一准备：当前工作区 `/storage/...` 图片读取并转换为带 MIME 前缀的 Base64，保留参考顺序和公网图片链接，`//` 链接补为 HTTPS；本地原图不改写。无需为图片单独配置对象存储。最终请求体超过 20MB 时在本地拒绝，并提示压缩图片或改用公网链接。
- Grok 在官方全球地址 `api.x.ai` 使用 `/v1/videos/generations` 和 `/v1/videos/{request_id}`，服务重启后的查询也使用官方路径。`us.api.x.ai` 当前不开放视频接口，在本地提示切换全球地址。其他中转保留 `/xai/v1/videos/...`；已含 `/xai/v1` 的渠道地址不重复添加前缀。参考图写 `reference_images`，首帧与尾帧分别写 `image`、`last_frame`，预置音色写 `reference_audios`，查询识别 `request_id` 与 `video.url`。当前工作区 `/storage/` 图片在防重领取后转成带 MIME 的 data URI，保留素材顺序，不要求配置对象存储；本地 MP4 视频沿用应用 32 MiB 上限并转换为 data URI。其他工作区、非法路径与格式在生成前拒绝。
- H3 根据所选主机区分协议：MiniMax 官方主机使用 `POST /v2/video_generation`，媒体放在带 role 的 `content` 中，分辨率为 `768P` / `2K`，查询使用 `GET /v2/query/video_generation/{task_id}`。界面原有 `720P` / `1080P` 持久化值分别映射为这两个官方档位，原生值也可提交。
- 秘塔 H3 精确识别 `metaso.cn`，使用 `POST https://metaso.cn/api/minimax/v2/video_generation` 与 `GET https://metaso.cn/api/minimax/v2/query/video_generation/{task_id}`。渠道地址可填站点根、`/api`、`/api/minimax` 或 `/api/minimax/v2`，运行时统一为上述路径；提交保留官方 `content`（包括 `reference_audio`）并默认 `fast_mode=false`。查询识别 `task.status` 与 `task.content.url`，服务重启后仍使用秘塔路径，不回退到旧 flat 接口。成片由 `files.metaso.cn` 提供，媒体代理仅精确允许该文件域名，原样保留上游签名参数；访问仍须经过应用鉴权和网络地址校验。
- 秘塔默认 480P，应用将 480P / 768P / 1080P / 2K 的生成时长统一限制为 4–15 整数秒，避免触发超过 15 秒的翻倍计费。旧 `720P` 只兼容映射为 768P，`1080P` 保持 1080P，不映射为 2K；官方与其他渠道的规格沿用各自规则。参数选项、分镜时长规划与前后端提交校验均遵循此上限，旧草稿超过 15 秒时不得提交。
- 秘塔 H3 的 IR Context 用于优化多模态素材理解与提示词表达，默认开启，开启时按 0.05 元/次单独计费。生成参数提供独立开关，提交时显式传入布尔字段 `context_ir_enabled`；`true` 开启、`false` 关闭，其优先级高于秘塔控制台的全局 H3-Context-IR 开关。旧草稿未保存该字段时默认开启，显式关闭在草稿和历史任务复用中保留；其他渠道不转发此字段。提交诊断记录实际出站值 `contextIrEnabled`。
- 秘塔渠道超过 15 秒的基础费、素材费和输出费会翻倍，因此本应用不提供超过 15 秒的生成；IR Context 仍按 0.05 元/次原价单独计费，关闭时不计该项费用。参数面板展示应用时长上限和当前 IR Context 开关状态，不用其他渠道的固定报价推算秘塔实际金额。视频再生成仍按其独立接口限制执行，本项目没有接入再生成接口。此处秘塔接口与规格依据用户提供的渠道说明，不外推至 MiniMax 官方或其他网关。
- Comfly 的 H3 使用已发布的 `POST /v1/videos` multipart 表单，图片、视频、音频分别使用 `imageUrls` / `videoUrls` / `audioUrls` 同名重复字段，`seconds` 为字符串，分辨率为 `768P` / `2k`。文生使用 `text-to-video`，首帧及首尾帧使用 `image-to-video`，全能参考使用 `multimodal-to-video`；查询为 `/v1/videos/{task_id}`。不自动尝试其标记未开放的 JSON 或官方格式接口。其他网关保留原有统一格式候选。`/minimax/v1/video_generation` 使用 `content`，从 `task.id` 读取任务编号。

候选路径只在代码允许的明确拒绝条件下继续尝试，不能理解为任意失败都会换地址。5xx、网络错误和成功响应缺少任务号可能意味着已接单，须保留未知状态。渠道结果 URL 不保证长期有效，完成后按媒体保存流程处理。

#### 可灵 4.0 官方线路

在设置添加可灵官方服务商后，将 `kling-4.0` 或 `kling-4.0-flash` 绑定到该服务商。按模式分别提交到 `/text-to-video/{model}`、`/image-to-video/{model}` 或 `/omni-video/{model}`，分辨率和时长使用 `settings`。图生比例随关键帧，文生选择固定比例，Omni 支持自动比例。参考素材按 `refer_image`、`feature_video` 传入，编辑用第一个视频作为 `base_video`。查询固定走 `GET /tasks?task_ids=...`。声音沿用官方模型行为。

[可灵 4.0 Omni API](https://kling.ai/document-api/api/video/4-0/video-omni) · [可灵 4.0 Flash Omni API](https://kling.ai/document-api/api/video/4-0-flash/video-omni)

### 视频 · 任务回执与恢复

视频接口在付费提交前按工作区和客户端标识原子领取任务；同标识不同参数报冲突，重复请求返回原操作。响应可带 `submissionOutcome`，用于区分已接受、明确拒绝与未知提交。

新提交同时保存脱敏 `submissionDiagnostics`：渠道模型标识、实际提交端点的 host/path、音频参考数量与角色、原始本地文件及提交引用的 SHA-256、本地源时长与实际提交时长、是否截取、明确提供的声音开关和提交结果。记录按工作区和任务隔离，保存在应用数据目录 `submission-receipts/video`，不保存密钥、签名链接、音频内容或绝对素材路径。提交前记录失败会在付费调用前停止；提交后记录更新失败仅返回 `diagnosticsSaved=false`，不把已受理任务改成可重提。按 `taskKey` 查询或幂等复用时可恢复诊断，旧任务没有该记录时不推断当时的请求。诊断证明应用实际发送了哪些内容，不能证明渠道已采用参考音频或将渠道别名等同于未返回的底层型号。

没有收到上游任务号时先查 `GET /api/generate/video?taskKey=原客户端标识`；取得任务号后用 `?taskId=原任务号&model=原模型` 查询，并携带原渠道信息。未知状态不能自动另建付费任务，服务重启后也应先核对原回执。旧客户端未保存标识时，无法保证重新 POST 的跨请求防重。

Seedance 方舟直连在请求边界将项目的 mini 和 2.5 别名映射为 `doubao-seedance-2-0-mini-260615` 和 `doubao-seedance-2-5-260628`。任务保留所选模型，查询分别读取方舟 `content.video_url` 和统一网关 `data.output`，原样保留成片 URL 签名参数。 [方舟型号](https://console.volcengine.com/ark/region:cn-beijing/docs/model-list) · [网关查询协议](https://gpt-best.apifox.cn/api-343444780)

电商视频使用[商品短片](video-sales.md)与画布节点；画布素材保存见[无限画布](canvas.md)。

### 视频 · 官方能力与渠道边界

能力核对日期为 2026-11-11。同系列型号按各自规格校验。

- Gemini Omni Flash 1.2 走 fal 的 `google/gemini-omni-flash/v1.2/` 提交端点。保存 `request_id`，通过共享的 `/google/gemini-omni-flash/requests/{id}/status` 和 `/google/gemini-omni-flash/requests/{id}` 查询状态与结果。Google Interactions 协议为独立官方线路。 [fal 队列](https://fal.ai/docs/documentation/model-apis/inference/queue) · [Google Omni](https://aistudio.google.com/docs/omni?hl=zh-cn)
- Google Gemini API 的 Veo 3.1 Preview 已下线，项目中的 Google Cloud Veo 3.1 使用已发布的 GA 模型。视频理解文档对应文本分析流程。 [Google 视频生成](https://aistudio.google.com/docs/video?hl=zh-cn) · [Google 视频理解](https://aistudio.google.com/docs/video-understanding?hl=zh-cn)
- MiniMax H3 的 Context IR、普通提交和二次编辑各有独立协议。应用现有生成路径使用 V2 创建和查询，二次编辑端点未挂到普通生成请求。 [H3 Context IR](https://platform.minimax.cn/docs/api-reference/video-generation-v2-h3-context-ir) · [H3 二次编辑](https://platform.minimax.cn/docs/api-reference/video-generation-v2-regeneration)

- Omni Flash 的来源 / 参考角色使用 [Google 官方标签](https://aistudio.google.com/docs/omni#set-image-roles)：首帧 `<FIRST_FRAME>`、尾帧 `<LAST_FRAME>`、编辑源 `<VIDEO_0>`、延长源 `<PREVIOUS_VIDEO>`，普通参考图和视频使用各自 REF 标签。标签进入实际 JSON / multipart 提示词，不能只在界面上改名称。
- Veo 延长已分两条链路：Google Cloud GA 使用 `predictLongRunning` / `fetchPredictOperation` 原生延长，新增 7 秒；Comfly 公布的 Veo 接口没有原生延长字段，采用“末帧续拍延长”，以原片最后一帧调用图生视频生成 8 秒续段，再通过 FFmpeg 自动拼接。界面显示当前方法，不能将续拍宣称为原生视频上下文延长。[Cloud 延长限制](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/extend-videos)、[Comfly 图生视频](https://gpt-best.apifox.cn/api-343632235)。
- Cloud Base URL 必须包含项目与区域，例如 `https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google`，凭证使用 Google Cloud Bearer 访问令牌；选择普通 / Fast 分别映射 `veo-3.1-generate-001` / `veo-3.1-fast-generate-001`。支持文生、首帧、首尾帧、参考图和原生延长。操作编号校验所属项目、区域、模型，再编码保存到任务回执；轮询通过 POST 发送 `operationName`。本地及 HTTP(S) 素材转换为 `bytesBase64Encoded`，Cloud Storage 素材可用 `gcsUri`。输入原片要求 MP4、1–30 秒、24 fps、16:9 或 9:16，720P / 1080P / 4K；本地和下载原片在付费生成前预检。内联成片保存至当前工作区，GCS 结果通过固定 Google 存储端点鉴权下载。
- Comfly 多图参考必须使用 `veo3.1-components` 与 `images`，避免普通 `veo3.1` 将两张参考图解释为首尾帧；Fast 别名映射至 Comfly 文档的 `veo3.1`，原始所选型号仍保存在任务中。Comfly 延长仅接受一段 1–30 秒原片，不混用参考图和音频，比例须与原片一致。原片及拼接计划先持久化，再提交付费续拍；查询返回续段后先报告拼接进度，只有完整成片校验成功才标记成功。保留原片声音，续段无声时补齐静音轨以保持音画时长；完成地址为拼接后的工作区视频。重复提交沿用回执，拼接失败或重启后查询恢复拼接，不重新付费生成。浏览器本地视频先存入工作区，无需为这条链路配置 OSS；现有本地上传上限为 32 MiB，后端公网原片及成片读取上限为 128 MiB。私有恢复素材位于数据目录 `submission-receipts/video-extension`，不能作为垃圾缓存清理。
- Sora 官方 Videos API 与 Sora 2 / Pro 已于 2026-09-24 移除，保留的渠道别名不代表官方编辑、重混或延长接口仍然可用。[OpenAI 下线公告](https://developers.openai.com/api/docs/deprecations)。
- 分镜复刻模板默认首帧与 768P，完整模式列表不会被模板过滤；手动选择其他方式后，预览、提示词技能、素材校验和提交共同使用所选方式。仅默认首帧流程保留秘塔专用限制；改为其他方式时，用户须按该方式调整连线，文生不能带视觉素材，首尾帧须恰好两张图片。

### 视频 · 接入边界与验证

通用视频 API 与电商视频口播接入上述 Seedance、H3、Wan 与 Vidu Q4 文件音频参考，以及 Grok 1.5 官方预置音色；画布当前仍只接入图片、参考视频与输出音频开关。H3 的角色库、局部蒙版、样片模式、2K 再生成和超长视频拼接不作为已完成功能。H3 的 2K 分辨率选项不等于接入另一条付费再生成接口。

正式请求映射回归测试保留在源码旁的 `*.test.ts` / `*_test.go`；只有一次性验证脚本、截图和报告放项目外。统一检查使用 `pnpm check`。模拟测试通过只验证适配行为，不证明素材质量或渠道在线可用。

### 视频 · 其他厂商依据

- [Google Veo API 与 Prompt 指南](https://ai.google.dev/gemini-api/docs/veo?hl=zh-cn)、[Gemini Omni Flash 视频生成与编辑](https://ai.google.dev/gemini-api/docs/omni?hl=zh-cn)：用主体、动作、镜头与音效组织描述；参数组合按时长、分辨率、参考方式校验。
- [可灵能力表](https://kling.ai/document-api/guides/capability-map/video)、[文生视频字段](https://kling.ai/document-api/api/video/2-6/text-to-video/legacy)、[Omni 素材结构](https://kling.ai/document-api/api/video/o1/video-omni/legacy)、[3.0 创作指南](https://kling.ai/quickstart/klingai-video-3-model-user-guide)：质量 mode 与生成端点互不混用；对话注明说话主体，镜头叙事明确先后关系。部分页面仅官方搜索索引可读；[动作控制](https://kling.ai/document-api/api/video/motion-control/2-6)与[接口更新](https://kling.ai/document-api/updates/api)用于核对当前动作控制、4K 和视频参考限制。
- [MiniMax H3 创建接口](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create)、[官方查询接口](https://platform.minimax.cn/docs/api-reference/video-generation-v2-query)、[H3 创作示例](https://platform.minimax.io/docs/guides/video-prompt)：官方 V2 使用带 role 的 `content` 数组；参考音频为 `audio_url: { url }` 和 `role=reference_audio`。[Comfly H3](https://gpt-best.apifox.cn/api-495802284)使用 multipart 和 `audioUrls`，其[查询接口](https://gpt-best.apifox.cn/api-495802285)使用 `/v1/videos/{task_id}`。2K 再生成是另一条付费接口，未接入。提示词分别交代人物、环境、产品、音色和风格素材的用途。
- [万相 3.0 API](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference)、[使用指南](https://help.aliyun.com/zh/model-studio/wan3-video-generation-guide)：保持 input.media 的角色和各类型编号一致；现有适配保留 prompt_extend 智能改写。
- [Grok 视频生成](https://docs.x.ai/developers/rest-api-reference/inference/videos)、[编辑](https://docs.x.ai/developers/rest-api-reference/inference/videos#video-edit)、[延长](https://docs.x.ai/developers/rest-api-reference/inference/videos#video-extension)：创建任务的 request_id 是此系列的任务编号。成片地址在 `video.url`。
- [Vidu Q4 图生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/image-to-video)、[参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/reference-to-video.md)：参考图走 `reference2video`，首帧才走 `img2video`。渠道型号仍用现有别名，不替换成 `viduq4-preview`。
- [OpenAI 服务变更公告](https://developers.openai.com/api/docs/deprecations)：核对官方服务状态时使用；项目保留的 Sora 渠道别名须另向渠道确认。

Comfly 一致性回归覆盖当前批准目录的所有可见生成方式：校验所需素材、允许时长和比例、适配后的素材保留与出站端点。H3 首帧及首尾帧面板显示自适应比例，与实际 multipart 请求一致。这些测试不等同于 Comfly 线上成片验收。

## 语音合成与音频处理

### 语音 · 当前范围

`POST /api/generate/audio` 当前调用语音合成 `SynthesizeSpeech`，不是音乐生成入口。语音默认配置在 `src/shared/domain/models/modalityDefaults.ts`，设置页与此 HTTP 接口省略模型时使用 `speech-2.8-hd`。

模型名识别、设置页条目和完整业务链路是不同层次。识别到 Whisper 或音乐模型名不代表已接入转写、字幕提取或歌曲生成。

### 语音 · 请求与结果

以下为请求体示例；应用鉴权、工作区及音频渠道凭证由统一请求层携带。音色应使用该渠道可用的 voice id。

```json
{
  "model": "speech-2.8-hd",
  "text": "这款衬衫采用宽松版型，适合日常通勤搭配。",
  "voice": "male-qn-qingse",
  "speed": 1,
  "volume": 1,
  "format": "mp3"
}
```

文本读取 `prompt`，为空时读取 `text`；接口还读取 `model`、`voice`、`speed`、`volume`、`format` 和渠道凭证。当前业务接口不读取 `pitch`、`emotion`，不能将上游全部参数直接抄入产品样例。

成功时返回 `success`、`taskId`、`recordId`、`model`、`status: "SUCCESS"`、`audioUrl`、`prompt`，可能附带 `usage`；不返回 `durationSeconds`。上游字节结果保存为工作区音频，拿到远端 URL 时沿实际保存结果返回可播放地址。

`GET /api/generate/audio?taskId=...` 或 `?taskKey=...` 查询本地任务记录；不是向 Suno 等上游查询音乐队列。音频提交使用统一操作回执。同一次操作复用原 `x-idempotency-key` 或 `clientTaskId`，同时提供时二者须一致。响应丢失先查原记录，提交结果未知时沿用原操作标识。

### 语音 · 家族适配

`src/backend/internal/generate/speech.go` 根据模型 ID 生成候选请求：

- MiniMax：`speech-*`、minimax、t2a 家族优先 `/v1/t2a_v2`，文本写入 `text`，音色与语速、音量写入 `voice_setting`。
- ElevenLabs：优先 `/v1/text-to-speech/{voice_id}`，使用 `model_id`。
- CosyVoice：优先 `/api/v1/services/aigc/text2audio/generation`，文本和音色放 `input`。
- 豆包 TTS：优先 `/api/v1/tts`，音色使用 `voice_type`。
- 其余使用 `/v1/audio/speech`，文本映射为 `input`。

前四类还保留 OpenAI 兼容候选路径，是否继续尝试取决于 `speech.go` 的错误处理；不能一概宣称仅 404/405 才继续。不同家族的音色、格式与参数并不通用，实际能力还取决于渠道。

### 语音 · 维护

通用语音合成接口与已保存的语音模型配置保留。

实现真源为 `src/backend/internal/generate/audio_route.go` 与同目录 `speech.go`。厂商参考见 [OpenAI Audio](https://platform.openai.com/docs/api-reference/audio) · [MiniMax Speech](https://platform.minimaxi.com/document/t2a_v2) · [CosyVoice](https://help.aliyun.com/zh/model-studio/cosyvoice) · [ElevenLabs](https://elevenlabs.io/docs/api-reference)。

## 现有渠道兼容

对话、文案与视觉分析的项目默认选择为 `gpt-6-luna`，已有的用户选择优先。模型选择器会区分官方与聚合渠道，绑定厂商 API 时使用上表的地址和对应凭证。

历史别名由现有渠道提供，例如 `seedream-v5-pro`、`nano-banana-pro`、`veo3.1-pro`、`omni_flash-10s`。Midjourney 现有网关使用 `midjourney` → `mj_fast_imagine` 的 Imagine / Action / Fetch 流程。秘塔 MiniMax H3、Comfly 及已有 Sora 条目沿用各自协议，详见[视频生成](#视频生成)。

### 网关文档标识

资料站点：https://gpt-best.apifox.cn。以下标识供查找网关资料使用，不是运行时请求端点。

| 模型 / 协议 | API ID → 文档 slug |
| --- | --- |
| `gpt-image-2.5-flare` | `515692647` → `gpt-image-2.5-flare-generations`<br>`515693438` → `gpt-image-2.5-flare-edits` |
| `gpt-image-2.5-sunburst` | `515693868` → `gpt-image-2.5-sunburst-generations`<br>`515694152` → `gpt-image-2.5-sunburst-edits` |
| `gpt-image-2` | `514117865` → `gpt-image-2-generations`<br>`528133582` → `gpt-image-2-edits`<br>`447261009` → `gpt-image-2-official-generations`<br>`447258891` → `gpt-image-2-official-edits` |
| `nano-banana-pro` | `420361512` → `nano-banana-pro-generations`<br>`420361517` → `nano-banana-pro-edits`<br>`406882253` → `nano-banana-pro-gemini-official` |
| `nano-banana` | `341817446` → `nano-banana-generations`<br>`341817449` → `nano-banana-edits`<br>`363472251` → `nano-banana-gemini-official` |
| `doubao-seedream-4-0-250828` | `302915860` → `dalle-generations`<br>`288978020` → `dalle-edits` |
| `doubao-seedream-4-5-251128` | `302915860` → `dalle-generations`<br>`288978020` → `dalle-edits` |
| `doubao-seedream-5-0-260128` | `302915860` → `dalle-generations`<br>`288978020` → `dalle-edits` |
| `seedream-v5-pro` | `514194485` → `seedream-v5-pro`<br>`510779216` → `seedream-v5-pro-layer-decomposition` |
| `qwen-image-max` | `302915860` → `dalle-generations` |
| `z-image-turbo` | `302915860` → `dalle-generations` |
| `qwen-image` | `332494686` → `qwen-image` |
| `qwen-image-edit` | `338005095` → `qwen-image-edit`<br>`338005715` → `qwen-image-edit-async` |
| `midjourney` | `139393505` → `mj-imagine`<br>`139393501` → `mj-action`<br>`139393509` → `mj-fetch` |
| `flux` | `258068997` → `flux-dalle`<br>`303213093` → `flux-edits` |
| `flux-pro-max` | `258068997` → `flux-dalle`<br>`382419079` → `flux-2-pro` |
| `grok-4.1-image` | `512413121` → `grok-4.1-image-generations`<br>`512843738` → `grok-4.1-image-edits` |
| `grok-4.2-image` | `509383421` → `grok-4.2-image`<br>`512857860` → `grok-4.2-image-generations`<br>`512878064` → `grok-4.2-image-edits` |
| `grok-imagine-image-quality` | `515602253` → `grok-imagine-image-quality-generations`<br>`515605101` → `grok-imagine-image-quality-edits` |
| `veo3.1` | `343590061` → `veo-text2video`<br>`343632235` → `veo-image2video`<br>`343593236` → `veo-query` |
| `veo3.1-fast` | `343590061` → `veo-text2video`<br>`343632235` → `veo-image2video`<br>`343593236` → `veo-query` |
| `omni_flash-10s` | `514127998` → `omni_flash-10s`<br>`483608139` → `veo-omini`<br>`483608140` → `veo-omini-query` |
| `kling-video-v3` | `216574019` → `kling-text2video`<br>`216574020` → `kling-image2video`<br>`253413276` → `kling-query` |
| `kling-video-v3-omni` | `384889432` → `kling-omni-video`<br>`384982099` → `kling-omni-query` |
| `kling-video-v2-5-turbo` | `216574019` → `kling-text2video`<br>`216574020` → `kling-image2video` |
| `kling-video-v2-6` | `216574019` → `kling-text2video`<br>`216574020` → `kling-image2video` |
| `doubao-seedance-2-0-260128` | `510664179` → `seedance-2-0-unified`<br>`513325304` → `seedance-2-0-official` |
| `doubao-seedance-2-0-fast-260128` | `510675713` → `seedance-2-0-fast-unified`<br>`513325331` → `seedance-2-0-fast-official` |
| `doubao-seedance-2.0-mini` | `510506694` → `seedance-2.0-mini-unified`<br>`513301405` → `seedance-2.0-mini-official` |
| `doubao-seedance-2.5` | `515403085` → `seedance-2.5-unified`<br>`515548387` → `seedance-2.5-official` |
| `sora-2` | `358024351` → `sora-2-text2video`<br>`358024500` → `sora-2-image2video`<br>`358024353` → `sora-2-query`<br>`362481361` → `sora-2-official-create`<br>`362760648` → `sora-2-official-query` |
| `sora-2-pro` | `358024351` → `sora-2-text2video`<br>`362481361` → `sora-2-official-create` |
| `MiniMax-H3` | `495802284` → `minimax-h3`<br>`495802285` → `minimax-h3-query`<br>`514901439` → `minimax-h3-unified` |
| `wan3.0-video` | `515688928` → `wan3.0-video-unified`<br>`510825402` → `wan3.0-video-official` |
| `grok-imagine-video-1.5` | `515382337` → `grok-imagine-video-1.5-unified`<br>`510458707` → `grok-imagine-video-1.5-official` |
| `viduq3` | `374481802` → `vidu-text2video`<br>`374481658` → `vidu-image2video`<br>`374481783` → `vidu-reference`<br>`374481785` → `vidu-start-end`<br>`374481817` → `vidu-query` |
| `viduq3-mix` | `374481802` → `vidu-text2video`<br>`374481817` → `vidu-query` |
| `viduq3-turbo` | `374481802` → `vidu-text2video`<br>`374481817` → `vidu-query` |
| `viduq3-pro` | `374481802` → `vidu-text2video`<br>`374481817` → `vidu-query` |
| `viduq4-preview` | `374481802` → `vidu-text2video`<br>`374481658` → `vidu-image2video`<br>`374481783` → `vidu-reference`<br>`374481785` → `vidu-start-end`<br>`374481817` → `vidu-query` |
| `multimodal-chat` | `139393491` → `chat-completions`<br>`287782723` → `chat-stream`<br>`139453850` → `chat-vision`<br>`321040299` → `chat-video`<br>`287782788` → `chat-structured`<br>`223322111` → `chat-tools`<br>`228980408` → `claude-messages`<br>`350079690` → `gemini-official`<br>`321434971` → `responses-create` |

### 渠道显示

模型选择器上的短名来自 `src/shared/domain/models/deepseek.ts`。新增渠道时只加一行登记：

- 官方接口设置 `kind: 'official'`，触发器显示「官方」。
- 第三方网关默认显示渠道 id 的首字母大写。两个网关首字母相同时，给后接入的渠道写上明确的 `badge`。
- 未登记的自定义渠道 id 也回退为首字母大写。完整渠道名仍用在设置页和提示信息里。

## DeepSeek 接入约定

思考档位与运行流程见[文本协议与思考强度](#文本协议与思考强度)和[助手执行机制](assistant-runtime.md)。

- 设置页使用正式 Base URL `https://api.deepseek.com`，通过 Bearer API Key 认证；Beta 地址不作为全局网关。
- 助手使用 `/chat/completions` 与消息历史；视觉内容使用 user 消息中的标准图片内容块。生成图片、视频继续使用对应网关与适配器。
- 模型发现使用 `GET /models`，结果仍需经过项目批准模型筛选；查询余额使用 `GET /user/balance`，金额字段按字符串处理。
- 工具轮次保留 `reasoning_content`，规范空消息内容，并按项目兼容逻辑处理思考模式下的 `tool_choice`。工具参数在执行前校验，截断参数不得执行。
- 流式回复按 SSE 处理，同时读取推理、正文与用量；空回复、截断或上游中止不能当作成功完成。

参考：[Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)、[图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision)、[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)、[模型列表](https://api-docs.deepseek.com/zh-cn/api/list-models)、[查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance)。

## 调用与回执

- 音频、封面标题与封面设计在模型调用前持久保存操作回执。调用方以 `x-idempotency-key` 标识一次用户意图；音频同时提供 `clientTaskId` 时二者必须一致。回执按工作区、阶段和操作标识隔离，同键同输入只执行一次，同键不同输入或渠道返回冲突。无客户端标识的旧调用会获分配服务端标识，但不同无标识请求仍是不同操作，不能据此识别重复用户意图。
- 统一幂等层在回执读取、领取或结算存储失败时保留原操作标识并返回未知状态，不将“本次未执行”推断为“原操作被拒绝”，也不返回互相矛盾的明确拒绝标记；恢复存储后核对原操作，不自动换标识补发。
- 音频 POST 先领取或核对幂等回执，再校验文本与接口配置。同键参数或凭证变化返回冲突，不另写失败任务覆盖原操作；首次明确校验拒绝也保存回执，重复提交和 GET 查询返回原拒绝结果。
- 带货视频在 POST 前按工作区与生成输入持久保存操作标识，并先保存页面恢复回执；任务名称不参与身份。提交结果未知时复用原标识，只查询原 taskKey，不因刷新、重试或换渠道自动换键补发。只有原操作明确拒绝或提交前取消才释放；已确认完成后的新生成可分配新标识。
- 带货音视频在提交前保存原工作区、渠道摘要、模型及视频计价参数。正常完成、后台任务与原操作恢复的累计用量关联同一操作，部分回执补全不重复增加调用次数；后台视频保留已收到的用量与原记录编号。视频恢复回执同时保存原操作标识及 `recordId`，旧直接轮询通过 `x-task-record-id` 指定原记录，同号渠道任务不会共用用量身份。缺少提交前用量归属的历史任务仅恢复结果，不猜测当前渠道。
- 带货配音在提交前持久保存按工作区与配音输入关联的操作标识；首次回执丢失后，同输入继续核对原音频回执，不分配新标识。后台配音失败仍保留原操作键、未知标志及已收到的用量。浏览器无法保存标识时不提交；已知拒绝与提交前取消可以释放该标识，未知结果不释放。操作领取、完成和明确拒绝后的释放使用同源跨页面排他锁；多页面并发只分配一个待确认标识，普通延迟提交复用已完成操作，只有显式再次生成才能领取新标识。无法取得安全锁时阻止新提交，原任务仍可通过已有回执恢复。
- 普通生成区图片、音频提交结果未知时，使用原 `taskKey` 查询并携带 `closeMissing=true`。后端按工作区、媒体类型原子封闭确实缺失的操作标识，与原 POST 的占位写入竞争；封闭成功后迟到的旧 POST 不调用模型。已有占位、未知回执及历史音频任务不被覆盖；存储故障或旧服务仅返回“查无记录”时保持恢复保护，不能按查询次数超时换键。收到明确失败或已封闭回执后，用户重试才创建新操作。
- 深度任务回执区分确实不存在、执行中、读取失败和已结算。执行中与读取失败均保留恢复保护，不能累计为“未找到任务”后自动放弃原操作。
- 封面客户端先保存每个阶段的操作标识和模型，再调用模型；刷新或断连后先用原接口的 `GET ?operationKey=...` 查询。只有明确的 `operation_not_found` 才可使用原标识提交；回执未知、查询故障或旧后端不支持回执接口时不补发。回执重放保留原用量，客户端按阶段标识去重记账。旧历史中正在进行的文本阶段若没有回执标识，保留待核对状态，不自动重做。
- 浏览器断连不取消已领取的后台操作，执行与结算使用有界独立上下文。服务重启后遗留的未结算回执表示结果未知，不按“仍在运行”推断，也不因等待超时重新调用模型。音频传输错误、408、5xx 或已报告用量的失败不切换端点；只有明确、未报告用量的 404/405/415 协议拒绝允许兼容回退。
- 流式文本失败，以及非流式文本或 Responses 输出校验失败，仍返回已观察到的模型身份和用量，并标记提交结果未知；不携带可被误当成完整回复的正文或工具调用。未收到的用量不估算，已收到的失败用量仍可对账。
- 图片、视频已受理后，状态查询的 401、403、429 和服务异常不作为生成失败证据，继续保留原任务并核对；只有明确的任务终态才结束原任务，不因查询受阻自动重新生成。
- 图片、视频的进行中用量收到后立即以有界独立上下文持久保存；累计回执按输入、输出、总量的已知最大值合并，不相加、不被旧回执回滚。终态没有再次报告用量时返回已保存值；保存失败仍保留本次观察值，并返回 `usagePersisted: false`，不能声称已落库。
- 普通助手聊天在网络提交前持久保存原工作区、有效渠道摘要和轮次标识，并冻结本次请求的渠道参数。流式用量立即按原 turnId 入账，断流不丢弃已观察用量；快照恢复继续补全同一条记录，重复或旧快照不重复计费。历史缺少原统计范围时不猜测归属当前渠道。
- 清空统计先持久保存新的统计代次，再清理旧日志；所有页面在入账、排队、实际写入及读取时均核对回执携带的原代次，存储层不能将旧回执改盖为当前代次；清空前待存记录及迟到旧写入不能复活。提交前保存的用量范围携带原统计代次，助手、生成区、带货和工坊的旧回执重放均不能归入清空后的统计；旧范围未携带代次时按初始代次处理。清空后新增调用正常入账；代次标记无法保存时不删除原历史，并反馈清空失败。
- 浏览器用量按页面独立保存任务回执，读取时合并累计值，跨标签页不写回共享整表；旧日志原位保留。容量不足时保留已有历史，新回执暂留当前页面并显示补存提示，可释放空间后重试或在页面重新获得焦点时补存；补存前关闭页面会丢失尚未落盘的回执。清空统计由用户显式操作。
- 生成区 Agent 在提交前保存用量范围，以原 turnId 关联流式累计用量与恢复快照。重放不重复计数，较旧快照不减少已收到用量；恢复不将用量归入当前新渠道。缺少原范围的旧任务不猜测归属。
- 普通生成区图片、视频和音频以及共享生图 API 仅在确认结果成功后增加成功产出。提交接受回执本身不计成功；进行中、失败或未知回执若带已报告用量则保留消耗，以原操作和记录编号累计合并，成功后提升同一条记录，旧回执不撤销成功。图片失败任务按原 `taskKey` 恢复时同时返回已保存用量、`recordId` 和真实 `taskId`，不依赖再次访问上游。
- 生成区刷新恢复、会话合并与数据库同步统一按原记录编号和本地任务身份匹配，并核对已知工作区、渠道摘要与媒体类型。上游任务号不是全局身份，仅在原统计范围一致、候选唯一且没有记录编号冲突时作为兼容别名；历史缺少原范围时不按任务号猜测合并。数据库回执未包含统计范围时保留本地原范围，不能覆盖为当前渠道。
- 封面按原 `taskKey` 恢复终态时，在导出前按原用量范围补存计费与成功产出；导出失败不丢弃生图回执，重复恢复不重复入账，清空前回执不进入新统计。
- 工坊单图提交前持久保存原用量范围，收到回执后在轮询前确认原记录编号已保存；批次刷新恢复保留这些字段。恢复只查询原任务，并补全同一条用量记录；未保存编号的旧任务优先用原操作键查询，缺少原用量范围时不猜测归属。明确新尝试清除旧编号和用量范围。
- 客户端用量去重按工作区、有效渠道与媒体类型隔离，再关联本地操作标识及服务端记录编号。渠道与工作区只保存摘要，不保存密钥；操作恢复使用提交前保存的原范围。用户明确重试或再次生成会分配新任务标识，并在新提交前重新记录当前工作区和渠道范围，不继承原任务的统计归属；原任务记录不变。多个渠道存在同号任务时，查询通过 `x-task-record-id` 指定原记录，缺少编号则不猜测。旧用量日志缺少范围时保留原样，不自动归属当前工作区或合并进新记录。
- 部分用量补全后更新同一条日志及其参考成本，不增加调用次数或素材数量；明确记录的成本（包括本地深度处理的零成本）不被默认估算覆盖。参考成本仍不代表渠道实际扣费。

- 服务商详情中的地址、密钥、协议和启用状态在点击「保存配置」前仅为编辑草稿。保存时服务商记录、关联模型继承凭证与对应全局凭据成组提交；写入失败保留原运行配置并提示重试。关闭设置会丢弃尚未保存的服务商草稿。新增和移除也必须先完成持久化，才更新界面并提示成功。
- 连接检测结果仅对应检测时的配置版本；编辑、保存、移除或关闭设置后，旧响应不得更新当前检测状态。模型目录检测通过仍不代表生成能力、余额或所有模型可用。
- 共享生图提交与本次轮询使用同一份有效渠道配置，模型完整独立凭证优先于渠道和全局默认值。新生图回执持久保存渠道摘要；刷新后地址、账户密钥、协议或请求模板不匹配时返回 `task_route_changed`，停止向其他渠道查询，也不补发生成。恢复原配置后可继续核对。迁移前没有摘要的旧回执保留原兼容行为，无法追溯其原渠道。
- 新视频回执在调用前保存渠道、模型及凭证的摘要，并在结算时保存实际提交端点对应的查询路径；重启不依赖内存路由缓存。轮询前核对摘要，配置改变时不向上游请求。已保存的终态结果可直接读取；缺少摘要的旧视频进行中任务保留待核对状态，不猜测原渠道。

- 画布节点、Agent 创作输入栏和批量清单按当前模型和渠道提供生成参数。图片输出尺寸与 GPT Image 生成质量独立设置；视频按生成方式、比例、清晰度和时长的依赖顺序校正旧配置，清单预览使用同一套参数。支持音频开关的模型按当前选择提交。

## 接入维护流程

1. 分清设置种子、批准目录、模型能力与渠道路由，保留用户所选渠道别名，不擅自替换为官方型号。
2. 在现有共享能力与 Go 适配器中补齐参数、提交和查询；新增对外接口时同步 `src/shared/contracts/openapi.yaml`，不另建 Node API。
3. 同步尺寸、时长、分辨率、输入数量、参考角色及错误处理，分别核对前端选项、契约与后端校验。
4. 为必要适配行为增加源码旁回归测试，执行 `pnpm check:model-catalog`、`pnpm check:openapi` 及相关测试。付费在线验证单独记录渠道与实际组合，不以列表发现成功替代。
5. 在本页更新对应的配置与官方资料链接，产品流程链接到对应章节。

### 代码位置

| 职责 | 位置 |
| --- | --- |
| 模型批准目录与设置默认值 | `src/shared/domain/models/model-catalog/`、`src/shared/domain/models/model-catalog/selectionRules.json`、`src/shared/domain/models/modalityDefaults.ts` |
| 前端图像与视频能力及图像尺寸 | `src/shared/domain/media/`、`src/shared/domain/models/model-adapters/image/` |
| 文本、图片、视频和语音请求及渠道分发 | `src/backend/internal/gateway/`、`src/backend/internal/generate/` |
| 对外接口契约 | `src/shared/contracts/openapi.yaml` |

# 模型接入索引

模型目录统一引用本页。模型 ID、适配器和能力以 `src/shared/domain/models/modelCatalog/` 与 `modelAdapters/` 为准；官网链接与网关文档标识集中保存在 本页的模型与来源、网关文档标识两节。

## 调用约定

- 聊天模型统一使用当前 OpenAI 兼容通道的 `/v1/chat/completions`；Claude / Gemini 原生接口仅供对照，不据此切换运行协议。
- `qwen-image-max` 使用通用 DALL·E Generations；旧别名 `qwen-image-3` 已从原清单修正。
- Midjourney 网关模型 ID 为 `midjourney`，运行时提交为 `mj_fast_imagine`；网关 v7/v8 共用 Imagine / Action / Fetch 接口。其 Apifox 链接是网关资料，不是厂商官方 API。
- 网关别名与官方型号分别处理，不能因为链接指向某厂商就认定其所有参数适用于当前通道。

## 接入细节

- [视频能力与请求映射](video-capabilities.md)
- [思考强度适配](reasoning.md)
- [DeepSeek 接入约定](#deepseek-接入约定)

## 模型与来源

以下合并自原逐模型索引；下方网关文档标识保留各条目的 API ID 与 slug。来源链接不代表当前渠道已完成在线验收。

| 模型 / 协议 | 类型 | 厂商 / 协议组 | 参考资料 |
| --- | --- | --- | --- |
| `gpt-image-2.5-flare` | image | openai | [OpenAI Images API](https://platform.openai.com/docs/api-reference/images) · [OpenAI Image generation guide](https://platform.openai.com/docs/guides/image-generation) |
| `gpt-image-2.5-sunburst` | image | openai | [OpenAI Images API](https://platform.openai.com/docs/api-reference/images) |
| `gpt-image-2` | image | openai | [OpenAI Images API](https://platform.openai.com/docs/api-reference/images) |
| `nano-banana-pro` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation) |
| `nano-banana` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation) |
| `doubao-seedream-4-0-250828` | image | volcengine | [火山方舟图像生成](https://www.volcengine.com/docs/82379) |
| `doubao-seedream-4-5-251128` | image | volcengine | [火山方舟图像生成](https://www.volcengine.com/docs/82379) |
| `doubao-seedream-5-0-260128` | image | volcengine | [火山方舟图像生成](https://www.volcengine.com/docs/82379) |
| `seedream-v5-pro` | image | volcengine | [火山方舟图像生成](https://www.volcengine.com/docs/82379) |
| `qwen-image-max` | image | alibaba | [阿里云百炼文生图](https://help.aliyun.com/zh/model-studio/text-to-image) |
| `z-image-turbo` | image | alibaba | [阿里云百炼文生图](https://help.aliyun.com/zh/model-studio/text-to-image) |
| `qwen-image` | image | alibaba | [通义千问图像生成](https://help.aliyun.com/zh/model-studio/qwen-image-api) |
| `qwen-image-edit` | image | alibaba | [通义千问图像编辑](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api) |
| `midjourney` | image | midjourney | [Midjourney 接入向导](https://gpt-best.apifox.cn/doc-6172523.md) |
| `flux` | image | bfl | [BFL API](https://docs.bfl.ai/) |
| `flux-pro-max` | image | bfl | [BFL API](https://docs.bfl.ai/) |
| `grok-4.1-image` | image | xai | [xAI image generation](https://docs.x.ai/docs/guides/image-generation) |
| `grok-4.2-image` | image | xai | [xAI image generation](https://docs.x.ai/docs/guides/image-generation) |
| `grok-imagine-image-quality` | image | xai | [xAI image generation](https://docs.x.ai/docs/guides/image-generation) |
| `veo3.1` | video | google | [Gemini Veo](https://ai.google.dev/gemini-api/docs/video) |
| `veo3.1-fast` | video | google | [Gemini Veo](https://ai.google.dev/gemini-api/docs/video) |
| `omni_flash-10s` | video | google | [Gemini Veo](https://ai.google.dev/gemini-api/docs/video) |
| `kling-video-v3` | video | kling | [可灵开放平台](https://app.klingai.com/cn/dev/document-api/apiReference/model/textToVideo) |
| `kling-video-v3-omni` | video | kling | [可灵 Omni-Video](https://app.klingai.com/cn/dev/document-api/apiReference/model/omniVideo) |
| `kling-video-v2-5-turbo` | video | kling | [可灵开放平台](https://app.klingai.com/cn/dev/document-api/apiReference/model/textToVideo) |
| `kling-video-v2-6` | video | kling | [可灵开放平台](https://app.klingai.com/cn/dev/document-api/apiReference/model/textToVideo) |
| `doubao-seedance-2-0-260128` | video | volcengine | [火山方舟视频生成](https://www.volcengine.com/docs/82379/1520757) |
| `doubao-seedance-2-0-fast-260128` | video | volcengine | [火山方舟视频生成](https://www.volcengine.com/docs/82379/1520757) |
| `doubao-seedance-2.0-mini` | video | volcengine | [火山方舟视频生成](https://www.volcengine.com/docs/82379/1520757) |
| `doubao-seedance-2.5` | video | volcengine | [火山方舟视频生成](https://www.volcengine.com/docs/82379/1520757) |
| `sora-2` | video | openai | [OpenAI Videos API](https://platform.openai.com/docs/api-reference/videos) |
| `sora-2-pro` | video | openai | [OpenAI Videos API](https://platform.openai.com/docs/api-reference/videos) |
| `MiniMax-H3` | video | minimax | [MiniMax 视频生成](https://platform.minimaxi.com/document/video_api_intro) |
| `wan3.0-video` | video | alibaba | [通义万相视频生成](https://help.aliyun.com/zh/model-studio/wan-video) |
| `grok-imagine-video-1.5` | video | xai | [xAI video generation](https://docs.x.ai/developers/model-capabilities/video/generation) |
| `viduq3` | video | vidu | [Vidu API](https://platform.vidu.com/docs/api) |
| `viduq3-mix` | video | vidu | [Vidu API](https://platform.vidu.com/docs/api) |
| `viduq3-turbo` | video | vidu | [Vidu API](https://platform.vidu.com/docs/api) |
| `viduq3-pro` | video | vidu | [Vidu API](https://platform.vidu.com/docs/api) |
| `multimodal-chat` | multimodal | chat | [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) · [Anthropic Messages](https://docs.anthropic.com/en/api/messages) · [Gemini generateContent](https://ai.google.dev/api/generate-content) · [DeepSeek API](https://api-docs.deepseek.com/) · [Moonshot Kimi](https://platform.moonshot.cn/docs/api/chat) |

## 网关文档标识

资料站点：https://gpt-best.apifox.cn。以下标识供查找网关资料使用，不是运行时请求端点。

| 模型 / 协议 | API ID → 文档 slug |
| --- | --- |
| `gpt-image-2.5-flare` | `515692647` → `gpt-image-2.5-flare-generations`<br>`515693438` → `gpt-image-2.5-flare-edits` |
| `gpt-image-2.5-sunburst` | `515693868` → `gpt-image-2.5-sunburst-generations`<br>`515694152` → `gpt-image-2.5-sunburst-edits` |
| `gpt-image-2` | `514117865` → `gpt-image-2-generations`<br>`514118355` → `gpt-image-2-edits`<br>`447261009` → `gpt-image-2-official-generations`<br>`447258891` → `gpt-image-2-official-edits` |
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
| `multimodal-chat` | `139393491` → `chat-completions`<br>`287782723` → `chat-stream`<br>`139453850` → `chat-vision`<br>`321040299` → `chat-video`<br>`287782788` → `chat-structured`<br>`223322111` → `chat-tools`<br>`228980408` → `claude-messages`<br>`350079690` → `gemini-official`<br>`321434971` → `responses-create` |

## DeepSeek 接入约定

从原 DeepSeek 接入参考（整理于 2026-09-22）提炼；这里只保留项目接入要点，参数适配以 [思考强度](reasoning.md) 与 [助手执行机制](assistant-runtime.md) 为准，不将历史型号示例当作永久白名单。

- 设置页使用正式 Base URL `https://api.deepseek.com`，通过 Bearer API Key 认证；Beta 地址不作为全局网关。
- 助手使用 `/chat/completions` 与消息历史；视觉内容使用 user 消息中的标准图片内容块。生成图片、视频继续使用对应网关与适配器。
- 模型发现使用 `GET /models`，结果仍需经过项目批准模型筛选；查询余额使用 `GET /user/balance`，金额字段按字符串处理。
- 工具轮次保留 `reasoning_content`，规范空消息内容，并按项目兼容逻辑处理思考模式下的 `tool_choice`。工具参数在执行前校验，截断参数不得执行。
- 流式回复按 SSE 处理，同时读取推理、正文与用量；空回复、截断或上游中止不能当作成功完成。
- 原参考中的 Beta 前缀续写、FIM 与 Responses 示例不代表助手已接入这些执行路径，因此不再保留通用教程代码。

参考：[Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)、[图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision)、[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)、[模型列表](https://api-docs.deepseek.com/zh-cn/api/list-models)、[查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance)。

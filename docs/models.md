# 模型接入索引

模型目录统一引用本页。模型 ID、适配器和能力以 `src/shared/domain/models/model-catalog/` 与同级 `model-adapters/` 为准；官网链接与网关文档标识集中保存在本页。设置页的模态种子来自 `src/shared/domain/models/modalityDefaults.ts`，不能把设置条目等同于完整产品能力。

## 调用约定

- Gemini、Claude 的文本及图片理解默认使用各自原生协议，分别访问 `generateContent` / `streamGenerateContent` 与 `/v1/messages`；单模型 `textProtocol` 可显式切回 OpenAI 兼容。保留所选渠道地址和密钥，原生失败不静默回退。其他聊天模型继续使用当前 OpenAI 兼容通道的 `/v1/chat/completions`。千问 / DashScope 域名走 `/compatible-mode/v1/chat/completions` 和 `/compatible-mode/v1/models`。具体能力与验证边界见 [思考强度适配](reasoning.md)。
- 在设置里添加服务商并填写 `https://maas.qianwenaiapi.com` 后，生图会走 DashScope 原生接口。`qwen-image` 同步返回图片，`wan2.6` / `wan2.7` 图像模型异步轮询。界面上的 4K 只会留给 `wan2.7-image-pro`，千问图像模型不发送 OpenAI 的 `quality`。
- 聚合网关上的 `qwen-image-max` 仍使用通用 DALL·E Generations；旧别名 `qwen-image-3` 已从原清单修正。
- Midjourney 网关模型 ID 为 `midjourney`，运行时提交为 `mj_fast_imagine`；网关 v7/v8 共用 Imagine / Action / Fetch 接口。其 Apifox 链接是网关资料，不是厂商官方 API。
- 网关别名与官方型号分别处理，不能因为链接指向某厂商就认定其所有参数适用于当前通道。

## 接入细节

- [多模态与对话模型调用参考指南](多模态与对话模型调用参考.md)
- [生图与图像编辑模型调用参考指南](生图与图像编辑模型调用参考.md)
- [视频生成模型调用参考指南](视频生成模型调用参考.md)
- [语音合成与音频处理调用参考指南](语音合成与音频处理调用参考.md)
- [思考强度适配](reasoning.md)
- [DeepSeek 接入约定](#deepseek-接入约定)

## 配置存在但尚未形成完整产品链路

- **3D**：设置默认模型为 `fal-ai/hunyuan-3d/v3.1/pro`（Hunyuan 3D）。`src/backend/internal/gateway/threed_submit.go` 有通用提交封装，但当前 Go 路由与 OpenAPI 未暴露 `/api/generate/threed`，也没有完整产品调用链；不保留虚构的本地接口样例。
- **音乐**：设置种子为 `suno`、`elevenlabs-music`、`minimax-music`。当前未形成歌曲提交、轮询和产物保存链路；`/api/generate/audio` 实际执行语音合成，不能用于证明 Suno 已接入。

这些条目保留配置用途。启用生产功能前需补齐契约、路由、提交防重、状态恢复、产物保存和真实调用验证，不能只增加模型名或下载域名就宣布完成。

扩展参考：[Tripo 开发文档](https://platform.tripo3d.ai/docs)、[Fal 模型平台](https://fal.ai/)、[MiniMax 音乐资料](https://platform.minimaxi.com/document/music_generation)、[ElevenLabs API](https://elevenlabs.io/docs/api-reference)、[Suno 产品入口](https://suno.com/)。这些链接作为上游资料保留，不代表项目采用了相同接口、认证或任务结构。

## 接入维护流程

1. 分清设置种子、批准目录、模型能力与渠道路由，保留用户所选渠道别名，不擅自替换为官方型号。
2. 在现有共享能力与 Go 适配器中补齐参数、提交和查询；新增对外接口时同步 `src/shared/contracts/openapi.yaml`，不另建 Node API。
3. 同步尺寸、时长、分辨率、输入数量、参考角色及错误处理，分别核对前端选项、契约与后端校验。
4. 为必要适配行为增加源码旁回归测试，执行 `pnpm check:model-catalog`、`pnpm check:openapi` 及相关测试。付费在线验证单独记录渠道与实际组合，不以列表发现成功替代。
5. 更新本页来源和对应模态说明，产品流程通过链接引用，不在多页重复维护能力表。

## 模型与来源

以下合并自原逐模型索引；下方网关文档标识保留各条目的 API ID 与 slug。来源链接不代表当前渠道已完成在线验收。

| 模型 / 协议 | 类型 | 厂商 / 协议组 | 参考资料 |
| --- | --- | --- | --- |
| `gpt-image-2.5-flare` | image | openai | [OpenAI Images Generate](https://developers.openai.com/api/reference/resources/images/methods/generate?site_locale=en) · [OpenAI Images Edit](https://developers.openai.com/api/reference/resources/images/methods/edit) · [OpenAI Image generation guide](https://platform.openai.com/docs/guides/image-generation) |
| `gpt-image-2.5-sunburst` | image | openai | [OpenAI Images Generate](https://developers.openai.com/api/reference/resources/images/methods/generate?site_locale=en) · [OpenAI Images Edit](https://developers.openai.com/api/reference/resources/images/methods/edit) |
| `gpt-image-2` | image | openai | [OpenAI Images Generate](https://developers.openai.com/api/reference/resources/images/methods/generate?site_locale=en) · [OpenAI Images Edit](https://developers.openai.com/api/reference/resources/images/methods/edit) |
| `gemini-nano-banana-2.1` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios) |
| `gemini-3.1-flash-image` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios) |
| `gemini-3.1-flash-lite-image` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios) |
| `gemini-3-pro-image` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios) |
| `gemini-2.5-flash-image` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios) |
| `nano-banana-pro` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios) |
| `nano-banana` | image | google | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios) |
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
| `veo3.1` | video | google | [Gemini Veo](https://ai.google.dev/gemini-api/docs/veo?hl=zh-cn) |
| `veo3.1-fast` | video | google | [Gemini Veo](https://ai.google.dev/gemini-api/docs/veo?hl=zh-cn) |
| `omni_flash-10s` | video | google | [Gemini Omni Flash](https://ai.google.dev/gemini-api/docs/omni?hl=zh-cn) |
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
| `grok-imagine-video-1.5` | video | xai | [xAI Videos](https://docs.x.ai/developers/rest-api-reference/inference/videos) |
| `viduq3` | video | vidu | [Vidu Q4 参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/reference-to-video.md) |
| `viduq3-mix` | video | vidu | [Vidu Q4 参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/reference-to-video.md) |
| `viduq3-turbo` | video | vidu | [Vidu Q4 图生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/image-to-video) |
| `viduq3-pro` | video | vidu | [Vidu Q4 图生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/image-to-video) |
| `viduq4-preview` | video | vidu | [Vidu Q4 图生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/image-to-video)、[参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/reference-to-video.md) |
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
| `viduq4-preview` | `374481802` → `vidu-text2video`<br>`374481658` → `vidu-image2video`<br>`374481783` → `vidu-reference`<br>`374481785` → `vidu-start-end`<br>`374481817` → `vidu-query` |
| `multimodal-chat` | `139393491` → `chat-completions`<br>`287782723` → `chat-stream`<br>`139453850` → `chat-vision`<br>`321040299` → `chat-video`<br>`287782788` → `chat-structured`<br>`223322111` → `chat-tools`<br>`228980408` → `claude-messages`<br>`350079690` → `gemini-official`<br>`321434971` → `responses-create` |

## 渠道显示

模型选择器上的短名来自 `src/shared/domain/models/modelChannels.ts`。新增渠道时只加一行登记：

- 官方接口设置 `kind: 'official'`，触发器显示「官方」。
- 第三方网关默认显示渠道 id 的首字母大写。两个网关首字母相同时，给后接入的渠道写上明确的 `badge`。
- 未登记的自定义渠道 id 也回退为首字母大写。完整渠道名仍用在设置页和提示信息里。

## DeepSeek 接入约定

从原 DeepSeek 接入参考（整理于 2026-09-22）提炼；这里只保留项目接入要点，参数适配以 [思考强度](reasoning.md) 与 [助手执行机制](assistant-runtime.md) 为准，不将历史型号示例当作永久白名单。

- 设置页使用正式 Base URL `https://api.deepseek.com`，通过 Bearer API Key 认证；Beta 地址不作为全局网关。
- 助手使用 `/chat/completions` 与消息历史；视觉内容使用 user 消息中的标准图片内容块。生成图片、视频继续使用对应网关与适配器。
- 模型发现使用 `GET /models`，结果仍需经过项目批准模型筛选；查询余额使用 `GET /user/balance`，金额字段按字符串处理。
- 工具轮次保留 `reasoning_content`，规范空消息内容，并按项目兼容逻辑处理思考模式下的 `tool_choice`。工具参数在执行前校验，截断参数不得执行。
- 流式回复按 SSE 处理，同时读取推理、正文与用量；空回复、截断或上游中止不能当作成功完成。
- 原参考中的 Beta 前缀续写、FIM 与 Responses 示例不代表助手已接入这些执行路径，因此不再保留通用教程代码。

参考：[Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)、[图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision)、[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)、[模型列表](https://api-docs.deepseek.com/zh-cn/api/list-models)、[查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance)。

## 数字人驱动与语音合成

数字人功能重建中，旧人物、音色克隆、口播任务与驱动接口已移除。设置页保留数字人模型分类、线路和已保存的凭证；这些配置目前不提供数字人生成能力。历史数据库迁移与用户素材保留，供后续重建使用。

通用语音合成仍使用 `POST /api/generate/audio`，默认值、家族路径与结果保存规则见[语音合成接入](语音合成与音频处理调用参考.md)。

语音参考：[OpenAI Audio](https://platform.openai.com/docs/api-reference/audio)、[MiniMax Speech](https://platform.minimaxi.com/document/t2a_v2)、[CosyVoice](https://help.aliyun.com/zh/model-studio/cosyvoice)、[ElevenLabs](https://elevenlabs.io/docs/api-reference)。

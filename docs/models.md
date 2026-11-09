# 模型接入索引

设置 → API 接入 → 添加服务商支持按预设填写协议和地址。服务商须手动添加，密钥由该渠道、模型或后台的现有配置提供。设置侧栏的数量按各模态的配置目录计算，停用或移除服务商后不计入其绑定线路。该数量不代表账户已获得上游授权。

模型目录统一引用本页。模型 ID 以 `src/shared/domain/models/model-catalog/` 为准，前端能力约束在 `src/shared/domain/media/`，图像尺寸规则在 `src/shared/domain/models/model-adapters/image/`；实际请求组装与渠道分发统一由 `src/backend/internal/generate/` 和 `gateway/` 负责，不维护仅供测试调用的第二套 TypeScript 请求组装器。官网链接与网关文档标识集中保存在本页。设置页的模态种子来自 `src/shared/domain/models/modalityDefaults.ts`，不能把设置条目等同于完整产品能力。

## 调用约定

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

- 对话、文案及视觉分析默认使用 `gpt-6-luna`。已有的用户模型选择继续生效；未配置选择时优先使用已启用的 GPT 6 Luna 渠道。

- Gemini、Claude 的文本及图片理解默认使用各自原生协议，分别访问 `generateContent` / `streamGenerateContent` 与 `/v1/messages`；单模型 `textProtocol` 可显式切回 OpenAI 兼容。保留所选渠道地址和密钥，原生失败不静默回退。其他聊天模型继续使用当前 OpenAI 兼容通道的 `/v1/chat/completions`。千问 / DashScope 域名走 `/compatible-mode/v1/chat/completions` 和 `/compatible-mode/v1/models`。具体能力与验证边界见 [思考强度适配](reasoning.md)。
- 在设置里添加服务商并填写 `https://maas.qianwenaiapi.com` 后，生图会走 DashScope 原生接口。`qwen-image` 同步返回图片，`wan2.6` / `wan2.7` 图像模型异步轮询。界面上的 4K 只会留给 `wan2.7-image-pro`，千问图像模型不发送 OpenAI 的 `quality`。
- 聚合网关上的 `qwen-image-max` 仍使用通用 DALL·E Generations；旧别名 `qwen-image-3` 已从原清单修正。
- Midjourney 网关模型 ID 为 `midjourney`，运行时提交为 `mj_fast_imagine`；网关 v7/v8 共用 Imagine / Action / Fetch 接口。其 Apifox 链接是网关资料，不是厂商官方 API。
- 网关别名与官方型号分别处理，不能因为链接指向某厂商就认定其所有参数适用于当前通道。
- 秘塔 `metaso.cn` 的 H3 使用 `/api/minimax/v2/video_generation` 及对应 V2 查询，采用带 role 的 `content`；本应用将所有清晰度统一限制为 4–15 秒以避免超时长翻倍计费，详见[视频生成接入](视频生成模型调用参考.md)。

## 接入细节

- [多模态与对话模型调用参考指南](多模态与对话模型调用参考.md)
- [生图与图像编辑模型调用参考指南](生图与图像编辑模型调用参考.md)
- [视频生成模型调用参考指南](视频生成模型调用参考.md)
- [语音合成与音频处理调用参考指南](语音合成与音频处理调用参考.md)
- [思考强度适配](reasoning.md)
- [DeepSeek 接入约定](#deepseek-接入约定)

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
| `veo3.1-pro` | video | google | [Comfly 模型目录](https://ai.comfly.org/api/pricing) |
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
| `MiniMax-H3` | video | minimax | [MiniMax H3 V2 视频生成](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create) |
| `wan3.0-video` | video | alibaba | [通义万相视频生成](https://help.aliyun.com/zh/model-studio/wan-video) |
| `wan3.0-video-prime` | video | alibaba | [通义万相视频生成](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference) |
| `grok-imagine-video-1.5` | video | xai | [xAI Videos](https://docs.x.ai/developers/rest-api-reference/inference/videos) |
| `viduq3` | video | vidu | [Vidu Q3 参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/reference-to-video) |
| `viduq3-mix` | video | vidu | [Vidu Q3 参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/reference-to-video) |
| `viduq3-turbo` | video | vidu | [Vidu Q3 图生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/image-to-video)、[参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/reference-to-video) |
| `viduq3-pro` | video | vidu | [Vidu Q3 图生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/image-to-video)、[首尾帧](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/start-end-to-video)、[文生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/text-to-video) |
| `viduq4-preview` | video | vidu | [Vidu Q4 图生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/image-to-video)、[参考生视频](https://platform.vidu.cn/docs/api-reference/video-models/vidu-q4-preview/reference-to-video) |
| `multimodal-chat` | multimodal | chat | [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) · [Anthropic Messages](https://docs.anthropic.com/en/api/messages) · [Gemini generateContent](https://ai.google.dev/api/generate-content) · [DeepSeek API](https://api-docs.deepseek.com/) · [Moonshot Kimi](https://platform.moonshot.cn/docs/api/chat) |

## 网关文档标识

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

## 渠道显示

模型选择器上的短名来自 `src/shared/domain/models/deepseek.ts`。新增渠道时只加一行登记：

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

## 语音合成

通用语音合成使用 `POST /api/generate/audio`，默认值、家族路径与结果保存规则见[语音合成接入](语音合成与音频处理调用参考.md)。

语音参考：[OpenAI Audio](https://platform.openai.com/docs/api-reference/audio)、[MiniMax Speech](https://platform.minimaxi.com/document/t2a_v2)、[CosyVoice](https://help.aliyun.com/zh/model-studio/cosyvoice)、[ElevenLabs](https://elevenlabs.io/docs/api-reference)。

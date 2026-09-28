# 视频模型接入与提示词约定

核对日期：2026-09-27。覆盖当前目录的 20 个视频型号、8 个厂商系列。Seedance 依据本次提供的五份官方 API / Prompt 教程；其他系列依据下列官方网页。UI 仅暴露已接入的工作流，不把第三方产品的“样片”“5 分钟”等入口直接当成模型能力。

## 已接入参数

| 当前渠道型号 | 输出时长 | 接入清晰度 | 本次核对与处理 |
| --- | --- | --- | --- |
| doubao-seedance-2.5 | 4–30 秒 | 480P / 720P / 1080P | 分开首帧、首尾帧、参考、编辑、延长；编辑跟随原视频时长 |
| doubao-seedance-2-0-260128 | 4–15 秒 | 480P / 720P / 1080P / 4K | 参考图保持 reference_image，不因只有一张改成首帧 |
| doubao-seedance-2-0-fast-260128 | 4–15 秒 | 480P / 720P | 去掉不支持的高清选项 |
| doubao-seedance-2.0-mini | 4–15 秒 | 480P / 720P | 同上；保留渠道模型别名 |
| veo3.1 | 4 / 6 / 8 秒 | 720P / 1080P / 4K | 高分辨率和参考图模式限定 8 秒，比例 16:9 / 9:16 |
| veo3.1-fast | 4 / 6 / 8 秒 | 720P / 1080P | 同上；保留当前渠道已接入的分辨率子集 |
| omni_flash-10s | 渠道 10 秒 | 渠道 720P / 1080P | 官方对应型号未核实，不继承 Veo 3.1 的参数结论 |
| kling-video-v3 | 3–15 秒 | 720P / 1080P | 修正 model_name、质量 mode、sound；4K 暂未扩入渠道 |
| kling-video-v3-omni | 3–15 秒 | 720P / 1080P | 修正 image_list 对象和首尾帧类型 |
| kling-video-v2-6 | 3–10 秒 | 720P / 1080P | 补音频开关，区分质量档位与端点类型 |
| kling-video-v2-5-turbo | 5 / 10 秒 | 720P / 1080P | 保留无声行为，不提供未经接入的参考视频入口 |
| MiniMax-H3 | 4–15 秒 | 768P / 2K | 沿用渠道历史字段 720P→768P、1080P→2K；去掉会误降至 768P 的 4K 选项 |
| wan3.0-video | 2–30 秒 | 480P / 720P / 1080P | 单参考图与首帧分开，支持自动比例和 21:9；数量超限不再静默截断 |
| grok-imagine-video-1.5 | 1–15 秒 | 480P / 720P / 1080P | 当前接入文字 / 单首帧；识别 request_id 与 video.url |
| viduq3 | 3–16 秒 | 720P / 1080P | 按参考生视频接入 |
| viduq3-mix | 3–16 秒 | 720P / 1080P | 按参考生视频接入 |
| viduq3-turbo | 1–16 秒；参考模式 ≥3 秒 | 720P / 1080P | 多图参考走 reference2video，首尾帧才走 start-end2video |
| viduq3-pro | 1–16 秒；参考模式 ≥3 秒 | 720P / 1080P | 同上 |
| sora-2 | 保留渠道 10 / 15 秒 | 保留渠道档位 | 官方 Videos API 已于 2026-09-24 关闭；渠道别名是否继续可用须渠道确认 |
| sora-2-pro | 保留渠道 10 / 15 / 25 秒 | 保留渠道档位 | 同上；不得把渠道时长当成官方 API 规格 |

这些是接入配置与契约校验结果，不代表所有渠道已完成在线生成验收。模型名、供应商名称和渠道路由分别处理，不能随意用官方模型 ID 替换用户配置的渠道别名。

## Seedance 请求与创作要点

- 2.5 的官方版本 ID 为 `doubao-seedance-2-5-260628`，mini 为 `doubao-seedance-2-0-mini-260615`。当前服务使用已有渠道别名转发。
- 参考图与首帧语义不同。一个 reference_image 仍然是外观、主体或风格参考；只有明确选择首帧/首尾帧时才发 first_frame / last_frame。
- 2.5 首帧、首尾帧、编辑和延长跟随素材比例；普通参考模式保留选定比例。编辑发 `duration=-1` 和 `omni_reference_task_type=edit`；延长发 `extend`。提示词必须同时明确编辑或延长意图。
- 2.5 图/视频上限为 30 / 10；2.0 系列为 9 / 3。素材分别按类型编号，图片1和视频1可以同时存在。排列依据上传顺序，不因在提示词中先提到图片2就交换素材位置。
- 先写主体、环境与主要动作，再写镜头、视觉风格、台词与声音。多个素材各自明确用途；不要重复堆砌相互矛盾的镜头要求。
- 2.5 长叙事可按整数秒分段，时间范围与总时长一致；2.0 使用“镜头一、镜头二”表达顺序，不能承诺精确时间轴控制。图生视频主要描述画面接下来如何变化，避免反复重述静态图片。
- 编辑写明目标素材、修改范围、保留范围。延长写后续动作与镜头，不重写原片剧情。

[Seedance 2.5 官方说明](https://ark.volcengine.com/region:cn-beijing/docs/ark/seedance-2-5) · [Seedance 2.0 官方说明](https://ark.volcengine.com/region:cn-beijing/docs/ark/seedance-2-0) · [创建视频任务](https://ark.volcengine.com/region:cn-beijing/docs/ark/create-video-generation-task-api)

## 其他厂商依据

- [Google Veo API 与 Prompt 指南](https://ai.google.dev/gemini-api/docs/veo?hl=en)：用主体、动作、镜头与音效组织描述；参数组合按时长、分辨率、参考方式校验。
- [可灵能力表](https://kling.ai/document-api/guides/capability-map/video)、[文生视频字段](https://kling.ai/document-api/api/video/2-6/text-to-video/legacy)、[Omni 素材结构](https://kling.ai/document-api/api/video/o1/video-omni/legacy)、[3.0 创作指南](https://kling.ai/quickstart/klingai-video-3-model-user-guide)：质量 mode 与生成端点互不混用；对话注明说话主体，镜头叙事明确先后关系。部分页面仅搜索索引能读取，未据此开放所有高级功能。
- [MiniMax H3 创建接口](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)、[H3 创作示例](https://platform.minimax.io/docs/guides/video-prompt)：官方 V2 使用带 role 的 content 数组。现有渠道仍走兼容协议；本次纠正清晰度和时长，未声称已完成官方直连迁移。提示词分别交代人物、环境、产品和风格素材的用途。
- [万相 3.0 API](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference)、[使用指南](https://help.aliyun.com/zh/model-studio/wan3-video-generation-guide)：保持 input.media 的角色和各类型编号一致；现有适配保留 prompt_extend 智能改写。
- [Grok 视频生成](https://docs.x.ai/developers/model-capabilities/video/generation)：创建任务的 request_id 是此系列的任务编号；不能把其他厂商用于排查的 request_id 当任务编号。
- [Vidu 文字生成](https://platform.vidu.com/docs/text-to-video)、[参考生成](https://platform.vidu.com/docs/reference-to-video)、[模型表](https://platform.vidu.com/docs/model-map)：区分参考生成与首尾帧端点。部分页面参数说明存在版本差异，渠道仍需真实素材验证。
- [OpenAI API 下线公告](https://developers.openai.com/api/docs/deprecations)：Sora 官方服务状态独立于渠道别名，保留配置便于使用者核对渠道，不作可用性承诺。

## 接入边界与验证

- 画布目前接入图片、参考视频和输出音频开关；参考音频、角色库、局部蒙版、样片模式、超长视频拼接未在这次假造入口。
- 本地画布视频需要通过已配置的对象存储得到可访问链接。没有存储、素材失效或图片转换失败时明确报错，不能静默漏掉素材后继续提交。
- 已检查模型/方式/时长/清晰度/比例、素材角色与数量。远程视频的编码、分辨率、文件大小和总时长仍由上游严格校验，当前尚未完成统一元数据预检。
- 项目内不保留临时验证脚本。静态检查和构建使用 `pnpm check`；请求映射回归在项目外执行，不调用收费生成 API。

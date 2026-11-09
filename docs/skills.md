# Agent 技能库与上游来源

## 当前内置库

Agent 运行库提供模型提示词规范，创作库提供素材分析、分镜、人物设定和带货工作流。用户可自建、导入和收藏技能；电商图文的工作区样式由原功能管理。

| 技能 | 来源 | 固定版本 | 视频节点用途 |
| --- | --- | --- | --- |
| `h3-prompt-writing` | [MiniMax-AI 官方仓库](https://github.com/MiniMax-AI/MiniMax-H3/tree/199b7d0e1fd95e7b3eafa8c15eca692534142427/skills/h3-prompt-writing) | `199b7d0e1fd95e7b3eafa8c15eca692534142427` | MiniMax H3；按首尾帧或全参考选择原版 guide |
| `sd2-pe` | [火山方舟官方分发目录](https://arkdocs.tos-cn-beijing.volces.com/skills/.well-known/agent-skills/index.json) | `0.1.0` | Seedance 2.0；主体、动作、镜头与多模态绑定 |
| `sd25-pe` | [火山方舟官方教程](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh) | `0.1.1` | Seedance 2.5；生成、关键帧、编辑与延长分别组织 |
| `wan3-pe` | [阿里云百炼官方提示词指南](https://help.aliyun.cn/zh/model-studio/wan3-video-generation-prompt-guide) | `0.2.0` | Wan 3.0；整理原始请求，不自行扩写剧情；直接编辑模式跳过 |


| `gemini-omni-flash-api` | [Google Gemini 官方仓库](https://github.com/google-gemini/gemini-skills/tree/e1f29deb4d81af6d3e4bf6d22112e640d94015a9/skills/gemini-omni-flash-api) | `e1f29deb…` | Gemini Omni Flash；仅运行原版 Prompting 章节，SDK 脚本只供阅读 |
| `kling-3-prompting` | [aedev-tools 社区仓库](https://github.com/aedev-tools/kling-3-prompting-skill/tree/3beb4cbb2c5cd7580d9b5f945238074514e8b5a3/skills/kling-3-prompting) | `3beb4cbb…` | 可灵 3.0 与 3.0 Omni；动作、运镜、对白和首尾帧 |
| `scenario-kling` | [Scenario 社区原版](https://github.com/scenario-labs/skills/tree/e24bc7d40be97b428e7b9fd467c415366e1dd974/skills/scenario-kling) | `e24bc7d4…` | 可灵 2.6；参考输入、声音与示例中的提示词写法 |
| `scenario-veo` | [Scenario 社区原版](https://github.com/scenario-labs/skills/tree/e24bc7d40be97b428e7b9fd467c415366e1dd974/skills/scenario-veo) | `e24bc7d4…` | Veo 3.1 与 Fast；连续镜头、动作、对白与环境声 |
| `scenario-grok-imagine-video` | [Scenario 社区原版](https://github.com/scenario-labs/skills/tree/e24bc7d40be97b428e7b9fd467c415366e1dd974/skills/scenario-grok-imagine-video) | `e24bc7d4…` | Grok Imagine Video 1.5；首帧/参考素材职责、动作和声音 |
| `scenario-vidu` | [Scenario 社区原版](https://github.com/scenario-labs/skills/tree/e24bc7d40be97b428e7b9fd467c415366e1dd974/skills/scenario-vidu) | `e24bc7d4…` | Vidu Q3 / Mix / Turbo / Pro；按模式选择镜头描述或参考绑定 |
| `ai-video-prompt-writer` | [muraterdogan0 社区仓库](https://github.com/muraterdogan0/ai-video-prompts/tree/22f14022ec1303ad7e48e2ba61c06a92173472cb/skills/ai-video-prompt-writer) | `22f14022…` | Sora 2 / Pro 使用 Sora 指南；可灵 2.5 Turbo 与 Vidu Q4 预览使用家族通用指南，界面明确标注“通用” |
当前共 15 个内置包：4 个贝壳创作工作流，以及 11 个原版 Agent 运行包。原版包中 5 个官方来源、6 个 GitHub 社区来源，覆盖当前 21 个内置视频模型。Google 包保留 Apache-2.0，其余新增社区包保留 MIT 许可证；新增包的全部文件均逐一匹配固定提交的 Git blob，再记录 SHA-256。

官方分发没有附带独立许可证的包，元数据如实注明，不能补写 MIT 或 Apache 等授权。Seedance 两个 ZIP 的 SHA-256 与官方分发目录逐一核对；Wan ZIP 记录下载摘要；H3 文件逐一匹配固定提交中的 Git blob。完整来源、版本、文件摘要及下载链接保存在各包 `agents/beike.json` 的 `source` 字段。

Sora 使用社区提示词写作包及其 Sora 指南，详情页保留实际作者与许可证信息。

## 贝壳创作工作流

四项工作流在“创作技能”中选用。详情页显示素材要求、交付内容、三个使用步骤和可直接填入的示例；点击使用后在创作栏提供可编辑的起始需求，保留已有草稿和素材。提取须有图片或视频，其余三项可用文字或素材开始；没有有效输入时不发起模型请求。它们按当前模型配置输出可由对话生成面板识别的 `image-prompt` / `video-prompt`，用户选择模型并绑定参考素材后提交真实生成任务。

| 技能 | 输入与交付 |
| --- | --- |
| 提示词提取 | 图片直接视觉理解；视频通过物理参数、联系表和局部抽帧分析，输出逐镜提示词 |
| 电影分镜 | 故事与时长生成连续分镜、各镜视频提示词，可选关键帧图片提示词；不假称自动剪辑 |
| 人物三视图 | 人物图或文字设定生成正面、侧面、背面的同一人物设定板提示词 |
| 达人带货 | 商品图文、链接或商品库信息生成事实约束下的口播脚本和演示镜头提示词 |

四项创作工作流随贝壳发布并维护。维护入口分别是 `src/shared/domain/assistant/skills/packages/` 下的 `beike-prompt-extraction`、`beike-cinematic-storyboard`、`beike-character-three-view`、`beike-ugc-product-sales`；版本和主文件 SHA-256 参与编译校验。

## 真源与校验

技能页保留“创作技能 / Agent 运行技能”两个入口。创作技能默认打开，使用 16:9 作品卡片；常规桌面四列，小屏自动减列。四项本地技能分别使用用途预览，人物三视图使用实际生成小样并完整展示人物；缺封面时使用简洁文字封面，封面、名称可打开详情，“使用”应用到创作栏或电商图文；收藏按钮与打开详情互不触发。归属筛选为“全部 / 我的 / 收藏”，分类仅取自当前技能类型和场景下实际存在的主分类；标签保留用于搜索，搜索同时匹配名称、介绍、作者、模型和标签。详情展示真实作者、已记录的统计、默认模型、分类与可展开的完整文件；未声明模型时显示“跟随当前创作配置”，不填造模型、使用次数或收藏数。创建菜单提供 Agent 创建、本地 Skill 导入、手动编辑，支持键盘操作；原有导入、工作区保存和运行时权限沿用同一条链路。

已导入的案例链接支持图片和视频；列表视频复用可见性与并发播放调度，减少动态效果时停止自动播放，详情打开后暂停后台预览，案例视频由用户手动播放。“我的”只包含用户创建或导入的技能，内置社区技能仍属于内置库。

内置包位于 `src/shared/domain/assistant/skills/packages/<skill-id>/`。`SKILL.md` 与上游引用文件保留原文，应用展示、来源、允许工具放在独立 `agents/beike.json`。中文简介与使用说明分别维护在 `displayDescription`、`usageGuide`，默认详情页显示中文说明，原版指令在技能文件阅读器中保留；`modelIcon` 指定对应模型标识，复用应用品牌图标，Wan 使用官网图标。不为迎合长度限制重写上游 Skill；长正文由资源阅读器分段读取。

运行 `pnpm skills:build` 同时生成浏览器 `compiledSkillPackages.json` 和 Go API 的 `internal/assistant/builtinSkillPackages.json` 内置快照，`pnpm check:skills` 校验来源元数据、原始文件摘要、工具与编译结果。修改上游正文会使摘要校验失败；升级时应从上游取得新包，核验并更新版本与摘要。页面显示来源、版本及实际许可证信息，导出 ZIP 保留主文件和附属文本文件。

自定义技能保存到当前工作区的服务端技能库，不静默改动个人 `.codex/skills`。删除内置包不删除用户导入的副本，也不覆盖历史消息中的技能快照。当前文本导入限制为单文件 256 KB、整个包 1 MB；图片等二进制素材不在文本 ZIP 备份范围内。

## 视频生成前优化

全能参考复刻使用独立「07 视频提示词优化」文字节点：05分镜、06参考图及补充素材职责进入07；07统一配置目标视频模型、所选片段时长及声音，调用匹配的固定版本Skill与文本模型。预览中的「确认保存07提示词」只保存文本，不创建视频任务。08连接07确认稿与同一组参考素材，继承07配置和素材顺序，不再调用优化。商品、人物、场景与06整合参考图的职责分别写入优化请求和最终正文；在07或08增减图片连线时同步另一端，素材变更后必须重新优化确认。上游、素材、模型或参数改变后确认稿失效；时长必须与分镜一致，静音及分秒时间轴作为最终正文约束保留，Skill报告说明不进入生成正文。普通独立视频节点仍沿用下面的生成前优化流程。

Studio 与旧画布均在用户点击生成后、加入视频生成队列前运行：解析实际模型与渠道参数 → 匹配已核验 Skill（明确官方或社区来源） → 用已启用的文本模型整理提示词 → 自动打开可编辑预览 → 用户点击“确认生成视频” → 保存本次固定输入并提交现有视频队列。优先使用当前助手文本模型，未启用时使用已启用文本列表首项。没有文本模型时提示配置或关闭优化。

默认开启。Studio 在“更多工具 → 生成任务”按节点调整，旧画布在视频节点编辑面板调整。节点显示待用、已用的技能中文名称、对应模型图标与待确认状态，点击技能按钮可查看中文介绍、用法与官方来源。切换模型或渠道时，标识立即按当前实际模型重新匹配；旧稿只作为历史记录展示。草稿复用同时校验模型、渠道、模式、素材、提示词、参数、技能与固定版本；优化或确认期间修改输入会终止本次准备，重新优化、确认后才能提交。界面注明额外的一次文本模型调用，显示优化中状态，可取消准备。优化完成只产生草稿，尚未提交视频；预览中显示 Skill、固定版本、优化模型和原文，用户可编辑后确认生成，取消或关闭不提交。刷新保留草稿并解除待确认锁定，不自动恢复为视频任务。未收录或不适用的模型与模式直接使用原文，不套用相近模型的 Skill。图片、语音、深度转换及原声合成不参与此优化。

优化仅接收文字、参考数量、编号和真实提交参数，不读取参考媒体内容；不得声称看过画面或听过音轨。全能参考分镜复刻仅提取所选片段及全片一致性，同时保留其他已连接文字中的素材用途与商品约束及其原编号；未选片段与原片观察报告不带入生成。上游 Skill 的安装、自升级命令不在这个纯文本运行环境执行。H3 只带入当前模式所需的 base 或 ref 指南。新包通过 `videoPromptProfiles.ts` 选择原版提示词章节或当前模型的独立指南；原始 Skill 和脚本完整保留供阅读，MCP/SDK/CLI、账号、报价和生成操作不参与节点优化。共用写作包只加载本次模型的 Sora、可灵或 Vidu 资料，不能串用其他家族指南。原始提示词保留，节点记录 AI 优化稿、用户编辑稿、文本模型、技能 ID、版本及来源，任务记录保存用户确认的实际提交正文。

文本调用失败、正文为空、输出截断或超过长度限制时，视频尚未入队，不静默使用原文继续。取消或切换项目后的迟到结果不能提交任务。重试本次任务沿用已保存的正文和参考，不再次调用优化；按当前连线生成才重新优化。

## 助手执行与资源读取

详情中的“本次指定”只影响当前对话；未指定时 Agent 根据目录按需 `read_skill`、`read_skill_file`。资源按技能 ID 与相对路径隔离；历史消息快照不受当前库升级影响。分页按 Unicode 字符计数，默认 8,000、单次最多 12,000 字符。

当前每技能最多 24 个资源、单资源 40,000 个 JavaScript 字符；自动发现目录最多 16 项，正文与资料总预算 120,000 字符。内置技能目录只携带 id 和固定来源版本，由 Go 在 `read_skill` 时从同一次构建的内置快照按需读取；版本不一致会拒绝，不用当前版本替换历史快照。用户自定义包继续遵守原有消息预算。此机制不增加目录、单文件或请求预算。新增后端快照随应用重新启动加载。运行时无终端执行权限，脚本作为参考文本，不自动执行。

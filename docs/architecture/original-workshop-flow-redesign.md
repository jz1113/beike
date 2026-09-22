# 原创种草工坊整体执行流程重规划

> 状态：研发评审稿  
> 版本：v1.0  
> 制定日期：2026-09-22  
> 适用范围：原创种草工坊、提示词资产库、拍摄架构、商品类目、批次历史及相关生成任务  
> 核心约束：保持现有整体 UI 形式、模块入口和四阶段结构不变，优先优化执行流程、状态管理、资产治理与反馈闭环

## 1. 文档目的

本文档用于指导原创种草工坊下一阶段的产品与工程重构，解决以下问题：

1. 当前四阶段可以运行，但阶段之间主要依靠页面切换和局部布尔状态衔接，缺少完整业务状态机。
2. 提示词资产库已经具备图组、人设、穿搭、场景、动作等基础类型，但仍偏向“素材仓库”，没有形成可衡量、可晋升、可降权、可退役的生产资产体系。
3. 商品选图、拍摄架构、资产锁定、视觉分析、生图、文案与导出之间的依赖关系没有被显式建模，修改上游内容后容易保留不再可信的下游结果。
4. 自动驾驶只能自动连续调用，缺少可观察、可暂停、可续跑、可恢复的流水线语义。
5. 生成成功不等于内容可用；当前没有把用户采用、重试、淘汰和导出行为反馈给提示词资产库。

本文档不要求重新设计页面视觉，也不要求一次性推翻现有批次快照。目标是在现有界面之下建立稳定的流程内核，使系统能够回答：

- 当前批次进行到哪一步；
- 为什么不能进入下一步；
- 哪些内容发生变化，哪些结果必须重做；
- 当前执行是否可以安全暂停、重启和续跑；
- 哪些提示词资产真正有效；
- 下一批如何基于历史结果自动做得更好。

## 2. 范围与非目标

### 2.1 本次范围

- 原创种草工坊四阶段执行流程；
- 批次状态、运行状态与单任务状态；
- 商品采集、选图和制作方案确认；
- 分镜分析、自动检查和人工审核；
- 生图、切图、失败重试、文案和导出；
- 提示词资产的采集、审核、发布、使用、评分和治理；
- 商品类目与资产类目的统一；
- 历史批次的只读、复制与复现；
- 迁移、测试、监控和验收标准。

### 2.2 非目标

- 不重新设计原创种草工坊的视觉风格；
- 不改动顶部胶囊式模块导航的基本形式；
- 不取消现有“创作工作台、提示词资产库、拍摄架构、商品类目”四个模块；
- 不在本轮引入新的工作流引擎或微服务；
- 不把现有所有资产表强制合并成单表；
- 不让自动评分直接取代用户最终审核；
- 不自动把所有模型生成结果写入正式词库。

## 3. 当前系统基线

### 3.1 当前页面模块

原创种草工坊目前由四个顶部模块构成：

| 模块 | 当前职责 |
| --- | --- |
| 创作工作台 | 批量商品采集、选图、分析、生图、文案与交付 |
| 提示词资产库 | 完整图组、人设、穿搭、场景、动作资产的浏览、筛选、导入与应用 |
| 拍摄架构 | 管理系统和自定义拍摄架构，并载入工作台 |
| 商品类目 | 维护一级品类、二级类目、适用部位与关键词 |

工作台内部保持四阶段：

```text
阶段 1 商品采编
  → 阶段 2 选图与生产预设
  → 阶段 3 分镜提示词分析与审核
  → 阶段 4 生图、文案与交付
```

### 3.2 当前代码链路

主要前端编排入口：

- [`apps/web/src/features/workshop/WorkshopStudio.tsx`](../../apps/web/src/features/workshop/WorkshopStudio.tsx)
- [`apps/web/src/features/workshop/components/BatchWorkshopView.tsx`](../../apps/web/src/features/workshop/components/BatchWorkshopView.tsx)
- [`apps/web/src/features/workshop/hooks/useBatchWorkshopRunner.ts`](../../apps/web/src/features/workshop/hooks/useBatchWorkshopRunner.ts)

主要执行模块：

- 商品采集：[`apps/web/src/features/workshop/model/batchCollect.ts`](../../apps/web/src/features/workshop/model/batchCollect.ts)
- 视觉分析：[`apps/web/src/features/workshop/model/batchVisionAnalyze.ts`](../../apps/web/src/features/workshop/model/batchVisionAnalyze.ts)
- 自动流水线：[`apps/web/src/features/workshop/model/batchAutoPilot.ts`](../../apps/web/src/features/workshop/model/batchAutoPilot.ts)
- 生图调度：[`apps/web/src/features/workshop/model/batchGenerationCoordinator.ts`](../../apps/web/src/features/workshop/model/batchGenerationCoordinator.ts)
- 单任务执行：[`apps/web/src/features/workshop/model/batchTaskExecution.ts`](../../apps/web/src/features/workshop/model/batchTaskExecution.ts)
- 批次快照：[`apps/web/src/features/workshop/model/workshopSnapshotBridge.ts`](../../apps/web/src/features/workshop/model/workshopSnapshotBridge.ts)

服务端核心：

- 视觉分析入口：[`apps/api/src/routes/generate/analyze.ts`](../../apps/api/src/routes/generate/analyze.ts)
- 资产召回与故事板执行：[`apps/api/src/services/analyze/storyboard.ts`](../../apps/api/src/services/analyze/storyboard.ts)
- 提示词装配：[`apps/api/src/services/analyze/promptAssembler.ts`](../../apps/api/src/services/analyze/promptAssembler.ts)
- 批次服务：[`apps/api/src/services/workshopBatches.ts`](../../apps/api/src/services/workshopBatches.ts)
- 数据结构：[`packages/prisma/schema.prisma`](../../packages/prisma/schema.prisma)

### 3.3 当前批次模型

系统已经从单一 `WorkshopWorkspace` 迁移出：

- `WorkshopBatch`：保存批次名称、状态、revision 和完整快照；
- `WorkshopBatchState`：保存当前活跃批次；
- 历史批次：支持只读查看、复制、重命名、清理和归档；
- revision 冲突控制：避免多窗口静默覆盖。

这是后续重构的重要基础，不需要重新回到单一工作区模型。

### 3.4 当前本机数据快照

以下数据来自 2026-09-22 对本机桌面数据库的只读聚合，仅作为当前规划基线，不代表所有部署环境：

| 资产类型 | 数量 | 有使用记录 | 收藏 | 平均使用次数 |
| --- | ---: | ---: | ---: | ---: |
| 场景 | 8 | 0 | 0 | 0 |
| 穿搭 | 1 | 1 | 0 | 7 |
| 动作 | 0 | 0 | 0 | 0 |
| 人设 | 1 | 0 | 0 | 0 |
| 完整提示词图组 | 2 | 0 | 0 | 0 |

其他基线：

- `PromptRecord`：0；
- `StyleRecipe`：2；
- `AssetProductCategory`：0；
- `PromptAlbum`：1；
- `WorkshopBatch`：1 个草稿批次；
- 2 条完整提示词均已具备结构化分镜与图组架构；
- 现有 12 条提示词资产均未绑定服务端 `productCategoryIds`；
- 动作资产为空时，分析流程依赖内置解剖学动作预设兜底。

基线说明当前首要问题不是“长提示词不够多”，而是动作层、类目绑定和效果反馈不足。

## 4. 当前端到端执行流程

### 4.1 阶段 1：商品采编

#### 输入

- 京东、淘宝、天猫、1688 商品链接或 SKU；
- 当前批次已有商品；
- 从完整图组资产导入的历史分镜。

#### 当前动作

1. 解析输入行；
2. 按 itemId 去重；
3. 创建待采集商品；
4. 以固定并发采集商品信息和图片；
5. 将商品标记为 `success` 或 `failed`；
6. 用户选择进入选图阶段。

#### 当前优点

- 支持批量输入；
- 能阻止完全重复的商品；
- 失败商品可重新采集；
- 已接入批次快照和恢复。

#### 当前问题

- “采集成功”只表示接口返回成功，不表示素材足够生产；
- 缺少商品类目识别置信度和素材完整度诊断；
- 缺少对无主图、图片过少、图片打不开、重复图过多等问题的统一门禁；
- 混合类目商品会直接进入同一个架构确认流程；
- 商品选择状态与采集状态同时存在，但缺少明确的“跳过失败项”决策记录。

### 4.2 阶段 2：选图与生产预设

#### 输入

- 采集成功且被选中的商品；
- 商品主图、SKU 图与详情图；
- 全局默认拍摄架构；
- 分镜数量、画幅、画质、分析模型和生图模型；
- 人设、场景、穿搭与动作资产锁定状态。

#### 当前动作

1. 用户逐商品选择分析用商品图；
2. 用户可使用首图、全部主图或全图；
3. 设置面板维护全局生产参数；
4. 进入下一步时再次强制选择本批拍摄架构；
5. 确认后立即进入阶段 3 并启动批量分析。

#### 当前优点

- 商品选图集中在一个工作区；
- 有“待选图、已就绪、全部”筛选；
- 本批架构要求显式确认，避免误用持久化默认值；
- 资产库中的人设、场景和穿搭可以锁定到工作台。

#### 当前问题

1. **批次默认与批次批准混杂。** 设置弹窗保存的是批次快照，但部分行为仍像全局偏好。
2. **动作资产入口缺失。** `lockedActionId` 已存在于状态、快照和分析请求中，但资源加载与设置面板没有完整动作选择入口。
3. **存在疑似无效配置。** `hasHumanPersona` 会保存和显示，但批量分析固定使用 `asset_driven`，人物出镜实际上由动作资产决定。
4. **缺少配置预检。** 当前确认架构后立即调用模型，没有先检查类目适配、资产冲突和预计任务成本。
5. **混合类目缺少拆批。** 一个批次可能包含需要不同拍摄架构的商品，却只能确认一个批次级架构。

### 4.3 阶段 3：分镜分析与审核

#### 当前动作

1. 按所选商品图调用 `/api/generate/analyze`；
2. 服务端根据商品标题、属性和类目推断召回资产；
3. 注入拍摄架构、场景、人设、穿搭和动作；
4. 调用视觉模型输出结构化分镜；
5. 后置执行商品守卫、穿搭一致性、珠宝纠偏和提示词装配；
6. 用户可以编辑单镜提示词；
7. 全部商品具备分镜后才能启动生图。

#### 当前优点

- 未完成分析时有强生图阻断；
- 分镜数量不足时会判定分析失败；
- 支持模型回退；
- 支持单商品重试；
- 支持四宫格和单镜策略；
- 后端已经具备场景、动作和分镜签名去重参数。

#### 当前问题

1. **多样性上下文未完整接通。** `batchGroupSignaturesRef`、`batchActionIdsRef`、`batchSceneIdsRef` 在分析模块中可用，但当前批量 Runner 没有初始化并作为稳定批次上下文传入。
2. **审核只覆盖“是否返回”。** 没有统一判断商品锚点、动作重复、景别覆盖、人物一致、商品遮挡和资产冲突。
3. **编辑后失效范围不清楚。** 修改一条提示词后，对已有成图任务和文案的影响没有显式记录。
4. **分析与生产耦合在本地 Hook。** 页面状态、网络调用、进度和业务门禁集中在 `useBatchWorkshopRunner`，难以单独测试状态转移。

### 4.4 阶段 4：生图、文案与交付

#### 当前动作

1. 根据策略创建任务数组；
2. 四宫格模式先生成母图再切成四张；
3. 单镜模式逐分镜提交；
4. 汇总成功、失败和完成数量；
5. 可重试全部失败任务或单个失败分镜；
6. 可自动或手动生成文案；
7. 支持单商品与整批导出；
8. 用户可归档当前批次并新建批次。

#### 当前优点

- 任务粒度已经下沉到单分镜；
- 生图失败不会让整个批次崩溃；
- 支持失败重试和历史只读查看；
- 有导出和文案编辑能力。

#### 当前问题

1. **`completed` 状态不可自然到达。** 当前 `statusForSnapshot()` 将阶段 4 统一映射为 `generating`，没有依据任务终态转换为 `completed`。
2. **重复启动可能重建任务数组。** 再次开始批量生成时会重新按分镜生成任务，缺少提交幂等键和已完成结果保护。
3. **没有正式结果审核。** 成图成功后直接进入交付展示，缺少“采用、重做、淘汰”结论。
4. **停止机制未闭环。** `isAbortedRef` 存在，但界面和 Runner 没有完整的停止、暂停与恢复命令。
5. **词库没有收到结果反馈。** 使用资产只会递增 `usageCount`，无法区分成功、失败、采用和导出。

## 5. 根因分析

### 5.1 页面阶段被当作业务状态

当前 `currentStage` 同时承担：

- 当前显示哪个页面；
- 当前批次处于哪个业务阶段；
- 批次状态推导依据；
- 历史恢复入口。

页面阶段适合表达视图，不适合完整表达业务状态。阶段 4 可能同时包含：排队、生成中、部分失败、全部成功、文案中、等待审核、已完成等状态，单一数字无法区分。

### 5.2 配置范围没有明确分层

当前配置混合了三种范围：

| 范围 | 示例 | 正确行为 |
| --- | --- | --- |
| 用户偏好 | 默认模型、默认并发、常用生成策略 | 可跨批次继承，但不是对本批的批准 |
| 批次配置 | 本批架构、画幅、分镜数量、锁定资产 | 创建任务时冻结，历史可复现 |
| 任务配置 | 单镜提示词、商品垫图、任务模型与尺寸 | 与任务结果一起保存，不受后续默认值影响 |

没有分层时，用户无法判断修改设置会影响当前任务、下一批还是已完成任务。

### 5.3 资产使用次数被误当作资产质量

`usageCount` 只能说明资产被系统选中过，不能说明：

- 模型是否成功出图；
- 商品是否还原；
- 用户是否采用；
- 是否需要反复重试；
- 是否最终导出；
- 是否只在某一类目有效。

将调用次数直接用于排序，会强化“经常被抽中”的资产，而不一定强化“效果好”的资产。

### 5.4 商品类目存在多套事实源

目前同时存在：

- 浏览器 `localStorage` 中的自定义类目；
- `AssetProductCategory` 服务端表；
- domain 中的一级类目与二级类目定义；
- `suitableCategories`、`suitableAnatomy` 和 `productCategoryIds` 等多种资产字段；
- 拍摄架构自己的 `category` 字段。

这会导致资产筛选、反推、工坊召回和拍摄架构推荐无法保证使用同一类目解释。

## 6. 目标设计原则

1. **UI 形式不变，业务内核重做。** 四阶段和四模块保持，状态与门禁改由统一流程模型驱动。
2. **每一步只解决一个决策。** 阶段 1 判断素材是否可生产；阶段 2 确认怎么生产；阶段 3 判断分镜是否可生成；阶段 4 判断结果是否可交付。
3. **阶段有明确入口、动作和出口门禁。** 不允许仅靠按钮跳转进入不满足条件的阶段。
4. **视图与状态分离。** 用户可返回查看上一步，但只有修改业务输入才会使下游结果失效。
5. **任务幂等。** 重复点击、刷新、重启或恢复不能重复扣费、覆盖成功结果或制造重复任务。
6. **失败局部化。** 单商品、单分镜失败不导致整批重做。
7. **结果必须进入审核。** 技术成功和业务采用是两个状态。
8. **词库必须版本化。** 历史批次引用固定资产版本，新版本不能改变旧批次含义。
9. **使用与效果分开统计。** `usageCount` 保留，但不再作为唯一排序依据。
10. **自动驾驶只自动到下一个决策门。** 遇到冲突、低置信度、高成本或失败时必须停下。

## 7. 目标端到端流程

### 7.1 阶段 1：商品准备

#### 目标

确定“本批有哪些商品具备生产条件”。

#### 处理步骤

```text
输入链接 / SKU
  → 解析与去重
  → 商品采集
  → 图片可用性检查
  → 类目识别
  → 素材完整度诊断
  → 可生产 / 需修复 / 跳过
```

#### 自动诊断项

- 链接是否支持；
- SKU 是否重复；
- 商品是否已存在于当前批次；
- 是否有有效封面图；
- 主图是否可访问；
- 图片数量是否满足最低要求；
- 是否只有低分辨率或严重重复图片；
- 商品类目是否可识别；
- 商品标题与图片是否明显不一致；
- 是否属于当前系统暂不支持的品类。

#### 商品准备状态

```ts
type ProductPreparationStatus =
  | 'pending'
  | 'collecting'
  | 'ready'
  | 'needs_attention'
  | 'failed'
  | 'skipped';
```

#### 出口门禁

- 至少一款商品为 `ready`；
- 所有继续生产的商品都有可用商品锚点图；
- `failed` 和 `needs_attention` 商品已被重试、修复或明确跳过；
- 系统已计算类目分组；
- 如果批次包含不兼容类目，用户已接受拆批建议或明确继续。

### 7.2 阶段 2：制作方案

#### 目标

确定“本批商品使用什么生产方案”。

#### 方案组成

- 商品锚点图；
- 商品类目与二级类目；
- 拍摄架构；
- 分镜数量；
- 有人、手持或纯商品比例；
- 场景、人设、穿搭和动作策略；
- 视觉分析模型；
- 生图模型、画幅与画质；
- 四宫格或单镜策略；
- 文案是否自动生成；
- 并发与预算上限。

#### 推荐逻辑

1. 按商品类目筛选可用拍摄架构；
2. 按架构槽位计算所需资产类型；
3. 先做硬过滤：已发布、类目适用、景别适用、人物状态适用；
4. 再按质量、采用率、多样性和用户偏好排序；
5. 为混合类目商品生成分组方案；
6. 展示推荐理由和不兼容警告；
7. 用户可以锁定关键资产，其余保持自动；
8. 生成不可变的 `ProductionPlanSnapshot`。

#### 制作方案快照

```ts
interface ProductionPlanSnapshot {
  version: number;
  architectureId: string;
  architectureVersion: number;
  productAssignments: Array<{
    productId: string;
    categoryId: string;
    subcategoryId?: string;
    selectedImageUrls: string[];
    lockedAssetRefs: Array<{
      assetId: string;
      assetType: 'persona' | 'scene' | 'outfit' | 'action' | 'rule';
      version: number;
    }>;
  }>;
  shotCount: number;
  generationStrategy: 'grid_first' | 'single_shot';
  analysisModel: string;
  imageModel: string;
  aspectRatio: '3:4' | '1:1' | '9:16' | '16:9';
  quality: 'high' | 'medium' | 'low';
  autoGenerateCopywriting: boolean;
  estimatedTaskCount: number;
  estimatedCost?: number;
  approvedAt: string;
}
```

#### 出口门禁

- 每款商品至少一张已确认商品图；
- 每款商品存在适配架构或已被拆入合适分组；
- 被锁定资产均为已发布状态；
- 资产与商品类目、人物状态和景别无冲突；
- 任务数、模型和成本已可计算；
- 用户已确认本批方案。

### 7.3 阶段 3：分镜分析与审核

#### 目标

确定“生成提示词是否已经达到安全生图标准”。

#### 执行步骤

```text
冻结制作方案
  → 为批次建立多样性上下文
  → 按商品并发分析
  → 结构化提示词装配
  → 自动质量检查
  → 只展示异常项
  → 用户修订或批准
```

#### 批次多样性上下文

每个批次维护：

- 最近使用场景 ID；
- 最近使用动作 ID；
- 最近使用穿搭 ID；
- 最近使用人设 ID；
- 最近分镜组签名；
- 商品类目和目标解剖部位；
- 已锁定的资产组合。

该上下文必须由批次编排器维护并持久化，不能只存在于单次函数调用中的临时变量。

#### 自动质量检查

每款商品至少执行以下检查：

| 检查项 | 说明 | 失败处理 |
| --- | --- | --- |
| 分镜完整性 | 数量等于目标数量，字段齐全 | 自动补齐失败则重新分析 |
| 商品锚点 | 每镜明确引用商品实物，不生成新商品 | 阻断 |
| 商品角色 | 佩戴、手持、摆放方式与商品类型一致 | 阻断或人工确认 |
| 景别覆盖 | 微距、中近景、互动、氛围镜头比例合理 | 警告 |
| 动作重复 | 同组与同批商品不重复使用同一动作 | 自动换资产或警告 |
| 场景重复 | 批次内避免高频撞场景 | 自动换资产或警告 |
| 人物一致 | 同组人物身份与穿搭一致 | 阻断 |
| 纯商品规则 | 无人物镜头不包含面部、服装或人体描述 | 阻断 |
| 类目守卫 | 珠宝、数码、服饰等遵循各自镜头规则 | 阻断 |
| 安全与敏感表达 | 检查模型审核高风险表达 | 自动改写或警告 |
| 提示词冲突 | 正向描述与负向规则不矛盾 | 阻断 |

#### 审核状态

```ts
type StoryboardReviewStatus =
  | 'not_started'
  | 'analyzing'
  | 'auto_passed'
  | 'needs_review'
  | 'approved'
  | 'rejected';
```

#### 出口门禁

- 全部继续生产的商品都有结构化分镜；
- 自动阻断项为零；
- 警告项已确认；
- 手动编辑的提示词已经保存新 revision；
- 旧生图任务已按失效规则标记；
- 故事板状态为 `approved`。

### 7.4 阶段 4：生产与交付

#### 目标

确定“哪些生成结果可以作为本批最终交付”。

#### 执行步骤

```text
创建 PipelineRun
  → 幂等创建生图任务
  → 并发提交与轮询
  → 四宫格切片或单镜归档
  → 失败项局部重试
  → 结果自动初检
  → 用户采用 / 重做 / 淘汰
  → 文案生成与编辑
  → 导出
  → 完成批次
```

#### 任务幂等键

建议按以下输入生成任务幂等键：

```text
batchId
+ productId
+ storyboardRevision
+ shotNo
+ promptHash
+ selectedImageHash
+ model
+ aspectRatio
+ quality
```

相同幂等键存在成功任务时，不重新提交；存在运行任务时连接原任务；只有输入变更产生新键时才创建新任务。

#### 结果审核状态

```ts
type OutputReviewDecision =
  | 'unreviewed'
  | 'accepted'
  | 'retry_requested'
  | 'rejected';
```

#### 批次完成条件

- 所有计划任务进入终态；
- 不存在未知或失联任务；
- 每款商品至少有一个 `accepted` 结果，或已明确标记跳过；
- 需要的文案已生成或用户明确关闭；
- 最终产物可导出；
- 用户执行“完成本批次”。

满足条件后状态变为 `completed`，而不是继续停留在 `generating`。

## 8. 目标状态机

### 8.1 批次状态

建议将当前状态扩展为：

```ts
type WorkshopBatchStatus =
  | 'draft'
  | 'collecting'
  | 'plan_ready'
  | 'analyzing'
  | 'review_required'
  | 'approved'
  | 'generating'
  | 'qc_required'
  | 'partial_failed'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'archived';
```

### 8.2 正常状态流转

```text
draft
  → collecting
  → plan_ready
  → analyzing
  → review_required
  → approved
  → generating
  → qc_required
  → completed
  → archived
```

### 8.3 异常状态流转

```text
collecting / analyzing / generating
  → paused
  → 原状态继续

analyzing / generating
  → partial_failed
  → 局部重试
  → review_required / qc_required

任意未完成状态
  → cancelled

completed
  → archived
```

### 8.4 状态事件

状态只能通过显式事件变化：

```ts
type WorkshopBatchEvent =
  | { type: 'START_COLLECTION' }
  | { type: 'COLLECTION_FINISHED' }
  | { type: 'CONFIRM_PLAN'; planRevision: number }
  | { type: 'START_ANALYSIS'; runId: string }
  | { type: 'ANALYSIS_FINISHED'; result: 'success' | 'partial_failed' }
  | { type: 'APPROVE_STORYBOARD'; storyboardRevision: number }
  | { type: 'START_GENERATION'; runId: string }
  | { type: 'GENERATION_FINISHED'; result: 'success' | 'partial_failed' }
  | { type: 'SUBMIT_OUTPUT_REVIEW' }
  | { type: 'COMPLETE_BATCH' }
  | { type: 'PAUSE_RUN'; runId: string }
  | { type: 'RESUME_RUN'; runId: string }
  | { type: 'CANCEL_BATCH' }
  | { type: 'ARCHIVE_BATCH' };
```

禁止组件直接自由设置业务状态。组件只能派发事件，domain 层纯函数判断事件是否合法并返回下一状态。

### 8.5 页面阶段映射

页面阶段从状态派生：

| 页面 | 对应业务状态 |
| --- | --- |
| 阶段 1 | `draft`、`collecting` |
| 阶段 2 | `plan_ready` |
| 阶段 3 | `analyzing`、`review_required`、`approved` |
| 阶段 4 | `generating`、`qc_required`、`partial_failed`、`paused`、`completed` |

用户可以返回旧页面查看，但不应仅因查看而回退业务状态。

## 9. 执行模型

### 9.1 三层执行对象

#### WorkshopBatch

表示一次用户业务批次：

- 批次身份；
- 当前业务状态；
- 商品列表；
- 制作方案快照；
- 当前故事板 revision；
- 当前交付 revision；
- 最终审核结果；
- 历史运行摘要。

#### PipelineRun

表示一次可暂停和可恢复的执行：

```ts
interface PipelineRun {
  id: string;
  batchId: string;
  kind: 'collection' | 'analysis' | 'generation' | 'copywriting' | 'export';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'partial_failed' | 'failed' | 'cancelled';
  inputRevision: number;
  totalTasks: number;
  completedTasks: number;
  successTasks: number;
  failedTasks: number;
  startedAt?: string;
  finishedAt?: string;
  errorSummary?: string;
}
```

#### StepRun / Task

表示单商品或单分镜任务：

- 唯一幂等键；
- 输入快照；
- 当前状态；
- 第三方任务 ID；
- 尝试次数；
- 结果 URL；
- 错误分类；
- 是否需要人工恢复确认。

### 9.2 恢复原则

应用重启后：

1. 读取活跃批次；
2. 读取未结束 `PipelineRun`；
3. 对第三方任务执行状态核验；
4. 已成功任务保持成功，不重复提交；
5. 未知任务标为 `recovery_required`；
6. 用户确认后再重新提交无法核验的任务；
7. 恢复结果写回批次摘要。

## 10. 数据依赖与失效规则

### 10.1 失效矩阵

| 用户变更 | 采集数据 | 制作方案 | 分镜 | 成图 | 文案 | 处理原则 |
| --- | --- | --- | --- | --- | --- | --- |
| 商品图或选图变化 | 保留 | 保留选择 | 全部失效 | 全部失效 | 失效 | 商品事实源改变 |
| 商品标题、属性或类目变化 | 更新 | 重新推荐 | 全部失效 | 全部失效 | 全部失效 | 商品语义改变 |
| 拍摄架构变化 | 保留 | 更新 | 全部失效 | 全部失效 | 失效 | 分镜骨架改变 |
| 人设、场景、穿搭、动作变化 | 保留 | 更新 | 全部失效 | 全部失效 | 失效 | 提示词输入改变 |
| 分镜数量变化 | 保留 | 更新 | 全部失效 | 全部失效 | 失效 | 任务结构改变 |
| 单镜提示词编辑 | 保留 | 保留 | 仅增加 revision | 仅对应镜失效 | 按需失效 | 最小化重做范围 |
| 生图模型、画幅、画质变化 | 保留 | 更新生产参数 | 保留 | 未生成与重做任务失效 | 保留 | 不重复视觉分析 |
| 文案规则变化 | 保留 | 保留 | 保留 | 保留 | 仅文案失效 | 独立生产支路 |
| 并发变化 | 保留 | 保留 | 保留 | 保留 | 保留 | 只影响调度 |

### 10.2 失效不等于删除

失效后的旧结果保留为历史 revision，不再作为当前有效结果：

```ts
interface RevisionedResult {
  revision: number;
  status: 'current' | 'superseded';
  supersededReason?: string;
  createdAt: string;
}
```

这保证用户能比较新旧提示词和新旧成图，也能在误操作后恢复。

## 11. 提示词资产系统重构

### 11.1 目标

将提示词资产库从“可搜索的提示词集合”升级为：

- 有来源；
- 有结构；
- 有类目；
- 有版本；
- 有发布状态；
- 有使用记录；
- 有结果反馈；
- 有质量评分；
- 有晋升、降权和退役规则的生产资产系统。

### 11.2 资产分层

#### 组合层

- 拍摄架构；
- 完整内容图组；
- 四镜节奏模板；
- 类目生产配方。

#### 原子层

- 人设；
- 场景；
- 穿搭；
- 动作；
- 光影；
- 镜头与景别；
- 道具；
- 商品展示方式。

#### 规则层

- 商品还原守卫；
- 类目禁用动作；
- 人物与纯商品规则；
- 负向提示词；
- 模型安全改写；
- 常见失败修复规则。

#### 结果证据层

- 成图；
- 用户采用结论；
- 重试记录；
- 失败原因；
- 导出记录；
- 自动质量评分。

结果证据不直接进入正式资产池，只用于审核和评分。

### 11.3 资产生命周期

```text
draft
  → pending_review
  → published
  → needs_fix
  → published（新版本）

published
  → disabled
  → archived
```

状态定义：

| 状态 | 含义 | 是否参与生产召回 |
| --- | --- | --- |
| `draft` | 未完成编辑 | 否 |
| `pending_review` | 已提交审核 | 否 |
| `published` | 已发布且可生产 | 是 |
| `needs_fix` | 数据不完整或效果下降 | 否 |
| `disabled` | 人工暂停 | 否 |
| `archived` | 历史版本或废弃资产 | 否 |

### 11.4 统一资产注册信息

现有 `SceneAsset`、`OutfitAsset`、`ActionAsset`、`PersonaAsset` 和 `FullPromptAsset` 可以继续保存各自内容字段，但建议增加统一注册层：

```prisma
model PromptAssetRegistry {
  id              String   @id
  assetType       String
  sourceAssetId   String
  status          String   @default("draft")
  version         Int      @default(1)
  provenance      String
  sourceRef       String?
  qualityScore    Float?
  confidence      Float?
  publishedAt     DateTime?
  disabledReason  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([assetType, sourceAssetId])
  @@index([assetType, status])
  @@index([qualityScore])
}
```

如果不希望引入注册表，也可以先在每张资产表补齐相同字段；但统一注册层更适合承载跨资产类型的使用事件、分类和评分。

### 11.5 类目统一

`AssetProductCategory` 作为唯一服务端类目树：

- 一级类目；
- 二级类目；
- 别名；
- 关键词；
- 解剖部位；
- 推荐架构；
- 支持的人物与镜头类型。

建议新增真实关联表，不再仅用 JSON 字符串表达：

```prisma
model PromptAssetCategoryLink {
  id         String @id @default(cuid())
  assetId    String
  categoryId String
  scope      String @default("suitable")

  @@unique([assetId, categoryId, scope])
  @@index([categoryId])
}
```

浏览器 `localStorage` 中的自定义类目需要一次性迁移到服务端；迁移后本地只保留缓存，不再作为业务真源。

### 11.6 资产使用事件

新增事件模型，区分“被选中”和“产生效果”：

```prisma
model PromptAssetUsageEvent {
  id         String   @id @default(cuid())
  assetId    String
  batchId    String
  productId  String?
  taskId     String?
  eventType  String
  createdAt  DateTime @default(now())
  metadata   String   @default("{}")

  @@index([assetId, eventType, createdAt])
  @@index([batchId])
}
```

推荐事件类型：

```text
recommended
locked
analysis_used
generation_submitted
generation_succeeded
generation_failed
output_accepted
retry_requested
output_rejected
output_exported
```

### 11.7 成图审核

```prisma
model WorkshopOutputReview {
  id                    String   @id @default(cuid())
  batchId               String
  productId             String
  taskId                String
  decision              String
  productFidelityScore  Int?
  compositionScore      Int?
  aestheticScore        Int?
  consistencyScore      Int?
  reasonCodesJson       String   @default("[]")
  note                   String?
  createdAt              DateTime @default(now())

  @@index([batchId, productId])
  @@index([taskId])
}
```

用户不需要每次填写全部分数。最小交互是：

- 采用；
- 重做；
- 淘汰。

系统可以用自动检查填充建议分，用户行为作为最终强信号。

### 11.8 资产评分指标

| 指标 | 计算方式 | 作用 |
| --- | --- | --- |
| 生成成功率 | 成功任务 / 提交任务 | 判断技术稳定性 |
| 首轮采用率 | 无重试即采用或导出的结果 / 成功结果 | 衡量生产效率 |
| 重试率 | 重试任务 / 成功任务 | 识别高成本资产 |
| 淘汰率 | 被拒绝结果 / 已审核结果 | 识别不适配资产 |
| 导出率 | 被导出结果 / 成功结果 | 衡量真实业务价值 |
| 商品还原分 | 自动或人工商品一致性评分 | 防止商品变形 |
| 构图分 | 主体占比、景别、遮挡和焦点 | 衡量画面可用性 |
| 审美分 | 光影、色彩、真实感和平台风格 | 衡量内容表现 |
| 人物一致性分 | 身份、穿搭与组内一致 | 衡量组图稳定性 |
| 覆盖度 | 类目 × 景别 × 动作槽位资产数量 | 指导补库 |

第一版综合质量分建议：

```text
质量分 =
  商品还原 35%
  + 构图质量 25%
  + 审美质量 20%
  + 人物/组图一致性 20%
```

推荐权重建议：

```text
推荐分 =
  类目与商品适配 35%
  + 历史质量 25%
  + 首轮采用率 20%
  + 多样性与新鲜度 10%
  + 用户收藏偏好 10%
```

样本不足时必须降低历史指标权重，回退到规则排序，避免少量偶然结果造成过拟合。

### 11.9 召回流程

```text
所有已发布资产
  → 类目硬过滤
  → 二级类目 / 解剖部位过滤
  → 有人 / 无人过滤
  → 景别与动作槽位过滤
  → 模型能力和安全规则过滤
  → 批次已用资产排除
  → 质量与采用率排序
  → 新鲜度和用户偏好调整
  → 生成候选组合
```

### 11.10 资产晋升与退役

#### 晋升

生成结果可通过“保存为候选资产”进入 `pending_review`，必须完成：

1. 来源记录；
2. 拆解为组合资产或原子资产；
3. 类目绑定；
4. 重复度检查；
5. 敏感词与冲突检查；
6. 人工确认；
7. 发布为新版本。

#### 降权

满足任一条件时自动降低推荐权重：

- 连续多次生成失败；
- 重试率显著高于同类资产；
- 淘汰率显著高于同类资产；
- 商品还原分持续偏低；
- 与新模型不兼容；
- 类目绑定不完整。

#### 退役

资产不应被硬删除。退役后：

- 不参与新任务召回；
- 历史批次仍保留版本引用；
- 可查看退役原因；
- 修订后以新版本重新发布。

## 12. UI 保持不变时的功能映射

### 12.1 顶部胶囊导航

保持当前四个模块和图标位置，不增加新的一级导航。

### 12.2 阶段 1 页面

保持输入舱和商品卡片形式，只补充：

- 商品准备状态；
- 类目识别结果；
- 素材完整度；
- 需处理原因；
- “重试、跳过、移除”动作；
- 混合类目拆批建议。

主按钮统一为“采集并检查”或“确认商品，进入制作方案”。

### 12.3 阶段 2 页面

保持左侧商品轨和右侧图片选择区，只补充：

- 推荐架构与推荐理由；
- 资产组合摘要；
- 动作资产锁定入口；
- 配置冲突提示；
- 预计任务数和成本；
- 本批配置确认状态。

不再在进入阶段 3 时重复让用户理解两套相似配置。设置弹窗负责编辑，确认弹窗只负责最终摘要与批准。

### 12.4 阶段 3 页面

保持商品分镜卡片，只增加：

- 自动检查总览；
- 仅看异常；
- 商品锚点、动作重复、景别覆盖等检查结果；
- 修改后失效提示；
- 单商品重新分析；
- 全部通过后的明确批准按钮。

### 12.5 阶段 4 页面

保持当前单商品和画廊视图，只增加：

- 当前 PipelineRun 状态；
- 暂停、继续、取消；
- 恢复状态；
- 每张图片的采用、重做、淘汰；
- 最终完成门禁；
- “完成本批次”主按钮。

### 12.6 提示词资产库

保持现有五个 Tab，只在工具栏和卡片上增加：

- 生命周期状态；
- 质量分；
- 首轮采用率；
- 重试率；
- 类目覆盖；
- 版本；
- 来源；
- 待审核筛选；
- 待修复筛选。

## 13. API 规划

### 13.1 批次命令接口

建议使用显式命令而不是仅 PUT 整份快照：

```text
POST /api/catalog/workshop-batches/:id/events
```

请求：

```json
{
  "revision": 12,
  "event": {
    "type": "APPROVE_STORYBOARD",
    "storyboardRevision": 3
  }
}
```

服务端负责：

- 校验当前状态是否允许该事件；
- 校验门禁；
- 更新批次状态；
- 记录事件；
- 返回新 revision 和派生摘要。

第一期仍可保留完整快照 PUT，但状态修改必须逐步迁移到命令接口。

### 13.2 PipelineRun 接口

```text
POST   /api/workshop/runs
GET    /api/workshop/runs/:id
POST   /api/workshop/runs/:id/pause
POST   /api/workshop/runs/:id/resume
POST   /api/workshop/runs/:id/cancel
POST   /api/workshop/runs/:id/retry-failed
```

### 13.3 结果审核接口

```text
POST /api/workshop/tasks/:taskId/review
```

请求：

```json
{
  "decision": "accepted",
  "scores": {
    "productFidelity": 90,
    "composition": 84,
    "aesthetic": 88,
    "consistency": 86
  },
  "reasonCodes": []
}
```

### 13.4 资产生命周期接口

```text
POST /api/catalog/assets/:type/:id/submit-review
POST /api/catalog/assets/:type/:id/publish
POST /api/catalog/assets/:type/:id/disable
POST /api/catalog/assets/:type/:id/create-version
GET  /api/catalog/assets/coverage
GET  /api/catalog/assets/:type/:id/performance
```

## 14. 工程落点

### 14.1 Domain

建议新增：

```text
packages/domain/src/workshopPipeline/
├── states.ts
├── events.ts
├── reducer.ts
├── gates.ts
├── invalidation.ts
├── qualityChecks.ts
└── scoring.ts
```

要求：

- 全部为纯函数；
- 不读取浏览器或 Node 环境；
- 状态转移和门禁有单元测试；
- Web 与 API 共用同一规则。

### 14.2 Contracts

在 `packages/contracts` 增加：

- PipelineRun DTO；
- 批次事件 DTO；
- 输出审核 DTO；
- 资产性能 DTO；
- 类目迁移 DTO；
- 新版批次快照 schema。

### 14.3 API

路由只处理 HTTP 映射，业务逻辑放服务层：

```text
apps/api/src/services/workshopPipeline/
├── batchEvents.ts
├── runCoordinator.ts
├── recovery.ts
├── outputReview.ts
└── assetFeedback.ts
```

资产评分和查询通过 repositories 访问数据库，不在路由中直接写 Prisma 业务流程。

### 14.4 Web

目标是逐步缩小 `useBatchWorkshopRunner`：

```text
apps/web/src/features/workshop/
├── api/
│   ├── batchCommands.ts
│   ├── pipelineRuns.ts
│   └── outputReviews.ts
├── model/
│   ├── selectors.ts
│   ├── viewStage.ts
│   └── commands.ts
├── hooks/
│   ├── useWorkshopBatch.ts
│   ├── usePipelineRun.ts
│   └── useOutputReview.ts
└── components/
```

组件不再直接决定业务状态，只触发命令并根据 selector 渲染。

## 15. 数据迁移方案

### 15.1 迁移原则

- 不删除现有批次；
- 不修改历史生成结果语义；
- 旧批次使用兼容映射；
- 新字段允许为空并逐步回填；
- 资产类目迁移先预览、后应用；
- 每次 schema 迁移前自动备份 SQLite。

### 15.2 批次状态迁移

旧批次映射建议：

| 旧状态 / 快照 | 新状态 |
| --- | --- |
| 无商品 | `draft` |
| 阶段 1 且存在采集任务 | `collecting` |
| 阶段 2 | `plan_ready` |
| 阶段 3 且分析中 | `analyzing` |
| 阶段 3 且存在分镜 | `review_required` |
| 阶段 4 且任务运行中 | `generating` |
| 阶段 4 且存在失败任务 | `partial_failed` 或 `qc_required` |
| 阶段 4 且任务全部成功 | `qc_required` |
| 已归档 | `archived` |

旧数据无法证明用户已完成审核，因此不得自动迁移为 `completed`。

### 15.3 类目迁移

1. 读取浏览器本地类目；
2. 与 domain 默认类目合并；
3. 生成服务端迁移预览；
4. 合并同义类目与重复关键词；
5. 建立父子关系；
6. 根据资产现有字段建议绑定；
7. 用户确认后写入；
8. 前端改读服务端；
9. 本地存储降级为缓存。

### 15.4 资产注册迁移

为现有五类资产创建 Registry：

- 现有人工、反推和官方资产默认进入 `pending_review`；
- 官方种子经过校验后可直接 `published`；
- 缺少类目绑定的资产保留，但不能进入类目精确召回；
- `usageCount` 保留为历史调用次数；
- 不根据历史 `usageCount` 推断质量分。

## 16. 分期实施计划

### 16.1 一期：流程收敛

建议周期：1–2 周。

范围：

1. 建立 domain 状态机、事件和门禁；
2. 将页面阶段改为状态派生；
3. 让 `completed` 成为可达状态；
4. 补齐动作资产加载、锁定和解除入口；
5. 对账所有设置项，删除或修复无效配置；
6. 接通批次级场景、动作和组签名去重上下文；
7. 实现精确失效规则；
8. 为生图任务增加幂等键；
9. 自动驾驶增加暂停、续跑、取消和明确停点；
10. 为关键状态转移补测试。

一期验收：

- 重复点击不会创建重复付费任务；
- 修改单镜只使对应成图失效；
- 所有任务结束后能进入 `qc_required`；
- 用户审核后能进入 `completed`；
- 刷新或重启可恢复运行状态；
- 设置面板展示的配置全部真实生效。

### 16.2 二期：词库治理

建议周期：2–3 周。

范围：

1. 服务端统一商品类目；
2. 资产生命周期与版本；
3. 资产 Registry；
4. 使用事件；
5. 成图审核；
6. 待审核资产区；
7. 去重与来源追踪；
8. 资产性能详情；
9. 覆盖度统计；
10. 优质结果晋升流程。

二期验收：

- 所有生产资产都有来源、状态、版本和类目；
- 生产召回只使用 `published` 版本；
- 每次资产调用能关联到批次、商品和任务；
- 用户采用、重试、淘汰和导出能回写使用事件；
- 历史批次仍能引用旧版本复现。

### 16.3 三期：效果优化

建议周期：2–4 周。

范围：

1. 成图自动初评；
2. 资产质量聚合；
3. 推荐排序；
4. 资产组合评分；
5. A/B 对照；
6. 自动降权；
7. 类目覆盖度看板；
8. 低质量资产修复与退役建议。

三期验收：

- 可以比较同类资产的首轮采用率与重试率；
- 推荐结果能解释主要排序原因；
- 低质量资产能够自动降权；
- 系统可以明确指出哪些类目和镜头槽位缺资产；
- 新旧推荐策略可以通过 A/B 数据比较。

## 17. 测试计划

### 17.1 Domain 单元测试

必须覆盖：

- 每个合法状态转移；
- 每个非法状态转移；
- 各阶段出口门禁；
- 失效矩阵；
- 幂等键稳定性；
- 资产评分边界；
- 样本不足时的排序回退；
- 混合类目拆批建议。

### 17.2 API 测试

- revision 冲突；
- 重复事件；
- 重复任务提交；
- 运行暂停与继续；
- 部分失败重试；
- 恢复未知上游任务；
- 历史批次只读；
- 资产发布与禁用；
- 审核事件写入；
- 类目迁移预览与应用。

### 17.3 Web 组件测试

- 不满足门禁时主按钮禁用并说明原因；
- 返回旧页面不会改变业务状态；
- 修改上游输入能正确标记下游失效；
- 正常商品折叠、异常商品突出；
- 暂停、继续和取消状态显示；
- 采用、重做、淘汰交互；
- `completed` 后只读；
- 历史复制产生新批次而不修改原批次。

### 17.4 端到端场景

至少覆盖：

1. 单商品完整成功；
2. 多商品部分采集失败；
3. 混合类目批次拆分；
4. 单商品分析失败后重试；
5. 分镜编辑后只重做单镜；
6. 四宫格成功但切片失败；
7. 生图部分失败；
8. 应用重启后恢复；
9. 用户暂停后继续；
10. 成图采用与资产反馈；
11. 完成、归档和复制历史批次；
12. 旧批次兼容迁移。

## 18. 可观察性与审计

### 18.1 关键事件

记录以下结构化事件：

- batch_created；
- collection_started / finished；
- production_plan_approved；
- analysis_started / finished；
- storyboard_approved；
- generation_started / finished；
- run_paused / resumed / cancelled；
- output_accepted / retry_requested / rejected；
- export_completed；
- batch_completed / archived；
- asset_published / disabled / versioned。

### 18.2 核心指标

流程指标：

- 每阶段平均耗时；
- 各阶段退出率；
- 每批人工点击数；
- 每批重复确认数；
- 恢复成功率；
- 任务重复提交率；
- 单商品分析和生成失败率；
- 从创建到完成的总周期。

资产指标：

- 各类目资产覆盖度；
- 首轮采用率；
- 重试率；
- 淘汰率；
- 导出率；
- 平均质量分；
- 低样本资产数量；
- 待审核和待修复资产数量。

### 18.3 错误分类

错误必须分为：

- 输入错误；
- 商品采集错误；
- 模型配置错误；
- 上游网络错误；
- 限流或配额错误；
- 内容审核错误；
- 模型输出结构错误；
- 资产冲突；
- 生图失败；
- 切图失败；
- 存储失败；
- 恢复状态未知。

用户提示使用可行动语言，日志保留技术细节和 requestId。

## 19. 成本与安全门禁

### 19.1 成本门禁

进入生图前展示：

- 商品数量；
- 每商品分镜数；
- 总任务数；
- 四宫格与单镜策略；
- 模型；
- 预计调用量；
- 可选预计成本；
- 并发上限。

高成本批次必须再次确认，重复点击不得重复提交。

### 19.2 数据安全

- 日志不记录 API Key；
- 资产来源记录不包含不必要的个人信息；
- 用户上传的人脸、商品图和生成结果按现有本地存储策略管理；
- 审核模型输入必须忽略图片和来源文本中的指令；
- 导出只包含用户选择的交付物；
- 历史批次删除与资产退役分开处理。

## 20. 验收标准

### 20.1 流程验收

- 四阶段 UI 形式保持不变；
- 每阶段有明确入口、主动作和出口门禁；
- 页面查看与业务状态分离；
- 批次能够进入真实 `completed`；
- 失败可以局部重试；
- 任务能够暂停、继续和恢复；
- 重复点击不会重复创建任务；
- 修改上游输入后，下游按矩阵精确失效；
- 历史批次可复现且不可被当前编辑污染。

### 20.2 词库验收

- 每条生产资产都有状态、版本、来源和类目；
- 生产只召回已发布资产；
- 调用次数与效果指标分开；
- 每个生成结果可以追溯所用资产版本；
- 用户采用、重试、淘汰和导出会形成事件；
- 可查看类目覆盖缺口；
- 低质量资产可以降权、修订和退役；
- 优质结果不会未经审核自动污染正式词库。

### 20.3 目标指标

第一阶段建议目标：

| 指标 | 目标 |
| --- | ---: |
| 刷新或重启后任务恢复率 | ≥ 95% |
| 重复任务提交率 | 0 |
| 完成批次可追溯率 | 100% |
| 配置展示与实际生效一致率 | 100% |
| 平均人工点击与重复确认 | 降低 30% |
| 失败后整批重做率 | 降低 25% |

词库闭环建立后再确定采用率、重试率和质量分的长期目标，避免在无历史数据时制定虚假基线。

## 21. 待确认产品决策

实施前需要产品与研发共同确认：

1. 混合类目批次是否强制拆分，还是仅提示；
2. 成图审核是否要求每张都选择，还是允许按商品“一键采用全部”；
3. `completed` 后是否允许解锁编辑，还是必须复制为新批次；
4. 自动质量评分第一期是否只做规则检查，不调用额外视觉模型；
5. 资产发布是否需要独立审核人；
6. 低质量资产自动降权阈值；
7. 是否展示预计费用，若展示则以供应商价格还是内部统一估算；
8. 旧版浏览器本地商品类目的迁移与合并策略。

默认建议：

- 混合类目先提示拆分，不强制；
- 每款商品至少确认一个采用结果；
- `completed` 后只读，修改需复制为新批次；
- 第一期只做确定性规则检查；
- 资产发布需要人工确认；
- 低样本资产不自动降权；
- 价格数据可靠前只展示任务数；
- 本地类目先生成迁移预览，用户确认后写入服务端。

## 22. 最终目标形态

用户看到的仍然是当前原创种草工坊：

- 同样的顶部胶囊导航；
- 同样的四个模块；
- 同样的四阶段制作流程；
- 同样的商品卡片、分镜卡片、画廊和设置面板。

但系统内部从“页面串联的一组功能”升级为“可验证、可恢复、可学习的生产流水线”：

```text
商品准备
  → 制作方案
  → 分镜审核
  → 生产交付
  → 结果反馈
  → 词库治理
  → 下一批更优推荐
```

最终成功标准不是词库条数增长，而是：

- 首轮可用结果更多；
- 失败和重试成本更低；
- 同批画面更多样但仍保持一致；
- 商品还原更稳定；
- 历史结果可以复现；
- 每条资产的真实价值可被衡量；
- 系统随着生产使用持续变准，而不是持续变乱。


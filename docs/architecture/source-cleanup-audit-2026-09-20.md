# 源码清理审计与执行清单（2026-09-20）

> 审计性质：只读静态审计。本文件列出可按批执行的清理项；删除前必须在**当前工作树**重跑本文末尾的验收命令。项目此刻有大量未提交变更，清理不得覆盖、回退或混入无关的用户改动。

## 结论摘要

- 源码总量：**760 个文件、123,100 物理行**（排除依赖、构建产物、媒体、文档）。
- 生产源码：756 个文件、122,949 行；测试：4 个文件、151 行。
- 发现 32 个静态不可达候选（2,440 行）。其中 3 个 `.jsx` UI 组件为扫描器无法沿 `.d.ts` 正确解析造成的误报，**不可删除**。
- 其余 **29 个文件、1,751 行**没有来自应用入口、包入口或其他源码的静态入边，可作为第一批删除候选。
- 另有 125 行完全未接入的 CSS，以及 1 个确定的无用导入。

这里的“静态不可达”指从 `apps/web/src/main.tsx`、`apps/api/src/index.ts` 和各 workspace 包入口出发，沿 TypeScript/JavaScript 静态 import/export 图均无法到达。它不等于绝对安全：字符串动态导入、插件约定或仓库外使用者不会被扫描到。因此按批删除、逐批验证。

## 源码规模基线

| 区域 | 文件数 | 物理行数 | 说明 |
| --- | ---: | ---: | --- |
| `apps/api/src` | 134 | 17,892 | Hono API 与服务层 |
| `apps/web/src` | 451 | 77,371 | React/Vite 前端，约占总量 63% |
| `apps/desktop/src` | 7 | 1,408 | Tauri/Rust 壳 |
| `packages/` | 118 | 22,016 | contracts/domain/server-kit/prisma |
| `tools/scripts` | 32 | 3,415 | 构建、部署与质量脚本 |
| 其余受纳入源文件 | 18 | 998 | 配置、部署脚本、入口等 |
| **合计** | **760** | **123,100** | 含 CSS、Rust、Python、Shell 与 Prisma |

## 执行原则

1. **一次只处理一批。** 每一批删除后立即运行“验收命令”，通过后再进下一批。
2. **不扩大范围。** 只删除本清单列出的文件/符号；不要顺手格式化整个项目、更新 lockfile 或重置现有改动。
3. **先删孤立簇，再删单文件。** 同一个孤立簇需要一起删，避免留下互相引用的半截实现。
4. **删除前确认工作树。** 用 `git diff -- <path>` 看候选文件是否被当前未提交工作修改；有修改时，先确认那部分是否仍要保留。
5. **不要删 3 个 UI 误报。** 它们通过 `.jsx` 与同名 `.d.ts` 被引用，当前扫描器未将此路径视为可达。

## 第一批：高置信度孤立代码（建议优先）

合计 **29 个文件、1,751 行**。每个簇均无来自运行入口的静态入边。

### A. 后端旧抽象与未接入服务（4 文件、161 行）

删除：

- `apps/api/src/core/defineRoute.ts`
- `apps/api/src/core/index.ts`
- `apps/api/src/services/analyze/storyboardAssets.ts`
- `apps/api/src/services/imageGatewaySize.ts`

说明：`defineRoute`/`adaptRequest` 与 `core/index.ts` barrel 没有消费者；`loadStoryboardAssets` 已不在当前 API 工作流依赖图内；独立图片网关尺寸适配也没有调用方。

### B. 资产中心旧 UI 簇（8 文件、260 行）

删除：

- `apps/web/src/features/assets/components/AssetCategorySidebar.tsx`
- `apps/web/src/features/assets/components/AssetClassificationModal.tsx`
- `apps/web/src/features/assets/components/AssetLibraryContextHeader.tsx`
- `apps/web/src/features/assets/components/DeconstructImageSelection.tsx`
- `apps/web/src/features/assets/components/DeconstructReviewPanel.tsx`
- `apps/web/src/features/assets/components/HistoricalDuplicatePanel.tsx`
- `apps/web/src/features/assets/components/PromptAlbumCard.tsx`
- `apps/web/src/features/assets/hooks/useAssetOrganization.ts`

说明：其中 `AssetClassificationModal` 只依赖同簇的 `AssetCategorySidebar`；没有任何资产中心入口引用该簇。必须整簇处理。

### C. 助手旧运行记录接口（2 文件、41 行）

删除：

- `apps/web/src/features/assistant/api/runs.ts`
- `apps/web/src/features/assistant/hooks/useAssistantRunsQuery.ts`

说明：hook 只依赖这个 API 文件，没有上层消费者。

### D. 画布旧组件与转导文件（5 文件、431 行）

删除：

- `apps/web/src/features/canvas/components/CanvasDrawingIcon.tsx`
- `apps/web/src/features/canvas/components/CanvasMaterialIcon.tsx`
- `apps/web/src/features/canvas/components/CanvasToolIcons.tsx`
- `apps/web/src/features/canvas/components/CanvasVideoIcon.tsx`
- `apps/web/src/features/canvas/components/CanvasMultiSelectToolbar.tsx`

说明：四个 1 行转导文件已经被 `@/shared/icons` 直接替代；`CanvasMultiSelectToolbar`（427 行）没有任何调用方。注意不要删除 `apps/web/src/shared/icons/canvas/` 下的真正图标实现。

### E. 小型前端残留（2 文件、23 行）

删除：

- `apps/web/src/features/generate/engine/generationConcurrency.ts`
- `apps/web/src/features/home/index.ts`

### F. 旧独立网关设置簇（2 文件、290 行）

删除：

- `apps/web/src/features/settings/components/ImageGatewayPanel.tsx`
- `apps/web/src/shared/api/imageGateway.ts`

说明：当前设置页接入的是 `ApiServicesGatewayPanel`；旧组件与其专用 client 只相互依赖，均不在路由依赖图内。

### G. 工坊批处理遗留（5 文件、439 行）

删除：

- `apps/web/src/features/workshop/batch/batchAssetAllocation.ts`
- `apps/web/src/features/workshop/batch/batchCopywritingStatus.ts`
- `apps/web/src/features/workshop/batch/batchShotRunner.ts`
- `apps/web/src/features/workshop/batch/components/BatchPipelineHeader.tsx`
- `apps/web/src/features/workshop/batch/jewelryMasterSnippet.ts`

说明：这些文件未被当前 `BatchWorkshopView` 和 `useBatchWorkshopRunner` 依赖链使用；删除后应特别验证工坊批量流程。

### H. 浏览器归档旧功能（1 文件、106 行）

删除：

- `apps/web/src/shared/api/exportBrowserArchive.ts`

说明：导出浏览器本地状态的实现无任何 UI、菜单或调用方连接。

## 第二批：未接入产物与确定的无用符号

### 可直接处理

- 删除 `apps/web/@components/DepthText.css`（60 行）：仓库内只有样式自身引用 `depth-text`，没有组件或入口引用。
- 删除 `apps/web/@components/TiltedCard.css`（65 行）：实际使用的是 `apps/web/src/shared/ui/TiltedCard.css`，这份位于 `@components` 的副本没有消费者。
- 从 `tools/scripts/deploy/export-official-seeds.mjs` 的 `node:fs` 导入中移除 `writeFileSync`：ESLint 已确认该导入未使用。

### 需确认后处理

- `apps/web/jsrepo.config.ts`、`apps/web/jsrepo.json`，以及 `apps/web/package.json` 中的 `jsrepo` / `@jsrepo/transform-javascript`。

  当前没有任何仓库脚本、代码或 README 使用它们，像是一次 UI 组件导入后遗留的开发工具。若团队仍会手动执行 `jsrepo` 同步组件，保留；否则可以删除配置和两个开发依赖，并执行 `pnpm install --lockfile-only` 更新 lockfile。

## 明确保留：静态扫描误报

以下 3 个文件**正在被运行代码使用**，不得删除：

- `apps/web/src/shared/ui/JellyRadio.jsx`：由 `WorkshopSideCapsuleBar.tsx` 使用。
- `apps/web/src/shared/ui/ThoughtLine.jsx`：由 `AssistantLiveStatus.tsx` 使用。
- `apps/web/src/shared/ui/TiltedCard.jsx`：由 `FeatureCapsules.tsx` 使用。

原因是它们用 `.jsx` 实现、配同名 `.d.ts` 声明；当前 `source-audit` 的 TypeScript 模块解析把 import 解析到声明文件，没有继续计入 JSX 实现。此处应改进审计脚本，而不是删除组件。

## 不属于“垃圾代码”，但应单列整改

### 质量门禁现状

| 项目 | 结果 | 建议 |
| --- | --- | --- |
| TypeScript `--noEmit` | 通过 | 每批删除后必跑 |
| 未使用变量门禁 | 1 个新增问题 | 先移除 `writeFileSync` |
| 超长文件门禁 | 2 个新增问题 | 拆 `HeadlinePosterStudio.tsx`（624 行）和 `DotGrid.tsx`（429 行） |
| 依赖边界 | 5 error、6 warning | 先消除 `shared → features` 的反向依赖，再拆循环 |
| ESLint | 5 error、759 warning | 以新增 error 为先；大量 `any` 另立类型化计划 |

### 依赖边界违规（先修方向，不直接删文件）

`apps/web/src/shared` 不应反向依赖 feature：

- `shared/utils/xhsLinkBatch.ts → features/assets/utils/assetPromptConstants.ts`
- `shared/prompt-bar/index.ts → features/home/components/prompt-bar/PromptActionBar.tsx`
- `shared/api/deconstructClient.ts → features/assets/utils/assetPromptConstants.ts`
- `shared/api/deconstructClient.ts → features/assets/utils/assetDeconstructCsvExport.ts`
- `shared/api/catalogCache.ts → features/assets/utils/assetLibraryCache.ts`

处理方式：将真正通用的常量、类型或纯函数下沉到 `shared`/`domain` 的合适位置；或把目前伪装为 shared 的 client 移回对应 feature。不要通过放宽依赖规则来消除报错。

### 循环依赖警告（后续拆分）

- `packages/server-kit/src/assistant/agentLoop.ts → toolExecutor.ts → subAgent.ts → agentLoop.ts`
- `packages/domain/src/prompt-engine/assembler.ts ↔ guards.ts`
- `packages/domain/src/assistant/events.ts ↔ types.ts`
- `apps/web/src/store/brandKitSlice.ts ↔ types/store.ts`
- `apps/web/src/store/assistantSkillSlice.ts ↔ types/store.ts`
- `AssetLibraryFilterBar.tsx ↔ AssetLibraryToolbar.tsx`

这类问题不是死代码，优先通过提取 `types.ts`、常量或无状态 helper 断环。

## 逐批验收命令

在仓库根目录执行：

```bash
pnpm run check:root-layout
pnpm run typecheck
node tools/scripts/quality/source-audit.mjs
node tools/scripts/quality/check-unused.mjs
node tools/scripts/quality/check-max-lines.mjs
node node_modules/dependency-cruiser/bin/dependency-cruise.mjs apps/web/src apps/api/src packages --config tools/configs/dependency-cruiser.mjs --output-type err-long
```

然后做对应功能的人工冒烟：

- A：图片生成、提示词分析、故事板接口。
- B：资产中心的筛选、分类、素材拆解、图集查看。
- C：助手会话的创建、执行、历史查看。
- D：画布节点创建、连线、多选、素材导入。
- F：设置页模型网关的读取、保存、模型拉取。
- G：工坊单品与批量执行、预览、导出。

## 建议提交切分

1. `chore: remove unreachable api and shared modules`（A、C、E、H、无用导入）
2. `chore: remove obsolete asset and canvas components`（B、D）
3. `chore: remove obsolete workshop batch modules`（G）
4. `chore: remove unused UI import artifacts`（CSS、可选 jsrepo）
5. `refactor: repair shared feature boundaries`（单独处理边界违规与循环依赖）

每一提交保持可构建、可回滚；不要把删除死代码与 UI 改版或功能重写混在一起。

# 仓库架构核查、清理与整改记录

日期：2026-09-24。范围：现有 Web/API、四个共享/数据包、工坊整改代码、工程工具、测试入口与说明文档。状态：本地整改与模拟回归完成；未提交、未部署。

## 1. 结论：保留轻量工作区，整改真正混乱的边界

**不直接废掉 monorepo，也不推倒重写。** 当前只有两个运行应用和四个共享/数据包，不是过度拆分的微服务仓库。把所有文件合并进一个 src 并不会消除工坊状态混乱，反而需要同步改动部署入口、包导出、路径别名和数据库工具。

本轮采用：**轻量 pnpm workspace + 模块化单体 + feature 内按职责分组 + 可执行的质量门禁**。

| 方案 | 收益 | 当前风险/代价 | 决策 |
| --- | --- | --- | --- |
| 单包 client/server/shared | 少几份 manifest | Node/浏览器依赖混在一起，类型与运行边界弱化，迁移面广 | 暂不采用 |
| 前后端/公共库多仓 | 发布与团队完全隔离 | 契约同步、联调、版本发布成本增加 | 暂不采用 |
| feature 微包 + Nx/Turborepo | 更细发布与任务缓存 | 当前没有独立发布需求，增加层级与配置 | 不采用 |
| 现有六个 workspace + 职责分层 | 保留真实边界，修改可以原子完成 | 需持续检查引用和状态所有权 | 已落地 |

详细工作区职责见 [共享包归属](packages.md)，具体放置规则见 [目录分层](layout.md)。本轮没有新增依赖或编排框架。

## 2. 核查发现与处理

| 发现 | 风险 | 本轮处理 |
| --- | --- | --- |
| 工坊 model 原有 45 个文件平铺 | 采集、分析、生成、交付与工作区恢复难以定位 | 五个职责子目录，测试与实现相邻 |
| React 快照 hook 混在 model | model 对 React 适配和 UI 生命周期产生反向依赖 | 纯快照映射留 model，连接 hook 放 hooks |
| 跨功能资产缓存放在 assets 私有 utils | 工坊需引用另一 feature 的内部实现 | 移至 shared/api，类型来源改为 domain |
| 应用组合入口散在 src 根 | app 目录与实际入口分离 | App.tsx 移入 app，更新 main 入口 |
| 测试入口手写目录 glob | 7 个已有测试文件没有被根测试命令执行 | 递归发现 + 发现器自身测试 + 分包测试入口 |
| 内部依赖使用 `*` | 未明确强制引用本地工作区 | 8 处改为 `workspace:*`，同步 lockfile |
| 边界检查主要覆盖 TS 静态 import | re-export、动态字面量导入、JS 模块可能绕过 | 统一 AST 引用扫描；补充运行环境、分层和 workspace 规则 |
| 密钥扫描只看已跟踪文件 | 新增未暂存代码不在检查范围 | 纳入未忽略的新文件 |
| 文档把 `.local` 和数据库/备份列为可删产物 | 存在真实数据丢失风险 | 明确保护数据，区分 ignore 与可清理产物 |

检查采取源码引用追踪、入口/包导出核对、类型与构建检查、完整测试和模拟浏览器回归；没有通过访问生产数据库来判断线上数据有效性。

## 3. 落地目录与迁移范围

```text
apps/
  web/src/
    main.tsx
    app/App.tsx
    features/workshop/
      api/workshopResources.ts
      hooks/useLiveWorkshopWorkspace.ts
      components/
      model/
        batchTypes.ts
        collection/     采集、输入、参考图选择
        analysis/       分析预检、队列、格式化、自动选图分析
        generation/     就绪检查、提交、轮询、恢复、重试
        delivery/       文案、矩阵与 ZIP 导出
        workspace/      状态、失效、快照、恢复、运行控制
    shared/api/assetLibraryCache.ts
  api/src/              保留 routes/services/repositories/gateways 分层
packages/               contracts/domain/server-kit/prisma
tools/                 configs/scripts（不另建 workspace）
docs/                   architecture/vendors
```

迁移清单包含 43 个入口、资源和 model 文件；另外迁移一份资产缓存。原 `workshopSnapshotBridge.ts` 随后拆为 `model/workspace/workshopSnapshot.ts` 和 `hooks/useLiveWorkshopWorkspace.ts`。迁移同步修改 import、测试资源路径和质量基线中的文件路径，未增加旧路径兼容转发壳，未扩大基线额度。

- **没有更改数据库目录或迁移文件**，也没有挪动上传、素材和配置。
- `workshop -> assets`、`assets -> canvas` 两条已审核的 UI 复用边界仍保留，不宣称跨功能耦合已经消失。
- 工坊 runner 仍负责较多状态协调。分目录是降低维护成本，不等于已完成版本化生产计划或服务端持久任务编排。

## 4. 清理清单与证据边界

静态运行入口可达性检查、模块名与导出符号全仓检索确认后，删除以下三个无消费者的源文件：

| 删除文件（旧路径） | 物理行数 | 依据 |
| --- | ---: | --- |
| `apps/web/src/features/assets/components/AssetProductLibrary.tsx` | 134 | 未挂载、无导入消费者；不是当前资产库界面入口 |
| `apps/web/src/features/workshop/model/batchPromptPadding.ts` | 110 | 无调用方，只存在废弃分支内的相互引用 |
| `apps/web/src/features/workshop/model/batchVisionTemplates.ts` | 55 | 无有效运行入口消费者 |
| 合计 | **299** | 不包含目录迁移所显示的 Git 删除行 |

另清理根目录 `.DS_Store` 和本轮生成的一次性迁移脚本；保留审计清单和整改前差异记录。Git 中大量旧路径的 D 与新路径的新增是**移动文件**，不能统计为大量功能代码删除。

### 只读盘点结果

| 指标 | 本轮开始 | 本轮完成 |
| --- | ---: | ---: |
| 源码/脚本文件 | 961 | 968 |
| 物理源码行（含注释与空行） | 134,821 | 134,736 |
| 实现与工具文件 | 871 | 875 |
| 测试文件 | 90 | 93 |
| 应用源码静态不可达候选 | 3 | 0 |

本轮新增自动测试发现、架构规则与相应测试，因此总文件数不是只减不增。物理行统计并非代码复杂度评分。

对完成盘点中的 968 个源码/脚本文件进行字节级重复与空内容检查：未发现完全相同文件组或空源码文件；这不等于不存在近似实现、业务重复或无用公开素材。

盘点排除依赖、构建输出、本地数据、媒体与文档；报告为 `.local/source-audit.json`，仅测试可达模块会单列。**零静态候选不证明所有动态代码/静态资源都需要，也不证明整个系统没有死代码。** 非字面量加载、公开包出口、部署脚本、素材与种子仍需结合真实入口人工判断；本轮不冒险批量删除。

### 明确保留

`.env*`、`.local/`、所有 SQLite 及其 WAL/SHM、数据库备份、用户上传与本地存储、种子、迁移、公开图片/视频、仍可能由外部调用的运维入口。不做磁盘容量型清扫，不以“未被 import”删除用户数据。

## 5. 测试发现与质量门禁

原来遗漏的七个测试文件已纳入根测试命令：

1. `apps/api/src/gateways/wanbang.test.mjs`
2. `apps/api/src/routes/system/models/pricing.test.mjs`
3. `apps/api/src/services/deconstruct/progress.test.mjs`
4. `apps/api/src/services/deconstruct/saveFullPrompts.test.mjs`
5. `apps/api/src/services/deconstruct/unifiedShard.test.mjs`
6. `apps/api/src/services/generate/exportZip.workshop.test.mjs`
7. `apps/web/src/features/assets/utils/deconstructQueueStorage.test.mjs`

现在根命令递归发现 93 个测试文件；新增三个工具测试文件验证发现器、导入边界、工作区策略。测试默认数据库/数据目录在临时目录中，清理只作用于本次创建的临时路径。浏览器 QA 脚本仍显式运行，不混入普通单元测试。

`pnpm run check` 与 CI 统一入口，新增工作区检查，并保留模型清单、类型、ESLint、未使用、超长文件、导入边界、密钥、测试和前端构建。内部包 manifest 与 lockfile 一致，锁文件只有 8 处内部依赖 specifier 改动，没有升级外部依赖。

## 6. 验证结果

- 完整质量门禁：通过；**316/316 测试通过，0 失败**。
- ESLint：**0 errors / 698 warnings**。上一阶段为 703 warnings；没有为了过检查扩大基线。历史告警未清零。
- 未使用绑定基线：18 个已审核告警；超长文件基线：49 个；边界扫描：814 个生产源码文件、2 条已审核跨功能边界。
- 生产前端构建通过；TypeScript、workspace、模型清单、密钥和根目录检查通过。
- 离线 frozen lockfile 检查通过；`git diff --check` 通过。
- 三组浏览器模拟回归全部通过，无页面运行时错误：
  - 资产资格、失效锁定、加载失败、资源页、设置弹窗、分镜审核与四图交付；
  - 未知任务只读核对、拒绝交付、收费重试确认、审核失败不生成、保存失败阻止切换；
  - 首页重新进入与缓存重进、深链接/刷新恢复、归档失败、未保存输入、运行中任务保护。

复跑命令：

```bash
pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts
pnpm run check
pnpm run audit:source
pnpm run test:list
# 本地 Vite 已启动且可加载 Playwright 模块时：
node tools/scripts/qa/workshop-assets-browser.mjs
node tools/scripts/qa/workshop-browser.mjs
node tools/scripts/qa/workshop-entry-browser.mjs
```

浏览器脚本默认访问本地 `127.0.0.1:5173`，所有业务 API 均模拟；Playwright 不在项目新增依赖中，可通过 `PLAYWRIGHT_MODULE` 指定已有模块的绝对路径。

本机使用 **Node 24.19.0**，最终门禁使用 **pnpm 10.13.1**。仓库要求 **Node 22**，CI 仍使用 Node 22；本轮没有声称已在指定 Node 版本或线上环境完成验证。

本机证据：`/tmp/beike-architecture-check-final.log`、`/tmp/beike-architecture-lock-final.log`、`/tmp/beike-architecture-assets.log`、`/tmp/beike-architecture-regression.log`、`/tmp/beike-architecture-entry.log`。临时日志不是永久归档，可用仓库脚本复跑。

## 7. 尚未完成的结构性工作

1. **工坊状态所有权**：`useBatchWorkshopRunner.ts` 仍有 780 物理行。继续以版本化 ProductionPlan 和明确状态转换为目标，而不是继续拆一批包装 hook。
2. **后端持久编排**：当前浏览器仍承担部分调度，关闭浏览器不等于生产流程由服务端完整接管；需要单独设计作业、attempt、版本与恢复契约。
3. **其它巨型模块**：SmartEditModal、ImageLightboxModal、UsageTab、AssetCenter 等仍需要按用例逐步拆分。本轮不借目录整理重写所有业务。
4. **动态资源与近似重复**：静态图只能缩小候选范围，不能可靠证明所有公开资源无用；需要运行记录或资源登记再清理。
5. **真实业务质量**：真实厂商响应、生成质量、线上历史资产分布及多端并发仍需预发布验收。本轮没有付费模型调用、生产库操作或部署。

后续应按“生产计划契约 → 持久任务状态 → 巨型 UI/hook 拆分 → 运行证据驱动资源清理”推进，避免把尚未完成的行为重构包装为目录优化成果。

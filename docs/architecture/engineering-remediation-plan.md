# 贝壳云图工程化整改计划

> 状态：待执行  
> 版本：v1.0  
> 制定日期：2026-09-20  
> 适用范围：`apps/web`、`apps/api`、`apps/desktop`、`packages/*`、`tools/*` 与 GitHub Actions

## 1. 目标与原则

本计划将贝壳云图从“具备可运行能力的单核 Monorepo”推进到“可重复构建、可安全发布、可持续演进”的工程基线。

整改遵循以下原则：

1. **先安全与发布，再做结构重构。** 密钥、构建一致性和 CI 门禁未解决前，不合并大规模业务重构。
2. **不扩大既有技术面。** 保持 `apps / packages / tools / docs` 单核扁平布局；不引入 Turborepo，也不把每个 feature 拆成 npm 微包。
3. **包边界比目录形式更重要。** 共用业务规则放 `@beike/domain`，共用 DTO 放 `@beike/contracts`，Node 能力放 `@beike/server-kit`，前端仅复用的能力放 `apps/web/src/shared`。
4. **新债务零容忍，历史债务递减。** 不为新增 lint、超长文件或跨 feature 依赖增加 baseline；存量逐批减少。
5. **每批整改独立可验证、可回滚。** 一个提交只解决一类问题，避免安全修复与大组件重写混合。

## 2. 当前基线（2026-09-20）

| 项目 | 当前结果 | 说明 |
| --- | --- | --- |
| TypeScript | 通过 | 根 `tsc --noEmit` 无类型错误 |
| 已有自动化测试 | 4 个文件、16 项通过 | 仅覆盖海报相关纯函数和 API 契约片段 |
| ESLint | 9 errors、760 warnings | 包含 `any` 617、`max-lines` 58 |
| 导入边界 | 4 条新增违规 | `assistant → canvas` 1 条；`headline-poster → workshop` 3 条 |
| 文件行数门禁 | 2 条新增违规 | `HeadlinePosterStudio.tsx`、`DotGrid.tsx` |
| 未使用代码门禁 | 1 条新增违规 | 部署脚本中未使用导入 |
| 项目环境 | 不一致 | 本机 Node 24 / pnpm 11；仓库声明 Node 20–22 / pnpm 10.13.1 |
| PR CI | 基础检查 | 未包含测试、边界、行数、未使用检查、构建与桌面校验 |

> 审计基于当时的当前工作区，其中包含尚未提交的业务改动。合并前必须以目标分支上的干净环境重新执行本计划中的全部检查。

## 3. 目标架构与依赖规则

```text
apps/web          → contracts, domain
apps/api          → contracts, domain, server-kit, prisma
apps/desktop      → 打包、原生系统能力、sidecar 生命周期
packages/domain   → 浏览器安全的纯业务规则、类型、转换函数
packages/contracts→ Zod DTO、API 契约；不包含业务实现
packages/server-kit → Prisma、存储、外部 gateway、爬虫、文件/图像处理
packages/prisma   → schema、migrations、生成配置
tools             → 校验、构建、运维脚本
```

强制规则：

- `apps/web` 不得依赖 `@beike/server-kit`、Node 内置模块或 Prisma。
- `packages/domain` 不得读取 `process`、`fetch`、`localStorage`；通过运行时注入提供环境能力。
- `apps/api/src/routes` 只负责 HTTP 解析、鉴权、输入输出映射；外部 HTTP 移入 `gateways/`，数据库经 `repositories/`，可复用业务流程经 `services/`。
- feature 之间不得直接导入。跨 feature 的任务提交、模型查询、通用弹窗、工作区命令必须下沉到 `shared` 或 API/domain 层。
- 不通过把新违规加入 `import-boundary-baseline.json` 或 `max-lines-baseline.json` 来“修复”门禁。

## 4. 整改范围与优先级

### P0：立即止血（阻断发布）

#### P0-1 轮换并消除 CI 凭据回退值

**问题**：Windows 打包工作流存在第三方服务凭据的默认回退值。它们会进入 Git 历史，并可能在没有配置 Secrets 时被构建使用。

**整改动作**：

1. 在各供应商控制台立即轮换所有相关密钥；旧密钥必须失效。
2. 删除 [`.github/workflows/windows-build.yml`](../../.github/workflows/windows-build.yml) 中所有密钥默认值。
3. 将生产凭据仅放在 GitHub Environment 的 Secrets 中；生产构建 job 显式指定对应 environment。
4. 工作流在必填 Secret 缺失时失败，禁止使用演示或生产凭据兜底。
5. 对仓库当前分支和历史执行凭据扫描；必要时按组织安全流程清理历史。
6. 在 CI 和本地 pre-commit 增加 secret scan，并将 `.env`、`.env.production` 保持忽略。

**验收标准**：

- `git grep`、secret scan 和 PR 检查均不再命中有效凭据。
- 无 Secret 的 Windows 发布任务明确失败，不产生安装包。
- 密钥轮换记录可由管理员追溯，但不记录在仓库中。

#### P0-2 固化运行时与包管理器

**问题**：仓库声明 Node 20–22 与 pnpm 10.13.1，实际本机为 Node 24 / pnpm 11，导致 pnpm 检查尝试变更依赖目录并在非交互环境中中断。

**整改动作**：

1. 统一 Node 22 LTS 和 pnpm 10.13.1；同步根 `engines`、README、CI 与 Windows 构建版本。
2. 添加 `.nvmrc` 或 Volta 配置，并在 README 的首次安装步骤中写明 `corepack enable` 与 `corepack prepare pnpm@10.13.1 --activate`。
3. 将 pnpm 配置迁移到 pnpm 当前支持的位置，消除 `package.json` 中已被忽略的配置警告。
4. CI 固定运行时，并始终使用 `pnpm install --frozen-lockfile`。
5. 不提交机器生成的 `node_modules`、本地端口文件、桌面 sidecar 或 `.env.production`。

**验收标准**：

- macOS、Windows、CI 运行 `pnpm --version` 和 `node --version` 均满足声明。
- 在干净目录执行 `pnpm install --frozen-lockfile && pnpm run check` 无交互提示、无隐式写锁文件。

### P1：质量与结构治理（本迭代完成）

#### P1-1 恢复质量门禁全绿

当前必须处理的新增问题：

| 类别 | 数量 | 整改要求 |
| --- | ---: | --- |
| ESLint error | 9 | 全部修复，不允许以 disable 或 baseline 豁免 |
| 跨 feature 依赖 | 4 | 移除直接导入；下沉为共享能力 |
| 新增超长文件 | 2 | 拆分后降到 400 行以下，或先完成已审批的独立拆分计划 |
| 未使用绑定 | 1 | 删除未使用导入或补齐实际使用 |
| 路由层直接 `fetch` | 5 | 删除临时调试调用，或迁移到受控 gateway / telemetry service |

重点文件：

- `apps/web/src/features/headline-poster/HeadlinePosterStudio.tsx`
- `apps/web/src/shared/media/DotGrid.tsx`
- `apps/api/src/routes/catalog/assets/deconstruct.ts`
- `apps/api/src/routes/generate/image/poll.ts`
- `tools/scripts/deploy/export-official-seeds.mjs`

**验收标准**：

```bash
pnpm run lint
pnpm run lint:boundaries
pnpm run lint:max-lines
pnpm run lint:unused
```

均通过，且两个 baseline 文件的条目数不得增加。

#### P1-2 拆除跨 feature 耦合

**现状**：

- `headline-poster` 直接使用 `workshop/batch` 的任务提交、模型加载和预览组件。
- `assistant` 直接读取 `canvas` feature store。

**目标目录职责**：

```text
apps/web/src/
├── shared/
│   ├── api/                 # 与 API 对应的通用客户端
│   ├── generation/          # 通用任务提交、轮询、任务状态类型
│   ├── models/              # 已配置模型查询与显示转换
│   ├── modals/lightbox/     # 与业务 feature 无关的预览能力
│   └── workspace/           # 跨 feature 的选择、命令、上下文接口
├── features/
│   ├── workshop/            # 只保留工作台编排和界面
│   ├── headline-poster/     # 海报导入、文案、生产编排和界面
│   ├── assistant/           # 对 workspace 接口编程，不读取 canvas 内部 store
│   └── canvas/              # 只暴露公共 workspace capability
```

**实施顺序**：

1. 为任务提交与轮询定义共享的 request/result 类型，优先复用 `@beike/contracts`。
2. 从 `workshop/batch` 提取不含工作台状态的 `generationClient`、`configuredModelClient`。
3. 将纯预览弹窗迁移到 `shared/modals/lightbox`；保留工作台专属 UI 在 workshop 内。
4. 定义 `workspace` 公共命令或 selector，替换 assistant 对 canvas Zustand store 的直接访问。
5. 删除所有 feature-to-feature import，并收紧边界脚本，避免新增例外。

#### P1-3 大组件分层拆分

优先级按风险和变更频率排序：

1. `apps/web/src/features/headline-poster/HeadlinePosterStudio.tsx`
2. `apps/web/src/features/canvas/components/InfiniteCanvasEditor.tsx`
3. `apps/web/src/shared/modals/lightbox/SmartEditModal.tsx`
4. `apps/web/src/features/assets/components/AssetCenter.tsx`
5. `apps/web/src/features/workshop/batch/hooks/useBatchWorkshopRunner.ts`

每个大组件按以下层次拆分，避免只做机械性文件切分：

```text
feature/
├── api/             # API 调用、DTO 映射
├── model/           # feature 类型、状态机、纯计算
├── hooks/           # 副作用、表单与界面协调
├── components/      # 无业务副作用的展示组件
├── utils/           # 纯函数，必须有单元测试
└── FeaturePage.tsx  # 组装层；不直接承载复杂网络和文件处理
```

约束：

- 新增文件目标不超过 400 行；超过时在代码评审中说明原因。
- 页面组件不得直接调用 `fetch`；网络调用收敛在 `api/`。
- 异步流程必须有显式状态：`idle / running / success / error / cancelled`，并统一处理取消、重试和清理。
- 纯导入、解析、格式化、状态转换函数必须从组件中抽出并单测。

#### P1-4 类型、日志与 API 标准化

**类型**：

- 从外部 API、数据库 JSON、`catch` 块和请求 body 开始替换 `any`，使用 `unknown + Zod schema` 或显式 DTO。
- `catch (error: any)` 改为 `catch (error: unknown)`，统一由 `formatUserError` / `AppError` 转换。
- `@typescript-eslint/no-explicit-any` 分阶段从 `warn` 提升为 `error`：先限制新增，再逐模块清存量。

**日志与调试**：

- 删除所有写死 localhost 地址、会话 ID 的 `#region agent log` 调用。
- 实现最小 `telemetry` 接口：开发环境可输出结构化日志，生产环境不得静默向未知地址发送数据。
- 每个 API 请求生成或透传 `x-request-id`；生成、视频、助手任务的日志均携带 requestId、taskId、provider、耗时和结果。
- 不记录用户访问令牌、第三方密钥、完整提示词中的敏感信息或原始个人数据。

**HTTP 与安全**：

- 生产 CORS 改为精确标准化 Origin 比较（协议、主机、端口），不要仅按 hostname 放行。
- 所有管理、迁移、存储测试操作采用显式 admin authorization；为危险路由增加审计日志。
- 统一 API 错误格式、Zod 请求校验、幂等键和限制请求体大小。

### P2：测试、发布与可观测性（后续两个迭代）

#### P2-1 建立测试金字塔

| 层级 | 工具建议 | 覆盖范围 | 最低门槛 |
| --- | --- | --- | --- |
| 单元测试 | Vitest | domain、contracts、解析、状态机、提示词构造 | 新增纯函数必须覆盖正常、边界、错误输入 |
| API 集成 | Vitest + `app.request()` | 鉴权、输入校验、任务提交、轮询、错误映射 | 每个 API mount 至少 1 个成功与 1 个失败路径 |
| UI 组件 | Vitest + Testing Library | 导入、状态、禁用态、错误提示 | 高变更交互组件覆盖关键状态 |
| 端到端 | Playwright | 生成、资产、助手、海报、桌面关键路径 | 主发布版本至少跑 smoke suite |
| 桌面 | Cargo test/check | 凭据存储、sidecar 生命周期、权限 | PR 运行 check；发布前运行目标平台构建 |

第一阶段不强制总覆盖率百分比，先以关键路径覆盖和新增代码不降低质量为准。测试稳定后再设定分模块覆盖率门槛。

#### P2-2 强化 PR CI

PR 必跑：

```bash
pnpm install --frozen-lockfile
pnpm run check:root-layout
pnpm run check:model-catalog
pnpm run typecheck
pnpm run lint
pnpm run lint:unused
pnpm run lint:max-lines
pnpm run lint:boundaries
pnpm run test
pnpm run build:ui
pnpm run check:desktop
```

发布流水线额外要求：

```bash
pnpm run lint:gate
pnpm run tauri:build
pnpm --filter @beike/prisma exec prisma migrate deploy --schema schema.prisma
```

说明：`test`、数据库迁移脚本和依赖扫描命令应在引入相应工具后加入根 `package.json`；在未落地前不得伪造通过状态。

#### P2-3 规范数据库与任务运行

1. 开发环境可使用 `prisma db push` 进行快速实验；生产环境仅允许审核后的 migration 与 `migrate deploy`。
2. 新增 `db:migrate`、`db:deploy`、`db:backup`、`db:restore:verify` 脚本及运维说明。
3. 生成、视频和助手任务采用持久化状态机，状态至少包含：`queued`、`running`、`succeeded`、`failed`、`cancelled`、`expired`。
4. 所有提交 API 接收幂等键；轮询和回调可重复执行；失败原因归一化并可人工重试。
5. 每次发布前自动执行备份；每季度做一次恢复演练并记录结果。

## 5. 分批实施计划

### 批次 A：安全与环境基线

**范围**：P0-1、P0-2。  
**禁止混入**：功能需求、UI 调整、大组件拆分。  
**交付物**：密钥轮换证明（仓库外）、无回退凭据工作流、版本固定文件、更新的 README、secret scan。  
**完成条件**：干净环境下安装和 `pnpm run check` 可重复通过。

### 批次 B：门禁恢复与边界清理

**范围**：P1-1、P1-2 的最小共享提取。  
**交付物**：零新增质量违规、无跨 feature import、移除调试 `fetch`、CI 扩展。  
**完成条件**：所有 PR 门禁绿；baseline 数量不增加。

### 批次 C：海报与画布模块化

**范围**：优先拆 `HeadlinePosterStudio` 与 `InfiniteCanvasEditor`。  
**交付物**：API / model / hooks / components 分层、纯函数测试、端到端 smoke。  
**完成条件**：对应 feature 的核心文件降到可审查规模，业务行为与现有结果一致。

### 批次 D：任务平台与发布能力

**范围**：P1-4、P2-3。  
**交付物**：统一 telemetry、任务状态机、迁移发布流程、备份恢复验证。  
**完成条件**：任务可观察、可取消、可恢复；生产发布无 `db:push`。

## 6. 代码评审检查清单

每个 PR 必须确认：

- [ ] 未提交密钥、token、`.env`、数据库、构建产物或个人路径。
- [ ] 没有新增跨 feature 依赖；共享代码放在正确层级。
- [ ] Web 没有导入 server-kit / Prisma / Node API。
- [ ] API route 没有直接外部 `fetch` 或直接 Prisma 访问。
- [ ] 没有新增 `any`、`@ts-ignore`、临时 localhost telemetry 或无主错误吞掉。
- [ ] 新增文件低于 400 行；超出时已拆分或有审查记录。
- [ ] 新增逻辑有相应单测，关键交互有集成或 e2e 覆盖。
- [ ] `pnpm run check`、测试、构建和相关桌面检查在目标环境通过。
- [ ] 数据库变更包含 migration、回滚/兼容性说明和发布顺序。

## 7. 度量与退出条件

整改不是一次性重构，按以下指标持续追踪：

| 指标 | 当前 | 批次 B 目标 | 批次 D 目标 |
| --- | ---: | ---: | ---: |
| Lint errors | 9 | 0 | 0 |
| 新增边界违规 | 4 | 0 | 0 |
| 新增超长文件违规 | 2 | 0 | 0 |
| 新增未使用绑定 | 1 | 0 | 0 |
| `any` 存量 | 617 | 不增加且优先模块下降 | 逐步降至可维护阈值，规则升级为 error |
| 自动化测试文件 | 4 | 覆盖 API / domain 首批关键路径 | 覆盖所有发布关键流程 |
| PR CI 覆盖 | 基础检查 | 完整质量门禁 + test + UI build | 加入桌面与发布前验证 |

当 P0、批次 B 完成后，项目可以进入“受控开发”状态；当批次 C、D 完成并连续多个发布周期保持门禁全绿后，才视为达到“工程化稳定发布”状态。

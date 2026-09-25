# 代码健康

本页记录浏览器产品的持续治理状态。桌面端移除属于历史整改；2026-09-24 本轮工作区与工坊目录整改见 [核查报告](repository-architecture-audit-2026-09-24.md)。门禁通过不等于历史告警清零，以下技术债仍需继续治理。

## 已经处理

- 删除 `apps/desktop`、Tauri 脚本、Windows 安装包流水线和浏览器里的桌面壳分支。下载改为浏览器保存，凭证写入 credential 接口，不再调用桌面环境文件接口。
- 删除没有引用的模块、重复的 `JellyRadio.jsx`，以及未接入脚本的 `jsrepo`。
- 关键词审核的数据库访问改走 `apps/api/src/repositories/keywordReview.ts`。
- `shared/` 不再引用 `features/`。画布摘要由画布模块注册。
- 批准模型清单拆到 `packages/domain/src/modelCatalog/`，`modelCatalog.ts` 只做聚合。
- 分镜组装的后半段拆到 `promptAssemblerFinish.ts`。商品采集从路由挪到 `services/collect/collectProduct.ts`。
- 助手事件类型不再和 `assistant/types.ts` 互相引用。

## 仍然偏大的文件

这些文件还在 `tools/configs/max-lines-baseline.json` 里，或者物理行数超过 400。拆的时候保持对外函数签名不变，拆完从 baseline 删掉对应条目。baseline 只允许变小。

优先顺序：

1. `apps/web/src/features/workshop/hooks/useBatchWorkshopRunner.ts`：阶段实现已分到 model 的五个职责目录，React 工作区快照连接也已抽离，但主 hook 仍承担较多状态与编排。后续按明确状态转换拆分，避免仅搬动行数或在一次迁移中同时重写所有行为。
2. `apps/web/src/shared/modals/ImageLightboxModal.tsx` 和 `shared/modals/lightbox/SmartEditModal.tsx`：预览、工具栏和参数状态可以下沉成独立组件。
3. `CanvasMultiAngleModal.tsx` 与 `LightboxMultiAngleModal.tsx`：预设和参数类型已经接近，组件本身仍然各写一套。
4. `usePosterProduction.ts`、`useStyleExtractWorkflow.ts`：按导入、生成、导出拆出去。
5. `AssetCenter.tsx`、`UsageTab.tsx`、`PromptActionBar.tsx` 等其余 baseline 条目。

## 分层

路由和 service 仍然有直接查询数据库的历史代码。新增代码走 `repositories/`，不要从 service 或 route import `repositories/db.ts`。

`packages/domain/src/prompt-engine/assembler.ts` 和 `guards.ts` 仍互相引用。`apps/web/src/store/types.ts` 与 `brandKitSlice.ts`、`assistantSkillSlice.ts` 也是类型层面的环。解开时把被两边使用的类型挪到第三个文件。

## 类型与测试

`packages/contracts` 和 `packages/domain` 的显式 `any` 很少。历史 `any` 集中在 `apps/web` 和 `apps/api`，尤其是提示词组装、资产编辑和助手流式响应。ESLint 对 `no-explicit-any` 仍是警告。

测试覆盖关键词审核、大字报、网关凭证、采集和生成策略。工坊已补充分析预检、生成就绪、任务恢复、局部重试、快照与失效规则、交付等单元测试，以及模拟浏览器的入口、资源与流程回归；这不等于主 hook 的全部状态组合或真实厂商调用均已覆盖。助手复杂回合、跨设备冲突、服务重启后的持久编排仍需专项验证。

本轮发现旧入口漏跑 7 个已有测试文件，已改为递归发现并加入发现器、边界规则和 workspace 规则测试。浏览器 QA 是显式独立脚本，不混入单元测试入口。

## 本地产物

**被 Git 忽略不代表可删除。** 旧版说明把数据库、备份和 `.local/` 一并列为可删产物，已纠正。

- 可重建：`apps/web/dist`、根 `dist`；确认没有运行任务依赖后，可用既有 clean 脚本清理。`node_modules` 可通过锁文件重装，但无需为了整理源码顺手删除。
- 受保护：`.local/` 可能含部署私钥、操作回执和数据库备份；`.env*` 含配置；`packages/prisma/dev.db` 及其他 SQLite、WAL/SHM、`packages/prisma/backups/` 是真实数据，不自动删除。
- 素材/上传/本地存储、种子与迁移、ops 脚本、公开资源可能有动态或外部入口，静态 import 少不是删除依据。
- 只读盘点输出 `.local/source-audit.json`；候选必须人工确认。不得把 `rm -rf .local` 或数据库清理加入源码整理流程。

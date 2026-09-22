# 内部架构

- [`packages.md`](packages.md) — `@beike/domain` / `server-kit` / `contracts` 归属
- [`layout.md`](layout.md) — apps/web 与 apps/api 目录分层、store / shared / repositories 归属
- [`engineering-remediation-plan.md`](engineering-remediation-plan.md) — 工程化整改目标、优先级、分批计划与验收标准
- [`original-workshop-flow-redesign.md`](original-workshop-flow-redesign.md) — 原创种草工坊四阶段执行流程、提示词资产闭环、状态机、迁移与验收方案
- [`source-cleanup-audit-2026-09-20.md`](source-cleanup-audit-2026-09-20.md) — 源码规模、孤立代码清理清单与逐批验收命令
- [`non-source-cleanup-audit-2026-09-21.md`](non-source-cleanup-audit-2026-09-21.md) — Markdown、构建产物、重复资产与本地快照清理清单
- [`skills/meituan-xhs-travel-copy/`](skills/meituan-xhs-travel-copy/SKILL.md) — 小红书旅行种草文案技能原稿

云服务器部署步骤见仓库根目录 [`deploy/README.md`](../../deploy/README.md)。官方 8 段式架构在 [`packages/domain/src/masterRecipes.ts`](../../packages/domain/src/masterRecipes.ts)，提示词资产种子在 [`packages/domain/src/seeds/`](../../packages/domain/src/seeds/)。

工程约定见 [`../AGENTS.md`](../AGENTS.md)。

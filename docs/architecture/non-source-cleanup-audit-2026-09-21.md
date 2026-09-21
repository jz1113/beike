# 非源码文件清理审计与执行清单（2026-09-21）

> 审计性质：只读。本清单覆盖 Markdown、构建输出、重复静态资产、本地缓存、数据库快照与部署操作资料；不删除任何文件。当前工作树包含大量未提交改动，执行删除前先确认目标路径不承载尚未提交的用户工作。

## 结论摘要

- 仓库中共有 **99 个 Markdown**：84 个厂商接口文档、5 个架构文档、6 个部署/说明文档及其他入口文档。
- **84 个厂商接口 Markdown 不可删除**：`packages/domain/src/modelCatalog.ts` 在运行时模型目录中保存了 `aggregator/` 文档路径，官方接口索引也链接 `vendor/` 文档。
- 有 **4 类高置信度可清理文件**，可释放约 **160.7 MB**：Web 构建输出、重复模型 SVG、工具缓存、Finder 元数据。
- 数据库备份和服务器操作资料不属于程序运行必需文件，但可能是恢复或运维凭据；它们必须在确认备份留存策略和服务器归属后处理。

## 执行前规则

1. 删除前运行 `git status --short -- <path>`；若路径有用户尚未提交的变更，先保留。
2. 对忽略文件优先使用项目已有清理脚本；不要删除 `dev.db`、`.local` 或 `apps/desktop/binaries/.gitkeep`。
3. 数据库快照先确认已有一份可恢复的外部备份，再删本地副本。
4. 删除文档必须同时修复其上级 README 的链接，避免留下失效导航。

## 第一批：高置信度可清理

### A. Web 构建产物（约 160 MB）

**目标目录：** `apps/web/dist/`

- Git 未跟踪，且被 `.gitignore` 明确忽略。
- 内容是 `public/` 静态媒体和 `src/assets/` 的 Vite 构建副本；每次 `pnpm run build:ui` 都会重新生成。
- 当前目录约 160 MB，是最大的可安全回收项。

执行：

```bash
pnpm run clean
```

注意：该脚本也会移除 `apps/desktop/target` 与根 `dist`；如果只想删 Web 构建目录，使用经过路径确认的单目录删除操作。

### B. 重复的模型 SVG 目录（35 文件、约 152 KB）

**删除目录：** `apps/web/src/assets/icons/models/`

**保留目录：** `apps/web/src/assets/model-logos/`

证据：

- 两个目录的 35 个 SVG 文件逐文件内容完全相同。
- 运行时组件 `apps/web/src/shared/ui/ModelIcons.tsx` 使用 `import.meta.glob('../../assets/model-logos/*.svg')` 加载保留目录。
- 在 TypeScript、TSX、JavaScript、CSS 与 HTML 中，没有任何对 `assets/icons/models` 或 `/icons/models` 的消费者。

联动：删除后需要更新或删除 `apps/web/src/assets/icons/README.md` 中关于 `models/` 子目录的说明；`icons/ui/` 下的功能图标仍在使用，不能删除。

### C. 工具缓存（约 504 KB）

**删除目录：** `tools/configs/node_modules/`

- 目录中仅有 `node_modules/.cache/tsconfig.tsbuildinfo`。
- 未被 Git 跟踪，受全局 `node_modules/` 忽略规则保护。
- 属于可再生 TypeScript 缓存。

### D. macOS Finder 元数据（14 文件）

删除以下全部 `.DS_Store`：

```text
.DS_Store
.agents/skills/.DS_Store
apps/desktop/.DS_Store
apps/web/.DS_Store
deploy/.DS_Store
docs/.DS_Store
docs/architecture/.DS_Store
docs/architecture/skills/.DS_Store
docs/vendors/.DS_Store
docs/vendors/官方接口/.DS_Store
docs/vendors/官方接口/aggregator/.DS_Store
docs/vendors/官方接口/vendor/.DS_Store
tools/.DS_Store
tools/scripts/.DS_Store
```

它们均被 `.gitignore` 忽略，属于操作系统目录展示缓存，不影响程序运行。

## 第二批：确认后再删的非源码文件

### E. 本地数据库备份

| 路径 | 当前大小 | 状态 | 删除前确认 |
| --- | ---: | --- | --- |
| `packages/prisma/backups/azhuo-2026-09-20T16-08-36-258Z.db*` | 约 3.7 MB | 未跟踪，`pnpm run db:backup` 生成 | 是否已有可恢复的最新备份 |
| `packages/prisma/database-backups/before-20260913_01_desktop_baseline-*.db` | 约 516 KB | 未跟踪 | 是否仍需回滚到 2026-09-13 前基线 |
| `packages/prisma/database-backups/before-20260913_01_desktop_baseline-*.db.groups.json` | 约 262 KB | Git 已跟踪，但没有指定消费者 | 是否需要保留迁移前资产分组审计记录 |
| `.local/deploy-backup/azhuo.db` | 约 22 MB | 本地忽略的部署备份 | 已上线服务器或其它安全位置是否存在可恢复副本 |

说明：应用启动时的自动备份由 `packages/server-kit/src/database/migrations.ts` 生成到**活动数据库文件旁的** `database-backups/` 目录；它不读取仓库中这些具体历史文件。尽管如此，这些文件都可能是唯一恢复点，不能因“没有代码引用”直接删除。

**明确保留：** `packages/prisma/dev.db` 是默认 `DATABASE_URL=file:./dev.db` 使用的本地开发数据库，不能当作垃圾文件删除。`apps/desktop/binaries/.gitkeep` 是空目录占位文件，也必须保留。

### F. 服务器控制台操作记录

**候选文件：** `deploy/yeziidc-console.md`（50 行）

它不被程序读取，仅由 `deploy/README.md` 链接；内容写死了特定云服务器实例、公网 IP、root 密码交接步骤和安全组操作。

处理选择：

1. **该服务器已经废弃：** 删除本文件，并从 `deploy/README.md` 移除指向它的链接以及写死 IP 的 rsync/访问示例。
2. **服务器仍是生产环境：** 不删；将内容改为不含实例 ID、固定公网 IP 和密码传递措辞的通用部署 runbook，主机信息保留在仓库外的受控运维系统。

### G. 独立美团旅行文案技能原稿

**候选文件：** `docs/architecture/skills/meituan-xhs-travel-copy/SKILL.md`（109 行）

- 该 Markdown 没有被产品运行时加载；应用内置技能内容写在 `packages/domain/src/assistant/skills/builtin.ts`。
- Web 中的 `migrateTravelCopySkill.ts` 只对用户已保存技能的文本做历史迁移，不读取此文件。
- 文档内容包含具体美团品牌文案与“188 元券包”植入，属于产品功能之外的营销写作原稿。

若产品不再需要把这份原稿作为团队参考或 Agent 能力资产，可以删除它，并从 `docs/architecture/README.md` 移除链接。若仍需该营销能力，则应移到专门的受控技能仓库，而不是作为应用架构文档保存。

### H. 图标目录说明文档

**候选文件：** `apps/web/src/assets/icons/README.md`（75 行）

它不是运行时文件，但目前把 `icons/models/` 描述为“统一模型 Logo 目录”；实际模型 Logo 已由 `model-logos/` 消费，`icons/models/` 是重复副本。

处理方式：删除重复 SVG 后，将本 README 缩减为 `icons/ui/` 的说明，或删除 README 并把必要说明并入前端资产规范。不要因为 README 过时而删除仍被 UI 使用的 `icons/ui/` SVG。

## 文档清单：保留、更新与删除时机

| 文件/目录 | 判定 | 原因与动作 |
| --- | --- | --- |
| `docs/vendors/官方接口/`（84 个 Markdown） | **保留** | 聚合文档路径由模型目录引用，厂商文档由官方索引链接。 |
| `docs/architecture/packages.md` | **保留** | 当前包边界的简明约定。 |
| `docs/architecture/engineering-remediation-plan.md` | **保留但更新** | 仍是“待执行”工程计划；其中质量统计已滞后于当前审计，应更新数字，不应直接删除。 |
| `docs/architecture/source-cleanup-audit-2026-09-20.md` | **清理完成后删除或归档** | 当前清理任务的执行清单；任务结束前保留，完成后不要让短期审计永久堆积。 |
| `docs/architecture/skills/meituan-xhs-travel-copy/SKILL.md` | **确认后删除** | 不被程序加载，但是否保留营销能力是产品决策。 |
| `deploy/yeziidc-console.md` | **确认后删除或脱敏改写** | 含具体基础设施信息，且仅作手工部署指导。 |
| `README.md`、`docs/README.md`、`docs/AGENTS.md`、`deploy/README.md` | **保留** | 分别承担项目入口、文档索引、工程规则与部署说明。 |
| `tools/scripts/depth/README.md`、`tools/scripts/quality/README.md` | **保留** | 对应可执行工具目录的操作说明。 |

当前 `docs/architecture/README.md` 仍链接一个不存在的 `canvas-production.md`。这是**失效索引项**而非待删文件：需要在删除批次中修正该链接或恢复相应文档。

## 明确保留的非源码资产

- `apps/web/public/`：主页灵感卡、视频与品牌图片均被前端硬编码 URL 引用；即使 `favicon.ico` 没有文本引用，也会被浏览器按约定加载。
- `apps/web/src/assets/model-logos/`：由 `ModelIcons.tsx` 的构建期 glob 直接加载。
- `apps/desktop/icons/`：Tauri 打包图标。
- `packages/domain/src/seeds/`：启动时导入的官方提示词与风格种子。
- `deploy/beike.service`、`deploy/nginx.conf.example`、`deploy/env.production.example`、`deploy/bootstrap-ubuntu.sh`：部署脚本/README 直接使用。

## 推荐执行顺序与验收

1. 清理 A、C、D；确认 `git status --short` 不再出现构建/缓存/系统元数据。
2. 清理 B，并运行 `pnpm run typecheck && pnpm run build:ui`，确认模型 Logo 正常显示。
3. 对 E 先做外部备份确认，再删除不再需要的快照。
4. 针对 F、G、H 做产品/运维确认后，删除或脱敏，并同步更新上级 README 链接。
5. 最后清理完成时，将短期审计文档归档或删除，保留长期架构约定与部署 runbook。

建议用于查看候选状态：

```bash
git status --short -- apps/web/dist apps/web/src/assets/icons/models tools/configs/node_modules packages/prisma/backups packages/prisma/database-backups
git check-ignore -v apps/web/dist tools/configs/node_modules
pnpm run typecheck
pnpm run build:ui
```

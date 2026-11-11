# 贝壳云图工程约定

## 单项目结构

这是一个单 package 的全栈应用，不使用 monorepo、workspace 协议或子目录 package.json。Node 依赖只声明在根 package.json，根 pnpm-lock.yaml 锁定版本；Go 依赖在 go.mod / go.sum。Node.js 22、pnpm 10.13.1、Go 1.26。

- `src/client`：浏览器界面，HTML 入口为 `index.html`，按 `app / features / shared / store / assets / styles / types` 分工。
- `src/backend`：对外 API、数据库迁移和官方种子。入口在 `cmd/api`，接口按领域放在 `internal`，迁移在 `internal/platform/database/migrate`。`pnpm dev`、`pnpm start` 与 `pnpm db:migrate` 都走这里。需要 Go 1.26。
- `src/shared/contracts`：前后端接口、OpenAPI 与 Zod 契约，不承载业务编排。
- `src/shared/domain`：浏览器安全的业务规则、模型适配、类型与种子。
- 当前 schema 与迁移统一在 Go 后端，不保留第二套历史 SQL。根 `database` 仅兼容已有本地库和 `database-backups`，可不存在；数据保持原位，整目录不提交、不按垃圾文件清理。维护规则见 `docs/database.md`。
- `src/client/public`：无需编译的前端公开资源；`tools/configs`：环境模板和 Vite 等工程配置；`tools/scripts`：工程脚本；`tools/launchers`：Windows PowerShell 启动器实现；`tools/deploy`：部署模板；`tools/build/ui`：自动生成的前端产物。
- 根目录保留 `启动贝壳云图.bat` 和 `启动贝壳云图.command`，分别作为 Windows 与 macOS 双击入口。Windows 入口调用 `tools/launchers` 下的 PowerShell 实现；macOS 实现直接放在根目录，保留可执行权限，不在其他目录保留副本。环境模板位于 `tools/configs/env.example`，本机 `.env` 保留在根目录。

## 依赖与分类

- 别名使用 `@client/*`、`@server/*`、`@shared/*`，不再使用 `@beike/*` 包名。
- client 与 shared 禁止依赖 backend、Node 原生模块、Prisma、sharp、AWS SDK。
- `src/backend` 不引用 client。shared 不引用 client 或 backend；domain 与 contracts 保持各自独立。
- 对外 HTTP、迁移和官方种子都在 `src/backend`。新接口写到 Go。
- client/shared 不反向引用 features。单个 feature 按实际需要设 `components / hooks / api / model`，不要机械创建空目录。
- feature 的 model 不引用功能 UI/hooks/views；跨功能复用优先下沉最小共享能力，禁止扩充边界豁免。
- 组件分类目录直接存放实现文件，不用仅向上转发的 index.ts 代替实际分类。
- 功能目录优先使用一个常用英文词：画布 `canvas`、图文 `workshop`、带货 `sales`、助手 `assistant`；同一功能在前后端和共享层保持同名。模型网关使用 `gateway`。源码改名时保留已有接口地址、网址参数和持久化标识的兼容性。

## 验证与数据保护

- 正式测试保留在仓库内：与源码同目录的 `*.test.ts` 和 Go 的 `*_test.go`。不保留 QA fixture、截图、一次性报告和临时 Agent 计划；这类临时文件放项目外。`pnpm check` 包含静态检查、单元测试和构建。
- 变更目录时同步启动、构建、部署、检查、文档和路径型配置。
- 文件有效代码超过 800 行提醒、超过 1000 行门禁失败；按职责内聚拆分，不为凑行数硬拆文件。
- 防止文件散乱：只被一个文件使用的小组件、局部 hook、常量和类型，优先写在使用方文件里；新增功能优先扩展已有的同职责文件。被多处复用、需要独立测试的纯逻辑、职责或状态生命周期独立、需要明确依赖方向、或所在文件将超过 800 行时，可以按职责拆出新文件；不必等到行数上限才拆分。不新建只做转发（`export … from`）的文件，不把多段逻辑压成超长单行。
- 未使用、文件长度、依赖边界基线只允许收紧；目录移动只更新路径。
- 不删除用户未提交修改或以“未被引用”为由批量删文件。
- 功能界面被替代后，核对真实产品入口并清理废弃界面、专属样式和只验证旧界面的测试；不以测试引用作为继续保留旧实现的依据。`pnpm check:reachability` 要求业务 UI/hooks 及共享运行适配器能从应用入口到达，测试辅助使用 `*.test-support.ts` 且不能进入产品依赖。历史数据兼容单独保留，模型协议在 Go 实际调用链上验证，不保留仅供测试的第二套请求组装器。
- 保护 `.env*`、`.local/`、数据库/WAL/SHM、备份和上传素材；被忽略不代表可以删除。
- 具体目录规则见 `docs/layout.md`；生产运行说明见 `docs/deployment.md`。

## 文档维护

- 所有文档直接放在 `docs` 根目录，不再创建分类子文件夹，文件名须说明用途。
- 架构以 `docs/layout.md` 为准；部署说明在 `docs/deployment.md`，执行模板放 `tools/deploy`。
- 只保留当前产品规则、模型接入与运维说明，不保留过期计划和一次性报告。
- 修改路径与命令时同步更新文档链接、代码引用和检查配置；不将历史报告当作新的架构要求。

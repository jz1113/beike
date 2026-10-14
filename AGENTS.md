# 贝壳云图工程约定

## 单项目结构

这是一个单 package 的全栈应用，不使用 monorepo、workspace 协议或子目录 package.json。Node 依赖只声明在根 package.json，根 pnpm-lock.yaml 锁定版本；Go 依赖在 go.mod / go.sum。Node.js 22、pnpm 10.13.1、Go 1.26。

- `src/client`：浏览器界面，按 `app / features / shared / store / assets / styles / types` 分工。
- `src/backend`：对外 API、数据库迁移和官方种子。入口在 `cmd/api`，接口按领域放在 `internal`，迁移在 `internal/platform/database/migrate`。`pnpm dev`、`pnpm start` 与 `pnpm db:migrate` 都走这里。需要 Go 1.26。
- `src/shared/contracts`：前后端接口与 Zod 契约，不承载业务编排。
- `src/shared/domain`：浏览器安全的业务规则、模型适配、类型与种子。
- `database`：schema、迁移和本地开发库；数据库和备份不提交。
- `src/client/public`：无需编译的前端公开资源；`tools`：工程配置、脚本、启动入口和部署模板；`tools/build/ui`：自动生成的前端产物。

## 依赖与分类

- 别名使用 `@client/*`、`@server/*`、`@shared/*`，不再使用 `@beike/*` 包名。
- client 与 shared 禁止依赖 backend、Node 原生模块、Prisma、sharp、AWS SDK。
- `src/backend` 不引用 client。shared 不引用 client 或 backend；domain 与 contracts 保持各自独立。
- 对外 HTTP、迁移和官方种子都在 `src/backend`。新接口写到 Go。
- client/shared 不反向引用 features。单个 feature 按实际需要设 `components / hooks / api / model`，不要机械创建空目录。
- 工坊 model 不引用 UI/hooks；跨功能复用优先下沉最小共享能力，禁止扩充边界豁免。

## 验证与数据保护

- 正式测试保留在仓库内：与源码同目录的 `*.test.ts`、根目录 `tests/api` 的接口行为测试。不保留 QA fixture、截图、一次性报告和临时 Agent 计划；这类临时文件放项目外。`pnpm check` 包含静态检查、单元测试和构建。
- 变更目录时同步启动、构建、部署、检查、文档和路径型配置。
- 未使用、文件长度、依赖边界基线只允许收紧；目录移动只更新路径。
- 不删除用户未提交修改或以“未被引用”为由批量删文件。
- 保护 `.env*`、`.local/`、数据库/WAL/SHM、备份和上传素材；被忽略不代表可以删除。
- 具体目录规则见 `docs/layout.md`；生产运行说明见 `docs/deployment.md`。

## 文档维护

- 所有文档直接放在 `docs` 根目录，不再创建分类子文件夹，文件名须说明用途。
- 架构以 `docs/layout.md` 为准；部署说明在 `docs/deployment.md`，执行模板放 `tools/deploy`。
- 只保留当前产品规则、模型接入与运维说明，不保留过期计划和一次性报告。
- 修改路径与命令时同步更新文档链接、代码引用和检查配置；不将历史报告当作新的架构要求。

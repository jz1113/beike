# 贝壳云图

面向电商视觉创作的浏览器应用，包含商品采集、视觉反推、分镜生成、大字报封面、关键词审核、画布编辑和 AI 助手。

采用单项目结构：一个 `package.json`、一个锁文件、一套安装和构建命令。前后端通过目录与依赖检查隔离，不使用 monorepo 或 workspace 包。

## 目录导航

```text
贝壳/
├── src/                 源码（前端、Go API、共用代码、迁移脚本）
│   ├── client/          前端：页面、交互、样式
│   │   └── public/      前端公开图片与品牌素材
│   ├── backend/         对外 API：Go 入口、领域接口、数据库迁移与官方种子
│   └── shared/          前后端共用的接口定义与业务规则
├── database/            数据库结构、迁移与本地开发库
├── go.mod / go.sum      Go 模块与依赖锁
├── node_modules/        安装生成的依赖，不手工维护
├── docs/                架构、产品、厂商接口与部署说明
├── tools/               工程工具
│   ├── configs/         质量检查与编译配置
│   ├── scripts/         启动、检查、深度模型与数据维护脚本
│   ├── deploy/          服务、Nginx 与部署环境模板
│   └── build/ui/        自动生成的前端构建产物
├── index.html           浏览器 HTML 入口
├── 启动贝壳云图.bat      Windows 双击启动浏览器版
├── 启动贝壳云图.command   macOS 双击启动浏览器版
├── vite.config.ts       前端开发代理与构建
├── tsconfig.json        类型检查与源码别名
├── package.json         唯一依赖清单与命令入口
└── pnpm-lock.yaml       唯一依赖锁文件
```

日常修改界面看 `src/client`，修改接口、数据库迁移和官方种子看 `src/backend`，历史 SQL 看 `database/migrations`，使用方法看 `docs`。`pnpm dev` 与 `pnpm start` 编译并启动 Go API。依赖由 `pnpm install` 管理；工程工具独立收纳，避免混入产品源码。根目录几个配置文件是工具入口，不必为了减少文件数再包一层。

详细归属和功能导航见 [目录与分层](docs/layout.md)，依赖限制见同页的模块职责与依赖边界。

`node_modules/` 是安装依赖，`tools/build/ui/` 是构建产物；二者会在安装或构建时生成，不是额外子项目。`.local/` 只保存本机工具、运行记录、凭证与备份，不放产品源码。`.agents/skills/` 是可复用技能，`AGENTS.md` 与 `.cursor/rules/` 是工程规则，均不是临时计划文件。

## 安装与启动

环境：Node.js 22、pnpm 10.13.1、Go 1.26。技术栈：React 19、Vite、Tailwind CSS、Go、SQLite。

```bash
nvm use
corepack enable
cp .env.example .env          # 仅首次创建；已有配置不要覆盖
pnpm install --frozen-lockfile
pnpm dev                     # 同时启动前端和 API
```

浏览器打开 http://127.0.0.1:5173。`pnpm dev` 同时启动 Vite 与 Go API。单独启动前端用 `pnpm dev:ui`；`dev:web` / `start:web` 与 `dev` / `start` 相同。

Windows 可在资源管理器中双击根目录的 [启动贝壳云图.bat](启动贝壳云图.bat) 或右键运行 [启动贝壳云图.ps1](启动贝壳云图.ps1)，macOS 也可在 Finder 中双击根目录的 [启动贝壳云图.command](启动贝壳云图.command)：它们选用 Node.js 22，首次缺依赖时按锁文件安装，然后启动 API 与前端并打开浏览器。重复双击会打开已运行的页面；在启动器的终端窗口按 Ctrl+C 停止服务。现有 `.env` 和本机数据不会被启动器覆盖。

在 `.env` 填写模型网关和采集配置；不要提交密钥。前端通过开发代理访问 API。生产由 Go 进程托管页面与 API：`pnpm start` 先编译 `src/backend/cmd/api`，启动时再用现有 Node 脚本执行数据库迁移和官方种子。

## 构建与检查

```bash
pnpm build                   # 类型检查并构建前端
pnpm start                   # 启动生产服务，读取 tools/build/ui/
pnpm check                   # 静态质量检查与生产构建，与 CI 一致
pnpm run check:structure     # 单项目结构与依赖声明
pnpm run lint:boundaries     # 浏览器/服务端、公共/功能模块边界
```

`pnpm check` 检查目录、依赖声明、模型文档、TypeScript、ESLint、未使用绑定、文件长度、依赖边界、密钥和 Go，运行单元测试，并构建前端。正式测试留在仓库内。QA fixture、截图、报告和 Agent 计划应放在项目外的临时目录，验证后清理。

## 数据与部署

- `pnpm db:migrate` / `pnpm db:deploy` 都运行 Go 版版本化 SQLite 迁移和官方种子。`database/migrations/` 里的历史 SQL 不参与新库初始化。
- `pnpm db:backup` 对实际运行库做一致性快照；`pnpm db:restore:verify <文件>` 检查快照完整性及外键。
- 本地启动器继续使用系统原有应用数据目录；`database/dev.db` 仅作为开发/首次启动后备数据。
- [部署说明](docs/deployment.md)与 Nginx 模板使用 `tools/build/ui/`。

`.env*`、本机凭证、数据库及 WAL/SHM、备份、上传素材不能作为源码垃圾清理。`pnpm clean` 只清除可重建的 `tools/build/ui`；`clean:all` 另清除可重装依赖。

## 文档

- [工程约定](AGENTS.md)
- [目录与分层](docs/layout.md)
- [工坊资产绑定](docs/workshop-asset-binding.md)
- [助手执行机制](docs/assistant-runtime.md)
- [厂商接口与模型索引](docs/models.md)

# 贝壳云图

面向电商视觉创作的全栈工作台，包含商品采集、视觉反推、分镜生成、大字报封面、关键词审核、无限画布编辑和 AI 伴随助手。

采用单项目全栈结构：统一依赖清单、统一锁文件、一套安装和构建命令。前后端通过目录与依赖检查隔离，不使用 monorepo 或多包 workspace。

---

## 项目整体六大架构速查地图

为了让所有开发者与交接人员能够直观、清晰地定位项目各层，项目核心物理结构与职能严格划分为以下六大体系：

| 架构分层 | 物理对应目录 / 文件 | 包含职责与定位 |
| --- | --- | --- |
| **1. 前端 (Client)** | `src/client/` | 浏览器界面、无限画布、全局状态、组件库以及各独立小工具前端视窗 |
| **2. 后端 (Backend)** | `src/backend/` | Go 语言高性能服务入口 (`cmd/api`)、业务领域调度逻辑与数据库版本化迁移 |
| **3. API 调用层 (网关)** | `src/backend/internal/modelgw/`<br>`docs/` | 生图、视频、语音合成、数字人、3D 资产、多模态反推的统一网关，调用样例写在对应参考文档末尾 |
| **4. 文件资料层** | `database/`<br>`docs/` | 本地 SQLite 开发库文件组、全量业务契约、模型调用文档与技术排布指南 |
| **5. 相关依赖** | `node_modules/`<br>`package.json`<br>`go.mod` | 前端第三方 npm 依赖包清单与 Go 后端第三方 SDK 依赖声明 |
| **6. 工程工具** | `tools/` | 启动脚本、生产打包产物、质量自动化门禁 (`tools/scripts`) 与部署模版 (`tools/deploy`) |

> **根目录散落文件说明**：
> - `启动贝壳云图.command`：**macOS 用户专用**，双击自动安装环境并拉起全栈服务；
> - `启动贝壳云图.bat` / `.ps1`：**Windows 用户专用**双击启动入口；
> - `index.html` / `vite.config.ts`：前端 Vite 打包工具的硬性行业根入口，禁止移动；
> - `package.json` / `go.mod`：Node 与 Go 工具链的模块根文件，禁止移动；
> - `tsconfig.json`：TypeScript 编辑器语法支持与源码别名映射根配置。

---

## 目录导航

```text
贝壳/
├── 源码核心层 (业务代码)
│   ├── src/client/            -> 【前端】：页面、交互、画布、独立小工具
│   │   └── public/            -> 公开静态素材 (URL 直接访问)
│   ├── src/backend/           -> 【后端】：Go 接口入口、业务领域服务、数据库迁移
│   └── src/shared/            -> 【前后端共享】：Zod 接口契约、纯业务模型规则
│
├── 资料与依赖层
│   ├── database/              -> 【文件资料】：SQLite 本地开发库与结构档案
│   ├── docs/                  -> 【文档】：架构、部署和各模态调用参考（样例附在文末）
│   └── node_modules/          -> 【前端依赖】：pnpm 下载的底层包
│
├── 工程工具层
│   ├── tools/                 -> 【工程工具】：质量门禁、启动器、部署模板
│   │   ├── configs/           -> ESLint、TypeScript、依赖边界规则
│   │   ├── scripts/           -> quality 质检、web 启动调度、db 数据维护
│   │   └── build/ui/          -> 自动生成的前端构建产物 (不提交)
│   └── api/                   -> 【接口文档】：OpenAPI 规范
│
└── 根目录标准入口 (行业规范固定位置)
    ├── 启动贝壳云图.command    -> macOS 双击启动入口
    ├── 启动贝壳云图.bat        -> Windows 双击启动入口
    ├── 启动贝壳云图.ps1        -> Windows PowerShell 启动入口
    ├── index.html             -> 浏览器主 HTML
    ├── vite.config.ts         -> 前端打包与代理配置
    ├── tsconfig.json          -> TS 别名与类型配置
    ├── package.json           -> 依赖与执行命令
    └── pnpm-lock.yaml         -> 依赖版本锁定
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

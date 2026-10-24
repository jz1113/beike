# 贝壳云图

面向电商视觉创作的全栈工作台，包含商品采集、图像与视频生成、视觉反推、封面制作、关键词审核、无限画布和 AI 助手。

项目使用一个根 package.json、一份 pnpm-lock.yaml 和一个 Go module。所有安装、启动、检查与构建命令都在仓库根目录执行。

## 目录导航

```text
云图/
├── src/                         产品源码
│   ├── client/                  React 浏览器端
│   │   ├── index.html           浏览器 HTML 入口
│   │   ├── app/                 应用组装、导航、全局弹窗
│   │   ├── features/            按功能组织的页面与流程
│   │   ├── shared/              跨功能 UI、请求与媒体能力
│   │   ├── store/               全局状态与持久化
│   │   └── public/              按原 URL 提供的公开资源
│   ├── backend/                 Go API、存储、运行时迁移与官方种子
│   └── shared/                  接口契约、纯业务规则与共用 JSON
│       └── contracts/openapi.yaml  HTTP 契约
├── tools/                       工程工具
│   ├── configs/                 环境模板、Vite、TypeScript、ESLint 与质量规则
│   ├── scripts/                 启动、构建配套、检查和数据维护
│   ├── launchers/               Windows PowerShell 启动器实现
│   ├── deploy/                  服务与反向代理模板
│   └── build/                   自动生成的 API 可执行文件与 ui/ 产物
├── database/                    可选的已有本地数据库与备份（不提交）
├── docs/                        当前架构、使用、模型接入与运维文档
├── node_modules/                自动安装的 Node 依赖
├── .local/                      本机运行记录、工具状态与备份
├── package.json / pnpm-lock.yaml  Node 依赖与统一命令
├── go.mod / go.sum              Go 模块与依赖版本
├── tsconfig.json                编辑器与类型检查入口
├── 启动贝壳云图.bat             Windows 双击启动入口
└── 启动贝壳云图.command         macOS 双击启动入口
```

| 要修改什么 | 从哪里开始 |
| --- | --- |
| 页面、交互与业务流程 | `src/client/features/<功能>` |
| 导航、页面挂载、全局灯箱和右键菜单 | `src/client/app` |
| 多个功能共用的浏览器能力 | `src/client/shared` |
| HTTP 接口、数据库读写与运行时迁移 | `src/backend/internal` |
| 请求响应契约与 OpenAPI | `src/shared/contracts` |
| 业务规则、模型适配与类型 | `src/shared/domain` |
| 构建、检查、启动和部署 | `tools` |

详细目录归属、功能导航与依赖方向见 [目录与分层](docs/layout.md)。组件分类目录直接存放实现文件；功能内部按 `components / hooks / api / model` 的实际需要组织。

常用功能目录：`poster` 封面、`keywords` 关键词审核、`ppt` 演示文稿、`sales` 带货视频。前后端沿用同一组名称，模型协议适配统一放在后端 `gateway`。

根目录保留工具链需要发现的依赖清单、锁文件、TypeScript 入口和 `jsrepo.config.mts`，以及说明、工程约定和 Windows / macOS 双击入口。`jsrepo.config.mts` 用于通过 jsrepo 引入背景组件，保留在工具默认发现位置。环境模板、Vite 配置位于 `tools/configs`，HTML 位于 `src/client/index.html`；统一命令会显式选择配置。`.agents`、`.cursor`、`.github` 与 `.vscode` 分别保存技能、规则、CI 和编辑器配置。

## 安装与启动

环境：Node.js 22、pnpm 10.13.1、Go 1.26 或更高版本。技术栈：React 19、Vite、Tailwind CSS、Go、SQLite。

```bash
nvm use
corepack enable
cp tools/configs/env.example .env  # 仅首次创建；已有配置不要覆盖
pnpm install --frozen-lockfile
pnpm dev                     # 同时启动前端和 Go API
```

浏览器打开 `http://127.0.0.1:5173`。单独启动前端使用 `pnpm dev:ui`；`dev:web` / `start:web` 分别是 `dev` / `start` 的别名。

Windows 双击根目录的 [启动贝壳云图.bat](启动贝壳云图.bat)，它调用 `tools/launchers` 中的 PowerShell 实现。macOS 双击根目录的 [启动贝壳云图.command](启动贝壳云图.command)。两个平台各保留一个双击入口。首次缺依赖时按锁文件安装，然后启动服务并打开浏览器。按启动终端中的 Ctrl+C 停止本次服务。

模型网关和采集配置填写在根目录 `.env`；首次启动从 `tools/configs/env.example` 创建，已有配置会保留。浏览器专属凭证通过设置页保存。开发端口和进程记录统一写入 `.local`。启动器继续兼容旧根目录端口缓存，并按 PID、启动时间、项目目录和配置识别自己记录的开发服务。

## 构建与检查

```bash
pnpm build                   # 类型检查并构建前端、Go API
pnpm build:api               # 仅构建 Go API
pnpm start                   # 启动已构建的 API，托管前端与存储读取
pnpm check                   # 全部静态检查、Go 检查、单元测试与生产构建
pnpm run check:root-layout    # 目录、入口归属、文档位置和实际组件分类
pnpm run lint:boundaries      # 浏览器安全、共享层和功能间依赖方向
```

`pnpm check` 还校验模型目录、共享数据和 OpenAPI，并检查 TypeScript、ESLint、未使用绑定、显式 any、文件长度、依赖循环与密钥。质量基线只允许收紧。正式测试与源码同目录；截图、QA fixture、一次性报告和临时计划放项目外。

接口调整后运行 `pnpm openapi:write`，同步 `src/shared/contracts/openapi.yaml` 和生成的浏览器类型。前端构建输出到 `tools/build/ui`，Go API 输出到 `tools/build/beike-api`（Windows 为 `.exe`），公开资源 URL 保持稳定。生产启动直接运行产物，缺少产物时提示先构建，不在重启时编译；需在部署目标系统与架构上构建。Go 查找与版本校验统一从 `go.mod` 读取最低版本，支持 `GO_BIN` 指定编译器。

## 数据与部署

- `pnpm db:migrate` / `pnpm db:deploy` 运行 Go 版版本化迁移和官方种子；schema 和迁移源文件统一在 `src/backend/internal/platform/database/migrate`，不保留第二套历史 SQL。
- `pnpm db:backup` 对实际运行库生成一致性快照；`pnpm db:restore:verify <文件>` 校验快照。
- 维护命令默认使用应用数据目录，可用文件参数、进程环境 `DATABASE_URL` 或 `AZHUO_DATA_DIR` 指定；不读取根 `.env` 的旧数据库占位，也不自动回退到 `database/dev.db`。具体规则见 [数据库维护](docs/database.md)。
- 本地启动器沿用系统应用数据目录。数据库及 WAL/SHM、备份、上传素材、`.env*` 与 `.local` 按运行数据保护。
- `pnpm clean` 只清除 `tools/build/ui`；`pnpm clean:build` 清除完整 `tools/build`；`pnpm clean:cache` 只清除 Vite、Vitest 与工具缓存；`pnpm clean:all` 清除完整构建产物和 `node_modules`。清理前先关闭本项目服务与测试进程，之后按需安装依赖、执行 `pnpm build` 恢复产物。支持 Windows、macOS 和 Linux；保留根锁文件，依赖统一通过 pnpm 安装。
- 生产部署及 `WEB_DIST_DIR`、Nginx 路径配置见 [部署说明](docs/deployment.md)。

## 文档

- [全部文档与主题导航](docs/README.md)
- [工程约定](AGENTS.md)
- [目录与分层](docs/layout.md)
- [数据库维护](docs/database.md)
- [部署与排障](docs/deployment.md)
- [厂商接口与模型索引](docs/models.md)

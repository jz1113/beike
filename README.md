# 贝壳云图

面向电商视觉创作的浏览器应用：商品采集、视觉反推、分镜生成、大字报封面、关键词审核和画布编辑都在同一套 Web 工作台里完成。

## 技术栈

- 前端：React 19、Vite、Tailwind CSS
- 后端：Hono（Node.js）
- 数据：Prisma 5 + SQLite
- 仓库：pnpm workspace 轻量 monorepo；应用采用模块化单体，不引入额外编排框架

## 目录

```text
apps/web          浏览器界面
apps/api          HTTP API
packages/contracts  Zod 契约
packages/domain     浏览器可运行的纯逻辑
packages/server-kit Node 侧存储、鉴权和爬虫
packages/prisma     schema 与迁移
tools               校验脚本和工程配置
docs                架构约定与厂商模型索引
deploy              Ubuntu 部署说明
```

依赖方向：`web` 只依赖 `contracts` 和 `domain`；`api` 再依赖 `server-kit` 和 `prisma`；`domain` 不依赖 Node、Prisma 或对象存储。`apps/web/src/shared` 不引用 `features`。

### 架构选择与文件归属

保留 **2 个应用 + 4 个共享/数据包**：Web 与 API 的运行环境不同，契约、纯业务规则、服务端能力和数据库迁移也需要独立边界。问题不在是否使用 monorepo，而在边界是否清晰、功能目录是否按职责组织。暂不合并成单包，也不拆成多仓库或 feature 微包。

- Web 应用组合入口：`apps/web/src/app/App.tsx`，启动入口仍为 `src/main.tsx`。
- 工坊：`features/workshop/{api,hooks,components,model}`；`model` 按 `collection / analysis / generation / delivery / workspace` 五类职责组织，测试与实现相邻。
- 跨模块资产缓存：`apps/web/src/shared/api/assetLibraryCache.ts`；不得让 shared 反向依赖 features。
- 具体放置规则见 [目录与分层](docs/architecture/layout.md)，整改依据、删除清单及限制见 [仓库架构核查报告](docs/architecture/repository-architecture-audit-2026-09-24.md)。

## 环境

- Node.js 22（见 `.nvmrc`）
- pnpm 10.13.1（见根目录 `packageManager`）

```bash
nvm use
corepack enable
corepack prepare pnpm@10.13.1 --activate
```

## 配置

```bash
cp .env.example .env
```

在 `.env` 里填写模型网关和采集接口密钥。不要提交 `.env` 或 `.env.production`。浏览器里保存的密钥跟随当前请求发送，生产环境不会写回服务器的 `.env`。

## 本地开发

```bash
pnpm install
pnpm run dev:web
```

浏览器打开 http://127.0.0.1:5173。也可以分开启动：

```bash
pnpm run dev:api
pnpm run dev:ui
```

## 生产

```bash
pnpm run build:ui
pnpm run start:web
```

服务器步骤见 [deploy/README.md](deploy/README.md)。生产数据库只使用 `pnpm run db:deploy`。

## 数据库

| 命令 | 用途 |
| --- | --- |
| `pnpm run db:push` | 开发时把 schema 直接推到本地 SQLite |
| `pnpm run db:migrate` | 开发时生成并应用迁移 |
| `pnpm run db:deploy` | 生产环境只应用已有迁移 |
| `pnpm run db:backup` | 按 `DATABASE_URL` 做 SQLite 文件备份 |
| `pnpm run db:restore:verify` | 对当前库或备份做完整性检查 |

备份默认写到 `packages/prisma/backups/`，这些文件不进 Git。

## 质量门禁

`pnpm run check` 依次执行：

- 根目录布局
- 六个工作区的名称、私有性、依赖方向及 `workspace:*` 协议
- 批准模型清单与文档是否对齐
- TypeScript
- ESLint
- 新增未使用绑定
- 新增超长文件
- 依赖边界
- 密钥扫描
- 测试
- 前端生产构建

单独测试：`pnpm test`。测试入口递归发现 `apps/*/src`、`packages`、`tools/scripts` 下的 `.test.*` / `.spec.*`，不再手写测试目录清单。浏览器 QA 不混入单元测试，需另行运行。

```bash
pnpm run test:list                  # 检查实际发现的测试文件
pnpm --filter @beike/web test       # 仅前端
pnpm --filter @beike/api test       # 仅 API
pnpm --filter @beike/domain test    # 仅纯业务包
pnpm run check:workspaces           # 工作区边界
pnpm run audit:source               # 只读盘点；生成 .local/source-audit.json
```

CI 与本地统一执行 `pnpm run check`。静态扫描候选必须再检查动态加载、公开导出和运行入口，不能直接批量删除。

## 安全清理

`pnpm run clean` 仅清除构建输出；`clean:all` 还删除可重新安装的 `node_modules`。**被 Git 忽略不等于可以删除**：`.local/`、`.env*`、SQLite 数据库及其 WAL/SHM、`packages/prisma/backups/`、上传素材与本地存储均可能包含真实数据或凭证，不在自动清理范围内。迁移、种子、部署脚本和公开资源也不能只凭前端引用次数删除。

## 换电脑

提交并推送后，在另一台机器 `git pull`。`.env` 和 `packages/prisma/dev.db` 不在仓库里，需要自行拷贝。类目拍摄结构和提示词资产在 `packages/domain` 的配方与 `seeds/` 中，不要删。

## 文档

- [docs/AGENTS.md](docs/AGENTS.md)：工程约定
- [docs/architecture/](docs/architecture/)：目录分层与代码健康
- [docs/vendors/](docs/vendors/)：批准模型的厂商和聚合索引

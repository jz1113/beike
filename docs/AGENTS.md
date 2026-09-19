# 贝壳云图 Agent / 工程约定

产品名：**贝壳云图**（Beike Cloud Graph）。npm 根包名：`beike-cloud-graph`。桌面壳 Cargo/identifier 仍为历史名 `azhuo-workbench` / `com.azhuo.workbench`（不必一次改完）。

## 布局（单核扁平）

```text
beike-main/
├── app/
│   ├── web/           # @beike/web — React + Vite UI
│   └── api/           # @beike/api — Hono Node sidecar
├── packages/
│   ├── contracts/     # @beike/contracts — Zod DTO（薄）
│   ├── domain/        # @beike/domain — browser-safe 纯逻辑 / 类型
│   └── server-kit/    # @beike/server-kit — Node-only（Prisma、存储、爬虫等）
├── db/prisma/         # @beike/prisma — schema + migrations
├── desktop/           # Tauri v2（非 pnpm 包）
├── works/             # configs / e2e / launch / scripts / test-support
└── docs/              # architecture/ 内部约定；vendors/官方接口 厂商与聚合文档
```

权威校验：`pnpm run check:root-layout`（[`works/scripts/check-root-layout.mjs`](../works/scripts/check-root-layout.mjs)）。

**不要**使用已废弃的 `工程/`、`依赖/node`、`工程/apps|packages|tools` 布局。

## 包管理

- 使用 **pnpm**（见根 `package.json` 的 `packageManager`）。
- 安装：`pnpm install`
- 脚本：优先 `pnpm run <script>`；workspace 包：`pnpm --filter @beike/web <cmd>`

## 依赖方向（必须遵守）

```text
@beike/web          → @beike/contracts, @beike/domain
@beike/api          → @beike/contracts, @beike/domain, @beike/server-kit, @beike/prisma
@beike/domain       → （无 Node 原生 / Prisma / sharp / AWS / 爬虫）
@beike/server-kit   → @beike/domain, @beike/prisma, Node 依赖
@beike/contracts    → 仅 zod 等契约依赖，无业务实现
```

- Web 前端 **禁止** 直接依赖 `@beike/server-kit`。
- 前端 UI 共用代码放在 `app/web/src/ui`（历史目录名 `shared` 已弃用），不要与 `@beike/domain` 混称。
- 深导入：`@beike/domain/drawing`、`@beike/server-kit/prisma` 等；避免从包根 barrel 拉全量。

## 命名

| 对外 / 文档 | 仓库 / npm | 桌面壳 |
|-------------|------------|--------|
| 贝壳云图 | `beike-cloud-graph` | `azhuo-workbench`（历史） |

新代码与用户可见文案优先用「贝壳云图」/ `beike`；改 Cargo identifier 需单独发布协调，勿随意改。

## 文档分层

- [`docs/architecture/`](architecture/) — 内部架构与边界
- [`docs/vendors/官方接口/`](vendors/官方接口/) — 批准模型的聚合平台 OpenAPI spec + 厂商官网索引
- 其它操作说明（打包等）可保留在 `docs/` 子目录
- 启动桌面：[`works/launch/start-desktop.command`](../works/launch/start-desktop.command)（根目录 `启动桌面.command` 为薄包装）

## 明确不做

- 不迁回 `工程/` 中文根布局
- 不为现状强上 Turborepo
- 不按 feature 竖切成大量微小 npm 包

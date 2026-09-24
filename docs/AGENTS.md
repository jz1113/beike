# 贝壳云图 Agent / 工程约定

产品名：**贝壳云图**（Beike Cloud Graph）。npm 根包名：`beike-cloud-graph`。产品只在浏览器中运行。桌面端 Tauri 壳已经从仓库移除。

## 布局（单核扁平）

```text
beike-main/
├── apps/
│   ├── web/           # @beike/web — React + Vite UI
│   └── api/           # @beike/api — Hono API
├── packages/
│   ├── contracts/     # @beike/contracts — Zod DTO（薄）
│   ├── domain/        # @beike/domain — browser-safe 纯逻辑 / 类型
│   ├── server-kit/    # @beike/server-kit — Node-only（Prisma、存储、爬虫等）
│   └── prisma/        # @beike/prisma — schema + migrations
├── tools/             # configs / scripts
└── docs/              # architecture/ 内部约定；vendors/ 厂商与聚合索引
```

权威校验：`pnpm run check:root-layout`（[`tools/scripts/check-root-layout.mjs`](../tools/scripts/check-root-layout.mjs)）。

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
- 前端 UI 共用代码放在 `apps/web/src/shared`，不要与 `@beike/domain` 混称。
- 深导入：`@beike/domain/drawing`、`@beike/server-kit/prisma` 等；避免从包根 barrel 拉全量。

## 命名

| 对外 / 文档 | 仓库 / npm |
|-------------|------------|
| 贝壳云图 | `beike-cloud-graph` |

新代码与用户可见文案优先用「贝壳云图」/ `beike`。

## 文档分层

- [`docs/architecture/`](architecture/) — 内部架构、包边界、目录分层与产品操作说明
- [`docs/vendors/官方接口/`](vendors/官方接口/) — 批准模型的聚合索引 + 厂商官网索引
- [`docs/vendors/external-parsing.md`](vendors/external-parsing.md) — 外站链接解析接口
- 本地启动：仓库根目录 `pnpm run dev:web`，浏览器打开 `http://127.0.0.1:5173`
- 不要在 `docs/` 根目录再放散落 markdown 或其它子目录

## 明确不做

- 不迁回 `工程/` 中文根布局
- 不为现状强上 Turborepo
- 不按 feature 竖切成大量微小 npm 包

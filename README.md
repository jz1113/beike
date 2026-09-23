# 贝壳云图 (Beike Cloud Graph)

> 面向电商视觉创作、多模态智能生图生视频与创意工作流的 Web 应用，在浏览器中使用。

---

## 🌟 项目架构

本项目采用全栈 Monorepo。产品在浏览器中使用，不再使用桌面端。

- **Web 前端**：React 19 + Vite + Tailwind CSS + Lucide Icons
- **后端服务**：Hono API Server (Node.js)
- **数据持久化**：Prisma ORM + SQLite
- **工程管理**：pnpm workspace 多包管理架构

```text
├── apps/
│   ├── api/       # 后端 API 服务 (Hono + TypeScript)
│   ├── web/       # 前端应用 (React + Vite)
│   └── desktop/   # 已停用，不再作为运行入口
├── packages/      # 共享库（contracts / domain / server-kit / prisma）
├── tools/         # 构建、校验与维护脚本
└── docs/          # architecture/ 内部约定；vendors/ 厂商与聚合索引
```

---

## 🚀 快速开始与跨平台运行

### 1. 环境准备

- **Node.js**：22 LTS（仓库 `.nvmrc` 已钉死；`engines.node` 为 `^22`）。本机若只有 20，请先切到 22：
  ```bash
  nvm install 22
  nvm use
  node --version   # v22.x
  ```
- **包管理器**：pnpm 10.13.1（与根目录 `packageManager` 字段一致）
- **Git**：版本控制工具

启用与仓库一致的 pnpm：

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
node --version   # v22.x
pnpm --version   # 10.13.1
```

---

### 2. 环境变量配置

首次克隆项目后，在根目录创建 `.env` 文件：

```bash
cp .env.example .env
```

在 `.env` 中填入必要的第三方模型与平台接口凭证（如万邦、奇云、API Hub等对应密钥）。不要提交 `.env`、`.env.production` 或任何真实密钥。Windows 安装包流水线从 GitHub Environment `windows-release` 读取 Secrets；缺失时构建必须失败，禁止在工作流中写回退凭据。若历史提交曾暴露过密钥，请在供应商控制台轮换后作废旧值。

---

### 3. 启动 Web

进入项目根目录，在终端执行：

```bash
# 安装依赖
pnpm install

# 本机 Web：同时启动 API + Vite，并打开浏览器
pnpm run dev:web
# 打开浏览器访问：http://127.0.0.1:5173

# 也可分开启动
pnpm run dev:ui
pnpm run dev:api
```

---

## 🔄 双端/多设备协同开发指南

如果你在 **Mac 电脑** 与 **Windows 电脑** 之间切换编辑，请遵循以下同步规则：

1. **改动完成，准备换电脑前（推送代码）**：
   ```bash
   git add .
   git commit -m "更新说明"
   git push
   ```
2. **在另一台电脑开始编辑前（拉取最新）**：
   ```bash
   git pull
   ```

> ⚠️ **注意**：`.env`（密钥）与 `packages/prisma/dev.db`（本地 SQLite 数据库）未包含在 Git 仓库中。首次在另一台电脑配置时，请手动从常用电脑拷贝一次 `.env` 配置文件。类目拍摄架构与提示词资产已固化在 `packages/domain/src/masterRecipes.ts` 与 `packages/domain/src/seeds/`，不要删除。

云服务器部署（新手逐步）见 [`deploy/README.md`](deploy/README.md)。生产启动：`pnpm run build:ui && pnpm run start:web`。

---

## 🛠️ 常用开发脚本

| 命令 | 说明 |
| :--- | :--- |
| `pnpm run typecheck` | 执行 TypeScript 全量静态类型检查 |
| `pnpm run lint` | ESLint 代码质量检查 |
| `pnpm run start:web` | 生产模式：托管 `apps/web/dist` 并启动 API（需先 `pnpm run build:ui`） |
| `pnpm run seed:export` | 从本机数据库导出官方提示词种子 |
| `pnpm run db:push` | 开发实验：把 Prisma schema 直接推到本地 SQLite，不写迁移历史 |
| `pnpm run db:migrate` | 开发：`prisma migrate dev`，生成并应用迁移 |
| `pnpm run db:deploy` | 生产：只允许 `prisma migrate deploy`，应用已有迁移 |
| `pnpm run db:backup` | 按 `DATABASE_URL` 复制一份 SQLite 文件级备份 |
| `pnpm run db:restore:verify` | 对当前库或指定备份文件做 `PRAGMA integrity_check` |

开发可以用 `db:push` 做实验；生产只允许 `db:deploy`。备份文件默认写到 `packages/prisma/backups/`（`*.db` 已被 gitignore）。

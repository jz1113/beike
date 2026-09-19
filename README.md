# 贝壳云图 (Beike Cloud Graph)

> 面向电商视觉创作、多模态智能生图生视频与创意工作流的全栈桌面端应用。

---

## 🌟 项目架构

本项目采用现代化全栈 Monorepo 架构，全面支持 **macOS** 与 **Windows** 双平台：

- **桌面外壳**：[Tauri v2](https://tauri.app/) (Rust MSVC/Darwin)
- **Web 前端**：React 19 + Vite + Tailwind CSS + Lucide Icons
- **后端服务**：Hono API Server (Node.js 侧边进程 / Sidecar)
- **数据持久化**：Prisma ORM + SQLite
- **工程管理**：pnpm workspace 多包管理架构

```text
├── apps/
│   ├── api/       # 后端 API 服务 (Hono + TypeScript)
│   ├── web/       # 前端应用 (React + Vite)
│   └── desktop/   # Tauri 桌面端工程 (Rust 配置与窗口管理)
├── packages/      # 共享库（contracts / domain / server-kit / prisma）
├── tools/         # 构建、校验与维护脚本
└── docs/          # 接口文档与开发规范
```

---

## 🚀 快速开始与跨平台运行

### 1. 环境准备

- **Node.js**：`>= 20.0.0` (推荐 LTS 版本)
- **包管理器**：`pnpm` (推荐，运行 `npm install -g pnpm`)
- **Git**：版本控制工具
- **Rust 工具链**（仅在运行/打包 Tauri 桌面原生窗口时需要）：
  - **Windows**：安装 [Rustup](https://rustup.rs/) (MSVC 工具链) 与 Visual Studio C++ 生成工具
  - **macOS**：安装 Xcode Command Line Tools (`xcode-select --install`) 与 Rustup

---

### 2. 环境变量配置

首次克隆项目后，在根目录创建 `.env` 文件：

```bash
cp .env.example .env
```

在 `.env` 中填入必要的第三方模型与平台接口凭证（如万邦、奇云、API Hub等对应密钥）。

---

### 3. 一键启动（macOS）

进入项目根目录，直接双击运行：
```text
启动桌面.command
```
*(或在终端中执行 `./启动桌面.command`)*

---

### 4. 开发者模式（终端运行）

如果你使用 VS Code、Cursor 或 WebStorm 进行代码编辑，可在根目录终端执行：

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

> ⚠️ **注意**：`.env`（密钥）与 `packages/prisma/dev.db`（本地 SQLite 数据库）未包含在 Git 仓库中。首次在另一台电脑配置时，请手动从常用电脑拷贝一次 `.env` 配置文件。

---

## 🛠️ 常用开发脚本

| 命令 | 说明 |
| :--- | :--- |
| `npm run typecheck` | 执行 TypeScript 全量静态类型检查 |
| `npm run lint` | ESLint 代码质量检查 |
| `npm run pack:zip` | 一键生成带密钥的纯源码离线轻量压缩包 |

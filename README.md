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
├── app/
│   ├── api/       # 后端 API 服务 (Hono + TypeScript)
│   └── web/       # 前端应用 (React + Vite)
├── db/
│   └── prisma/    # 数据库定义与迁移 (SQLite + Prisma Schema)
├── desktop/       # Tauri 桌面端工程 (Rust 配置与系统托盘/窗口管理)
├── docs/          # 接口文档与开发规范
└── works/         # 跨平台构建、自动化测试与维护脚本
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

### 3. 一键启动（按平台）

#### 🪟 Windows 用户
进入项目根目录，直接双击运行：
```text
启动桌面.bat
```
*(脚本会自动检测并执行 `pnpm install` 安装依赖，完成初始化并启动应用)*

#### 🍏 macOS 用户
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

# 模式 A：启动桌面全栈开发模式（Tauri 窗口 + Web + API）
npm run tauri:dev

# 模式 B：纯网页端轻量开发模式（无需 Rust，浏览器快速调试）
npm run dev:ui
npm run dev:api
# 打开浏览器访问：http://localhost:5173
```

---

## 📦 桌面端打包发布

项目内置了一键打包脚本，可直接生成对应平台的安装文件：

- **Windows 打包安装程序**：双击运行 `一键打包Windows安装包.bat`（产物为 `.exe` / `.msi` 安装包）。
- **macOS 打包安装镜像**：运行 `./一键打包Mac安装包.command`（产物为 `.dmg` 镜像）。

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

> ⚠️ **注意**：`.env`（密钥）与 `db/prisma/dev.db`（本地 SQLite 数据库）未包含在 Git 仓库中。首次在另一台电脑配置时，请手动从常用电脑拷贝一次 `.env` 配置文件。

---

## 🛠️ 常用开发脚本

| 命令 | 说明 |
| :--- | :--- |
| `npm run typecheck` | 执行 TypeScript 全量静态类型检查 |
| `npm run lint` | ESLint 代码质量检查 |
| `npm run test` | 运行单元测试 (Vitest) |
| `npm run pack:zip` | 一键生成带密钥的纯源码离线轻量压缩包 |

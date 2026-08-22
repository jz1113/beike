# 贝壳云图

全流程工业级电商视觉生成解决方案，桌面端应用。

---

## 目录结构

```text
贝壳云图/
├── docs/                 # 文档与 API 参考
├── launch/               # 桌面启动脚本
├── prisma/               # SQLite schema
├── public/               # 静态资源
├── server/               # Hono API 后端
│   ├── index.ts          # 入口
│   ├── middleware/       # 鉴权
│   ├── adapters/         # HTTP 辅助
│   └── routes/           # API 路由
├── src/                  # Vite + React 前端
│   ├── main.tsx
│   ├── App.tsx
│   ├── features/
│   ├── shared/
│   ├── store/
│   ├── lib/
│   └── styles/
├── src-tauri/            # Tauri 桌面壳
├── tools/scripts/        # 开发/打包脚本
├── index.html
├── vite.config.ts
└── package.json
```

---

## 开发与调试

需安装 [Node.js 20+](https://nodejs.org/) 与 [Rust](https://rustup.rs/)。

```bash
npm install
npm run tauri:dev        # 或双击 launch/启动桌面.command
```

| 命令 | 说明 |
|------|------|
| `npm run dev:api` | 仅 API → http://127.0.0.1:3000 |
| `npm run dev:ui` | 仅 UI → http://127.0.0.1:5173 |
| `npm run tauri:dev` | 桌面窗口（API + UI + Tauri） |
| `npm run tauri:build` | 打包安装包 |
| `npm run clean:dev` | 释放约 3 GB（删 Rust 编译缓存 + sidecar 副本，不影响源码） |
| `npm run clean:all` | 连同 `node_modules` 一并删除（再开发需 `npm install`） |
| `npm run pack:source` | 打包精简源码 tar.gz（不含依赖与构建产物；`WITH_GIT=1` 可含 Git 历史） |

| 想改什么 | 改哪里 |
|---------|--------|
| 界面 | `src/features/`、`src/shared/` |
| API | `server/routes/`、`src/lib/` |
| 窗口/壳 | `src-tauri/` |
| 数据库 | `prisma/schema.prisma` |

---

## 打包发版

```bash
npm run tauri:build
```

产物在 `src-tauri/target/release/bundle/`。

**体积提示：** 日常开发后运行 `npm run clean:dev` 可删除 `src-tauri/target`（约 3 GB）与 Node sidecar 副本；下次 `tauri:dev` 会自动重建。备份源码用 `npm run pack:source`。

用户数据目录（identifier 不变）：
- macOS：`~/Library/Application Support/com.azhuo.workbench/`
- Windows：`%APPDATA%\com.azhuo.workbench\`

---

## 技术栈

- **桌面壳**：Tauri 2 + Rust
- **前端**：Vite 6 + React 19 + Tailwind CSS 4
- **后端**：Hono 4 + Prisma + SQLite
- **状态**：Zustand

详细架构见 [`docs/CODEBASE_GUIDE.md`](docs/CODEBASE_GUIDE.md)。

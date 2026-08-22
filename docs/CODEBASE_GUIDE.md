# 贝壳云图 · 源码与目录架构指南

> **系统定位**：全渠道电商 4K 视觉策划、成套分镜生图、AI 买家秀与多模态智能工作台  
> **技术栈**：Vite 6 + React 19 + Tauri 2 + Hono 4 + TypeScript + Tailwind CSS v4 + Prisma (SQLite) + Zustand

---

## 1. 根目录

```
贝壳云图/
├── docs/                # 架构指南 + api-reference 第三方接口备份
├── launch/              # 桌面启动（启动桌面.command / .bat）
├── prisma/              # SQLite schema
├── public/              # 静态资源（logo / inspirations）
├── server/              # Hono API 后端
├── src/                 # Vite 前端 + 共享 lib
├── src-tauri/           # Tauri 桌面壳
├── tools/scripts/       # 开发/打包/离线生成脚本
├── index.html           # Vite 入口
├── vite.config.ts
└── package.json
```

启动：`npm run tauri:dev` 或 `launch/启动桌面.command`。

---

## 2. `server/` 后端

```
server/
├── index.ts             # Hono 入口，挂载全部 /api/*
├── middleware/auth.ts   # API 鉴权
├── adapters/http.ts     # jsonResponse 等 HTTP 辅助
└── routes/              # 按域划分的 API 路由
    ├── health.ts
    ├── catalog/         # 商品、采集、风格、提示词
    ├── generate/        # 生图、生视频、分析、导出
    ├── assets/          # 任务、云存储
    ├── assistant/       # AI 助手
    └── system/          # 代理、配置、模型列表
```

路由使用标准 `Request` / `Response`，通过 `jsonResponse()` 返回 JSON。

---

## 3. `src/` 前端

```
src/
├── main.tsx             # Vite 入口
├── App.tsx              # 根组件（SPA 导航）
├── features/            # 按产品视图划分
├── shared/              # ui / media / modals
├── store/               # Zustand slices
├── lib/                 # 客户端 + 服务端共享逻辑
├── types/
└── styles/globals.css
```

导航：`currentView` ∈ `hub` | `generate` | `buyer_show` | `assets`。

---

## 4. `features/`（对齐 currentView）

| 目录 | 对应视图 / 职责 |
|------|-----------------|
| `hub/` | 创作大厅、PromptActionBar、灵感流 |
| `generate/` | 极速生图工作区 + `useGenerationEngine` |
| `buyer-show/` | 买家秀工坊四步 |
| `assets/` | 资产中心 |
| `assistant/` | AI 助理抽屉与技能 |
| `collect/` | 全能采集弹窗 |
| `settings/` | 设置弹窗 |

---

## 5. `src-tauri/` 桌面壳

```
src-tauri/
├── src/                 # Rust：lib.rs / db.rs / api/
├── resources/api-server/  # 打包时生成的 Hono sidecar
├── icons/
└── tauri.conf.json
```

- `frontendDist` → `../dist`（Vite 构建产物）
- 生产环境 spawn Hono sidecar 提供 AI/sharp 等 Node 依赖路由

---

## 6. API 调用约定

- 前端统一 `apiFetch()`（`src/lib/apiClient.ts`）
- 媒体 URL 统一 `proxyMediaUrl()`（桌面打包后 `<img src>` 需带 API base + token）
- 桌面环境生产构建：部分 DB 读操作走 Rust `desktop_api` invoke
- **桌面 dev（`tauri:dev`）**：Rust `desktop_api` 一律转发 Hono sidecar（`prisma/dev.db`），避免与 `app_data/azhuo.db` 分裂
- 契约文档：[`docs/API_CONTRACT.md`](API_CONTRACT.md)

### 桌面 dev 数据流

```
Tauri webview → apiFetch → invoke(desktop_api)
  → debug 构建：全部转发 127.0.0.1:{port} Hono sidecar → prisma/dev.db
  → release 构建：health + catalog/tasks GET 可走 Rust 快路径 → app_data/azhuo.db
```

启动：`npm run tauri:dev`；API 端口写入 `.desktop-dev-port`，Vite 代理与之对齐。

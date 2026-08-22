# 贝壳云图 · Agent 规则

## 架构

- **前端**：Vite 6 + React 19（入口 `index.html` → `src/main.tsx` → `src/App.tsx`）
- **后端**：Hono 4（入口 `server/index.ts`，路由在 `server/routes/`）
- **桌面**：Tauri 2（`src-tauri/`）

## 开发命令

```bash
npm run dev:api      # API http://127.0.0.1:3000
npm run dev:ui       # UI  http://127.0.0.1:5173
npm run tauri:dev    # 桌面窗口
npm run clean:dev    # 释放约 3GB 构建缓存（开发结束可选）
npm run pack:source  # 打包精简源码备份
```

## 约定

- 前端 API 调用统一走 `src/lib/apiClient.ts` 的 `apiFetch()`
- 新增 API 路由放在 `server/routes/`，使用 `jsonResponse()`（`server/adapters/http.ts`），不要用 Next.js
- 共享业务逻辑放 `src/lib/`，前后端均可 `@/lib/...` 引用
- 路径别名 `@/*` → `src/*`

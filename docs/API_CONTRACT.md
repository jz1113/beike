# 贝壳云图 · API 契约文档

> 桌面端 API 由 Hono 服务（`server/index.ts`）提供；health 与部分 DB 读操作由 Rust `desktop_api` 命令处理。
> 前端统一通过 `apiFetch()` / `invoke('desktop_api')` 调用。

## 通用约定

- **Base URL**：开发 `http://127.0.0.1:3000`（Vite 代理 `/api`）；桌面生产由 `get_api_base` 注入
- **鉴权头**：`x-app-token: <LOCAL_ACCESS_TOKEN>`
- **媒体代理**：`/api/system/proxy-image?url=...&token=...`（Cookie 或 query）
- **响应格式**：JSON `{ success: boolean, ... }`；错误时 `error: string`

---

## 路由源码映射

| HTTP 路径 | 源码文件 |
|-----------|----------|
| `/api/health` | `server/routes/health.ts` |
| `/api/catalog/products` | `server/routes/catalog/products.ts` |
| `/api/catalog/collect` | `server/routes/catalog/collect.ts` |
| `/api/catalog/styles` | `server/routes/catalog/styles.ts` |
| `/api/catalog/styles/extract` | `server/routes/catalog/styles/extract.ts` |
| `/api/catalog/styles/parse-link` | `server/routes/catalog/styles/parse-link.ts` |
| `/api/catalog/prompts` | `server/routes/catalog/prompts.ts` |
| `/api/generate/image` | `server/routes/generate/image.ts` |
| `/api/generate/video` | `server/routes/generate/video.ts` |
| `/api/generate/analyze` | `server/routes/generate/analyze.ts` |
| `/api/generate/export-zip` | `server/routes/generate/export-zip.ts` |
| `/api/assets/tasks` | `server/routes/assets/tasks.ts` |
| `/api/assets/storage/test` | `server/routes/assets/storage/test.ts` |
| `/api/assets/storage/migrate` | `server/routes/assets/storage/migrate.ts` |
| `/api/assistant/chat` | `server/routes/assistant/chat.ts` |
| `/api/assistant/sessions` | `server/routes/assistant/sessions.ts` |
| `/api/assistant/extract-document` | `server/routes/assistant/extract-document.ts` |
| `/api/system/proxy-image` | `server/routes/system/proxy-image.ts` |
| `/api/system/config` | `server/routes/system/config.ts` |
| `/api/system/models/fetch` | `server/routes/system/models/fetch.ts` |

---

## 1. Health

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 就绪探测 |

**Response 200**
```json
{ "ok": true, "desktop": true, "desktopToken": "..." }
```

---

## 2. 商品库 `/api/catalog/products`

| 方法 | 说明 |
|------|------|
| GET | 分页列表 `?page=1&pageSize=50` |
| POST | 创建/更新商品 |
| PUT | 更新商品 |
| DELETE | 删除 `?id=` |

**GET Response**
```json
{ "success": true, "page": 1, "pageSize": 50, "total": 0, "products": [] }
```

---

## 3. 采集 `/api/catalog/collect`

| 方法 | Body | 说明 |
|------|------|------|
| POST | `{ platform, itemId?, url?, ... }` | 万邦/APIA 采集入库 |

---

## 4. 风格配方 `/api/catalog/styles`

| 方法 | 说明 |
|------|------|
| GET | 列表 |
| POST | 创建 |
| PUT | 更新 |
| DELETE | 删除 `?id=` |

### 子路由

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/catalog/styles/extract` | POST | 视觉反推风格 |
| `/api/catalog/styles/parse-link` | POST | 社媒链接解析 |

---

## 5. 提示词历史 `/api/catalog/prompts`

| 方法 | 说明 |
|------|------|
| GET | 最近 200 条 |
| POST | 保存记录 |
| DELETE | 删除 `?id=` |

---

## 6. 生图 `/api/generate/image`

| 方法 | 说明 |
|------|------|
| POST | 提交生图（multipart/JSON） |
| GET | 轮询任务 `?taskId=` |

**POST Body（摘要）**
```json
{
  "prompt": "...",
  "model": "gpt-image-2",
  "size": "1024x1536",
  "quality": "hd",
  "imageUrls": ["data:image/jpeg;base64,..."]
}
```

---

## 7. 生视频 `/api/generate/video`

| 方法 | 说明 |
|------|------|
| POST | 提交视频任务 |
| GET | 轮询 `?taskId=` |

---

## 8. 视觉分析 `/api/generate/analyze`

| 方法 | Body | 说明 |
|------|------|------|
| POST | `{ productImages, model, ... }` | 买家秀分镜策划 |

---

## 9. 批量导出 `/api/generate/export-zip`

| 方法 | Body | 说明 |
|------|------|------|
| POST | `{ items: [...] }` | 打包 ZIP |

---

## 10. 任务 `/api/assets/tasks`

| 方法 | 说明 |
|------|------|
| GET | 分页历史 `?page=&pageSize=&mediaType=` |
| DELETE | 批量清理 |

---

## 11. 云存储 `/api/assets/storage/*`

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/assets/storage/test` | POST | 测试 S3 连接（需 admin token） |
| `/api/assets/storage/migrate` | POST | 迁移本地资源到 S3（需 admin token） |

---

## 12. AI 助手

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/assistant/chat` | POST | SSE 流式对话 |
| `/api/assistant/sessions` | GET/PUT/DELETE | 会话持久化 |
| `/api/assistant/extract-document` | POST | PDF/DOCX 等文档解析 |

---

## 13. 系统

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/system/proxy-image` | GET | SSRF-safe 图片/视频代理 |
| `/api/system/config` | GET/POST | 配置读取与连通性探测 |
| `/api/system/models/fetch` | POST | 拉取网关模型列表 |

---

## Rust 命令（Tauri invoke）

| 命令 | 参数 | 说明 |
|------|------|------|
| `get_api_base` | — | 返回 `http://127.0.0.1:{port}` |
| `desktop_api` | `{ method, url, path, headers, body? }` | 统一 API 路由：health/DB 读走 Rust，其余转发 Hono |

---

## 迁移状态

| 层 | 状态 |
|----|------|
| UI | ✅ Vite 静态前端 |
| API 服务 | ✅ Hono（替代 Next standalone） |
| DB 读 | ✅ Rust rusqlite（products/prompts/styles/tasks GET） |
| 媒体代理 | ⏳ Hono sidecar（img 标签需 HTTP） |
| AI/生图/sharp | ⏳ Hono sidecar → 计划迁移 Rust reqwest |

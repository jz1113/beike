# 目录与分层约定

```text
apps/
  web/src/
    app/          路由映射与 Provider
    features/     按业务域划分；禁止再套一层与域同名的 batch/ 等中间目录
    shared/       跨 feature 复用的 UI / API / hooks / 媒体
    store/        全局 Zustand 状态与 store 类型
    types/        真正跨域的产品数据结构（如 product），不要再放 store 切片
    assets/       构建期静态资源
  api/src/
    bootstrap/    启动、日志、生命周期
    core/         HTTP 基础设施（handler / validate / errors / cors）
    routes/       HTTP 适配；不直接访问 Prisma
    services/     业务逻辑；通过 repositories 访问数据
    repositories/ 唯一允许 import Prisma 的层（`db` 从 `repositories/access.ts` 导出）
    gateways/     外部 HTTP
packages/         contracts / domain / server-kit / prisma
tools/            configs / scripts
docs/             architecture/ 内部约定；vendors/ 厂商与解析说明
```

## Web

- 单 feature 专属请求放 `features/<f>/api/`，跨 feature 放 `shared/api/`。
- 提示条 UI 与逻辑统一在 `shared/prompt-bar/`。
- 多角度弹窗统一在 `shared/modals/multiAngle/`；点阵背景统一在 `shared/media/DotGrid`（`variant: 'ambient' | 'canvas'`）。
- `features/canvas/store/` 仅服务画布局部状态，不要把全局切片放进去。

## API

- JSON 路由经 `core/handler.ts` 的 `mountJson` / `asJsonRoute` 统一 try/catch 与 `{ success, error, code }` envelope。
- 二进制 / 流式例外：`system/local-media`、`system/proxy-image*`、`assistant/media`。
- 请求体走 `readJsonBody` + `parseJsonBody`；catch 块走 `safeErrorMessage`。
- 共享 Zod schema 放 `@beike/contracts`。

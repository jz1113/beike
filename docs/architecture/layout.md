# 目录与分层约定

```text
apps/
  web/src/
    app/          App.tsx 应用组合、路由映射与 Provider
    features/     按业务域划分；内部允许职责子目录，禁止重复业务名的空壳层
    shared/       跨 feature 复用的 UI / API / hooks / 媒体
    store/        全局 Zustand 状态与 store 类型
    types/        真正跨域的产品数据结构（如 product），不要再放 store 切片
    assets/       构建期静态资源
  api/src/
    bootstrap/    启动、日志、生命周期
    core/         HTTP 基础设施（handler / validate / errors / cors）
    routes/       HTTP 适配；不直接访问 Prisma
    services/     业务逻辑；通过 repositories 访问数据，不直接 import `repositories/db.ts`
    repositories/ 唯一允许 import Prisma 的层（`db` 从 `repositories/access.ts` 导出）
    gateways/     外部 HTTP
packages/         contracts / domain / server-kit / prisma
tools/            configs / scripts
docs/             architecture/ 内部约定；vendors/ 厂商与解析说明
```

## Web

- 单 feature 专属请求放 `features/<f>/api/`，跨 feature 放 `shared/api/`。
- `shared/` 不得 import `features/`。画布状态由 `features/canvas/store/registerCanvasWorkspace.ts` 注册进 `shared/workspace/canvasWorkspace.ts`。
- 提示条 UI 与逻辑统一在 `shared/prompt-bar/`。
- 多角度弹窗统一在 `shared/modals/multiAngle/`；点阵背景统一在 `shared/media/DotGrid`（`variant: 'ambient' | 'canvas'`）。
- `features/canvas/store/` 仅服务画布局部状态，不要把全局切片放进去。

## 工坊目录（整改后）

```text
features/workshop/
  api/workshopResources.ts        工坊资源加载与资源请求适配
  components/                     业务界面与交互组件
  hooks/                          React 生命周期、状态、自动保存和流程组合
    useLiveWorkshopWorkspace.ts   React 与工作区快照的连接
  model/
    batchTypes.ts                 阶段间共享类型
    collection/                   商品采集、输入、图片选择
    analysis/                     分析预检、任务排队、结果格式化
    generation/                   准备检查、提交、轮询、重试、结果恢复
    delivery/                     文案、矩阵与 ZIP 导出
    workspace/                    作业状态、失效规则、快照、恢复与运行控制
      workshopSnapshot.ts         独立快照映射，不包含 React hook
```

测试与被测实现相邻，不再依赖根脚本手工维护测试 glob。目录分组不意味着状态机重写或后端持久编排已经完成。

### 新文件放哪里

| 内容 | 位置 | 不应放到 |
| --- | --- | --- |
| 单个功能的接口适配 | `features/<feature>/api` | 通用 UI 目录 |
| React 生命周期、订阅、状态组合 | `features/<feature>/hooks` | 工坊 model |
| 工坊阶段逻辑 | 对应 `model/<职责>` | 再造一个万能 runner 文件 |
| 跨功能的资产请求缓存 | `shared/api/assetLibraryCache.ts` | assets 私有工具目录再被工坊引用 |
| 浏览器与服务器共用的纯规则 | `packages/domain` | Node-only server-kit |
| 请求/响应校验契约 | `packages/contracts` | 混有业务编排的组件 |
| 数据库查询 | `apps/api/src/repositories` | route 直接导入 Prisma |
| 开发与校验脚本 | `tools/scripts/<用途>` | 新建独立 workspace |

仍保留经过审核的 `workshop -> assets`、`assets -> canvas` 两条 UI 复用边界；这不是已经彻底消除跨功能耦合。新增跨功能引用应先考虑下沉最小共享能力，不要扩充例外清单。

## API

- JSON 路由经 `core/handler.ts` 的 `mountJson` / `asJsonRoute` 统一 try/catch 与 `{ success, error, code }` envelope。
- 二进制 / 流式例外：`system/local-media`、`system/proxy-image*`、`assistant/media`。
- 请求体走 `readJsonBody` + `parseJsonBody`；catch 块走 `safeErrorMessage`。
- 共享 Zod schema 放 `@beike/contracts`。

# 共享包归属与工作区决策

本项目保持 **2 个应用 + 4 个共享/数据包** 的轻量 pnpm workspace。monorepo 是源码协作方式，不意味着微服务，也不要求引入 Turborepo/Nx。

## 归属规则

| 工作区 | 职责 | 内部依赖 |
| --- | --- | --- |
| `apps/web` / `@beike/web` | React 浏览器界面与应用组合 | contracts、domain |
| `apps/api` / `@beike/api` | Hono 路由、业务服务、数据访问 | contracts、domain、server-kit、prisma |
| `packages/contracts` / `@beike/contracts` | Zod 请求/响应 DTO；不承载业务实现 | 无 |
| `packages/domain` / `@beike/domain` | browser-safe 纯规则、类型、模型请求拼装、工坊生产规则 | 无 |
| `packages/server-kit` / `@beike/server-kit` | Node-only 存储、鉴权、爬虫、媒体处理、assistant runtime | domain、prisma |
| `packages/prisma` / `@beike/prisma` | schema、迁移与客户端生成入口 | 无 |

直接依赖 Node 原生、Prisma、sharp、AWS、QuickJS 的实现不得进入 Web/domain/contracts。仅 Web 共用的 UI、缓存和 hooks 放 `apps/web/src/shared`，不要因为“共用”就强行放入 domain。

## 为什么不直接取消 monorepo

| 方案 | 适用收益 | 对本仓库的代价 | 结论 |
| --- | --- | --- | --- |
| 单 package + client/server/shared | manifest 数量减少 | 浏览器与 Node 依赖混装，包边界变成约定；需改构建、部署、别名和迁移入口 | 当前不采用 |
| 多仓库 | 团队、版本和发布完全独立 | DTO/domain 同步、联调及原子修改成本上升 | 当前不采用 |
| 大量 feature 微包 + 编排框架 | 独立发布与缓存粒度更细 | 当前没有对应需求，增加目录和工具负担 | 不采用 |
| 保留六个工作区，整理功能内部职责 | 保留真实运行边界与同仓原子修改 | 仍需维护少量 manifests，并持续执行边界检查 | 本轮落地 |

这不是永久不可变的决定。只有出现独立团队/发布周期或可测量的构建瓶颈，才重新评估多仓或任务编排框架；没有这些条件时，优先拆分巨型编排器和隐藏耦合。

## 执行规则

- 内部依赖必须是 `workspace:*`；`pnpm run check:workspaces` 验证名称、私有性、允许依赖及源码使用的内部运行时依赖声明。
- Web 仅依赖 domain/contracts；packages 不得反向依赖 apps；contracts 不引入 domain 的业务实现。
- `pnpm run lint:boundaries` 检查 import、re-export、import type、字面量动态 import 和 require。非字面量动态加载仍需人工审查。
- 深导入使用包的公开出口，例如 `@beike/domain/drawing`；避免包根 barrel 意外拉入全部实现。
- `sceneBundle` 的纯逻辑留 domain，带 Prisma 的回填放 server-kit；assistant sandbox/runtime 留 server-kit。
- 迁移和种子不是“没有 import 的垃圾”。数据库与备份不是源码，也不能随包重排自动搬移或删除。

详见 [目录放置规则](layout.md) 与 [本轮核查报告](repository-architecture-audit-2026-09-24.md)。

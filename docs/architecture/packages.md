# 共享包归属

直接依赖 Node 原生 / Prisma / sharp / AWS / QuickJS 的模块，以及仅服务端使用的爬虫 / 鉴权 / assistant runtime，归入 `@beike/server-kit`；其余纯逻辑与 Web 共用类型归入 `@beike/domain`。

## 归属规则

| 包 | 内容 |
|----|------|
| `@beike/domain` | vision / drawing / prompt-engine / workflowModels / productCategory / modelAdapters（纯请求拼装）/ assistant 类型与 skills / taskPolicy / upstreamErrors 等 |
| `@beike/server-kit` | prisma / storage* / sharp 相关 / scrapers / apiAuth / mediaSign / desktopEnvFile / assistant agentLoop·runtime·sandbox / videoDeconstruct / faceObfuscate / persist* |
| `@beike/contracts` | Zod DTO（自 `packages/contracts` 迁入） |

## 特殊处理

- `sceneBundle.ts`：纯函数与类型留在 domain；`backfillActionSceneLinks`（Prisma）迁入 server-kit。
- `assistant/codeSandbox` 与依赖它的 `agentLoop*` / `agentRuntime` / `mcpBridge` / `subAgent` / server tools → server-kit。
- Web 仅允许依赖 `@beike/domain` 与 `@beike/contracts`。

## 物理路径

```text
packages/domain      → @beike/domain
packages/server-kit  → @beike/server-kit
packages/contracts   → @beike/contracts
```

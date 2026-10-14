# 目录与分层

项目只使用根依赖清单；以下目录均为源码分层，不是独立包。

## 一级职责

| 目录 | 内容 |
| --- | --- |
| `src/client` | 浏览器端 React UI、业务交互与状态 |
| `src/backend` | Go 入口。对外 API、静态页、存储读取、数据库迁移和官方种子 |
| `src/shared` | 前后端共享的契约、纯规则与 JSON 数据 |
| `database` | 历史 SQL 档案；本地数据库与备份不提交 |
| `src/client/public` | 按原路径提供的公开图片、品牌与灵感资源 |
| `tools/configs` | TypeScript、ESLint、依赖边界和质量基线 |
| `tools/scripts` | `web` 启动、`quality` 检查、`depth` 环境、`db-maintenance` 数据维护和种子导出 |
| `tools/deploy` | 服务与反向代理模板、服务器安装入口 |
| `tools/build/ui` | 自动生成的前端产物，不提交 |
| `api` | OpenAPI 契约，前后端接口的唯一来源 |
| `docs/deployment.md` | 部署与运维说明 |
| `docs` | 当前架构、产品操作和厂商接口 |

根目录仅保留入口和项目配置。依赖 `node_modules`、构建结果 `tools/build/ui` 由工具生成。

macOS 根目录入口 `启动贝壳云图.command` 调用 `tools/scripts/web/dev-web.mjs`，由同一流程启动本地 API 与 Vite；只复用启动器记录且 PID、启动时间、工作目录和配置匹配的本项目开发服务。未记录的端口占用需先关闭对应启动终端，启动器不会按端口或模糊进程名停止服务。它是浏览器版的入口，不依赖已停用的桌面端。

日常入口保留历史用户数据目录与访问令牌，不迁移或复制已有库。代码验证可运行 `BEIKE_ISOLATED_DEV=1 pnpm dev:web`：默认使用用户数据目录下的 `development/`、独立令牌、API 空闲端口和 UI `5174`；不读取根 `.env`、旧根令牌或日常 API 端口缓存。可显式指定 `AZHUO_DATA_DIR`，应选择独立目录。隔离与日常模式的 PID 记录分别保存在本项目 `.local/`；新库仅由同一版本化运行时迁移链初始化，不复制 `database/dev.db`。

`database/migrations/` 留存历史 SQL，不参与新库初始化。当前运行的版本化迁移在 `src/backend/internal/platform/database/migrate`，由 `beike-api migrate` 执行。`dev.db` 与同名的 `-wal`、`-shm` 是同一开发数据库的文件组，不能拆开整理。备份写在数据库文件旁边的 `database-backups/`；本地开发库对应 `database/database-backups/`，旧的 `backups/` 已完整归档到其中的 `legacy-20260920/`，备份文件没有删除。生产数据库及其备份位于配置的数据目录，不要求搬入仓库。

## 浏览器端

```text
client/
  app/                       应用组装与 Provider
  features/<功能>/
    components/              业务组件与弹窗
    hooks/                   React 状态、订阅与流程组合
    api/                     当前功能专属请求
    model/                   纯规则、转换、校验与类型
    store/                   画布局部状态
    views/                   工坊视图
    engine/                  生成引擎的阶段实现
  shared/                    跨功能 UI、图标、请求、媒体、工具、提示词输入与弹窗
  store/                     全局 Zustand 切片和持久化
  assets/                    随构建打包的资源
  public/                    原 URL 提供的公开素材，不改变访问链接
  styles/                    全局样式
  types/                     跨功能类型
```

功能根目录保留页面入口与功能样式；其余按实际职责分类，不为空职责建立目录。组件很多时按前缀再分子目录，例如工坊的 `stage / history / settings / product`，画布的 `editor / prompt / stage / video`。助手组件按 `message / panels / brand-kit` 分组，抽屉和按钮留在 `components`。首页 `data/` 是首页展示数据，设置 `tabs/` 是设置页签。灯箱在 `app/lightbox`，全局右键菜单在 `app/context-menu`。

`shared/media/widgets` 放轮播、点阵、文件夹和封面组件；下载、缓存、裁切和缩放留在 `media`。`shared/api/generation` 放生图提交、中止、错误、恢复、深度任务和回退顺序。

工坊 `model/` 再按 `collection / analysis / generation / delivery / workspace` 分组；React hook 不进入 model。采编、视觉分析和生图状态由 `workshop/hooks` 的独立 hook 协调。画布的导入、几何、图层和任务规则在 `canvas/model`；设置的模型目录、报价、存储和连接状态规则在 `settings/model`。

## 对外 API

`pnpm dev`、`pnpm start` 与 `启动贝壳云图.command` 编译 `src/backend/cmd/api`，由 Go 监听 API、静态页和存储读取。启动时在进程内执行 `internal/platform/database/migrate`：校验 `_BeikeMigration` 的版本和 checksum，有待执行版本时先备份再写入，然后同步官方种子。

```text
backend/
  cmd/api/                   进程入口
  internal/app/              路由装配、鉴权中间件、静态页
  internal/httpx/            JSON、工作区、数据库连接、反向代理
  internal/config/           进程配置
  internal/system/           系统配置、网关、模型目录、报价、深度环境、媒体待核
  internal/catalog/          类目、商品、提示词、风格、采集
  internal/library/          素材库、审核、查重、母组、反推任务
  internal/assets/           存储、生图任务、素材生命周期与表现
  internal/generate/         图片、视频、分析、文案与画布文字；depth、headline、export 是子包
  internal/workshop/         工坊批次与输出审核
  internal/assistant/        会话、回合、文档抽取与沙箱
  internal/keywordreview/    关键词审核与提交保护；review 子包做提示词、结果校验与补救
  internal/modelgw/          上游模型提交
  internal/platform/collect  采集上游请求与响应
  internal/platform/database 连接与共用工具；library / catalog / workshop 子包按领域访问数据；migrate 做版本化迁移、checksum、备份与官方种子
  internal/platform/media    图片地址规范化
  internal/platform/mediasign 媒体读取签名
  internal/platform/network  出站拨号与私网拦截
  internal/platform/storage  本地与对象存储路径
```

`GET /api/health`、模型报价、深度环境、本地存储统计和派生缓存清理、本地媒体读取、未开启云存储时的媒体上传、存储配置不完整时的连通性检查和迁移拦截、内存与 WAL 清理、媒体待核列表、系统配置读取和连通性测试、网关账户额度、模型目录拉取、关键词审核规则、提示词记录、类目列表和类目迁移预览、类目迁移写入、风格配方的列表、新建、修改、恢复、删除和官方预置导入，商品的读取、保存、修改和删除、商品采集、生图任务列表和删除、素材来源查重结果和链接查重、反推审核的列表、驳回和恢复、素材库组织视图、穿搭动作人物场景和完整提示词详情、一次返回全部类型的素材列表和全量导出、按编号删除、素材修改、素材新建（场景、穿搭、动作、人物、完整提示词）、批量导入素材、审核记录、换图记录、商品品类和图集、种子清理、按类型清空、去重提纯和清空当前工作区、品类排序、品类保存、图集归类、素材归类、母组移动和文件夹归档、文件夹规则保存、规则导入和细分文件夹保存、母组换图状态、后台反推任务查询、素材表现，由 Go 直接处理。未登记的 `/api` 返回不存在。系统配置里的模型清单和类目默认值来自 `src/shared/data`。类目读取包含当前工作区与官方类目。

工坊工作区、参考文件上传和生图任务列表由 Go 直接处理。深度图片、深度视频、反推请求、后台反推的提交与停止、反推进度，以及审核通过和换图，由 Go 直接处理。深度图和深度视频调用本机 Python 与 ffmpeg。后台反推在进程内派发；服务重启后未完成任务只标记中断，不自动重放付费请求。

助手回合、会话、文档抽取、图像反推、视频规格检查和抽帧已在 Go 中处理。抽帧使用 ffmpeg，并把画面作为下一轮视觉上下文，单轮最多 20 张、合计 5MB。请求体里的 `mcpServers` 通过 HTTP JSON-RPC 接入，工具名带 `mcp_` 前缀，调用需要审批。`spawn_subagent` 在当前回合内最多再跑 2 轮，且不能再拆子任务。`POST /api/catalog/assets/seed` 返回「官方预置资产已禁用」；风格官方预置走 `POST /api/catalog/styles?action=seed`。官方资产种子在启动迁移后按缺失项补齐。

## 共享代码

```text
shared/
  contracts/                 Zod DTO、请求响应校验
  data/                      前后端共用的 JSON：主机后缀、官方种子
  domain/
    assistant/               助手类型、技能、强度与执行规则
    assets/                  资产分类、编辑、采样、解构与场景组合
    collection/              采集来源规则
    core/                    运行环境注入、并发池、任务状态与耗时
    media/                   绘图、视频与深度类型
    models/                  模型目录、厂商、网关与调用适配器
    products/                商品品类、属性、品牌和保真规则
    prompts/                 提示词引擎、资产评分、视觉规则与业务技能
    workshop/                工坊状态机、事件、门禁与镜头规则
```

`client/shared` 只在浏览器使用；`src/shared` 同时服务前后端。共享业务规则不能依赖 Node、React 或某个前端功能。跨层使用 `@client/* / @server/* / @shared/*` 别名。

## 功能导航

路径相对于 `src`。

| 功能 | 前端 | 后端主要实现 |
| --- | --- | --- |
| 首页与灵感 | client/features/home | backend/internal/catalog |
| 图片/视频生成 | client/features/generate | backend/internal/generate |
| 无限画布 | client/features/canvas | backend/internal/generate、catalog |
| 资产与反推 | client/features/assets | backend/internal/library、assets |
| 采集 | client/features/collect | backend/internal/catalog、platform/collect |
| 种草工坊 | client/features/workshop | backend/internal/workshop、catalog |
| 大字报封面 | client/features/headline-poster | backend/internal/generate |
| 关键词审核 | client/features/keyword-review | backend/internal/keywordreview |
| AI 助手 | client/features/assistant | backend/internal/assistant |
| 设置与模型 | client/features/settings | backend/internal/system |

## 文件生命周期

- 长期源码、资源、接口文档和部署工具放入对应目录。
- 正式测试保留在源码旁边：`*.test.ts` 与 Go 的 `*_test.go`。不保留 QA fixture、截图、一次性核查结果和 Agent 计划；临时验证放项目外。
- `.agents/skills`、`.cursor/rules`、`AGENTS.md` 是长期技能和工程规则，保留。
- 数据库、迁移、种子、密钥、备份和用户素材具有运行或恢复用途，不能按“没有 import”删除。
- 未引用源码先核查入口、动态加载和样式关联；只对确认不使用的模块做清理。
- `pnpm check` 执行静态检查、单元测试和构建。既有质量基线只允许收紧。

## 整理后的运行路径

- 所有命令仍在根目录执行；不创建子 package，也不移动 node_modules。
- Vite 从 `src/client/public` 读取公开素材，浏览器中的 `/app_logo.png`、`/inspirations/...` 等 URL 不变。
- 构建输出到 `tools/build/ui`；生产启动器默认读取同一目录。`pnpm clean` 只清除该构建目录。
- 已部署环境如显式配置 `WEB_DIST_DIR`，更新为部署根目录下的 `tools/build/ui`，并同步 Nginx 静态路径；重新构建后再重启服务。
- 根目录不再放 `public`、`deploy`、`dist`，目录检查会阻止这些旧目录重新出现。
- 数据库、备份、`.env*` 和 `.local` 保持原位；目录整理不执行数据迁移。

## 模块职责与依赖边界

贝壳云图使用一个根依赖清单与锁文件。以下都是源码目录，不是独立 npm 包，不拥有版本、安装或构建流程。

| 模块 | 职责 | 可依赖的内部模块 |
| --- | --- | --- |
| client | React 界面、浏览器交互与状态 | shared/contracts、shared/domain |
| backend | 对外 HTTP、迁移、官方种子、SQLite 访问与上游调用 | shared 的 JSON 数据；不引用 client |
| shared/contracts | 请求/响应契约、Zod 校验 | 无业务实现 |
| shared/domain | 纯规则、模型适配、提示词、类型与种子 | 不依赖 UI、Node 或其他运行层 |
| database | 历史 SQL 档案 | 运行时迁移由 `src/backend/internal/platform/database/migrate` 执行 |

根 tsconfig 和 Vite 映射 `@client/*`、`@server/*`、`@shared/*`。Node 由 tsx 加载同一套别名；Vite 只配置前端允许使用的别名。

`pnpm run check:structure` 禁止嵌套 manifest、workspace 依赖和遗漏外部依赖声明。`pnpm run lint:boundaries` 检查静态 import、re-export、类型 import、字面量动态 import 和 require；`pnpm run lint:deps` 将依赖循环作为错误；ESLint 同时限制浏览器导入服务端依赖。`pnpm run typecheck:client` 不载入 Node 全局类型。Go 检查由 `pnpm run check:go` 执行。非字面量动态路径仍需人工复核。

前端公共代码不反向导入 features；功能之间不直接相互导入；跨功能组合由 app 负责。数据库迁移在 `src/backend/internal/platform/database/migrate`。工坊契约只解析快照格式；`src/shared/workshopSnapshot.ts` 组合契约与纯业务状态规则，升级旧快照。`pnpm db:migrate` 与 `pnpm db:deploy` 共用运行时的 `_BeikeMigration` 迁移链，历史 Prisma SQL 不参与新库初始化。

源码文件按职责拆分，单文件上限为 400 行有效代码（不计空行与注释）。文件长度基线已清空，不再保留超长文件豁免；未使用绑定和依赖边界基线只能收紧。

## 任务提交与恢复

工坊以已确认保存的批次快照作为提交依据：生成计划、每次提交的标识和参数先保存；收到上游任务 ID 后再次保存，才进入轮询。保存期间输入、配置或批次变化会阻止新提交，保存失败保留现有恢复标识。资产列表由同一 React Query 缓存承载。

助手先在当前工作区原子领取 turnId，再执行模型和工具。重复请求只查询或回放原任务；同一标识对应不同输入或凭据返回冲突。请求指纹只存摘要，私有领取信息不进入公共快照；结果条目保存后才写终态。浏览器在发送前保留最小恢复回执，断线或中断后继续核对同一任务。

视频由请求契约校验参数，`src/backend/internal/generate` 编排模型规则和记录并写入数据。上游结果分为已接收、明确拒绝与待核实；仅 404、405、415 允许尝试另一提交端点，超时、5xx 和缺少任务 ID 的响应不会自动再次提交。

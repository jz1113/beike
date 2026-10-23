# 目录与分层

本页描述当前实际目录与依赖方向。项目使用一个根 Node package 和一个根 Go module，源码分层不具有独立安装、版本或发布流程。

## 一级归属

| 位置 | 职责 |
| --- | --- |
| `src/client` | React 浏览器界面、交互、状态和公开资源 |
| `src/backend` | Go API、业务编排、数据库访问、运行时迁移与官方种子 |
| `src/shared/contracts` | Zod DTO、请求响应校验与 `openapi.yaml` |
| `src/shared/domain` | 浏览器安全的纯规则、模型适配、提示词与业务类型 |
| `src/shared/data` | 前后端共用的 JSON 数据与官方种子 |
| `database` | 历史 SQL 档案；本地数据库和备份不提交 |
| `tools/configs` | 本地环境模板、Vite、TypeScript、Vitest、ESLint、依赖边界与质量基线 |
| `tools/scripts` | `web` 启动与产物清理、`quality` 检查、`depth` 环境、`db-maintenance` 数据维护 |
| `tools/launchers` | Windows / macOS 启动器实现 |
| `tools/deploy` | 服务与反向代理模板、服务器安装入口 |
| `tools/build` | 自动生成的 API 可执行文件和 `ui` 前端产物 |
| `docs` | 当前架构、产品规则、模型接入与运维文档，文件直接放在本目录 |

根目录保留 `package.json`、`pnpm-lock.yaml`、`go.mod`、`go.sum`、`tsconfig.json`、`jsrepo.config.mts`、README、AGENTS 和 Windows 双击入口 `启动贝壳云图.bat`。Node 依赖只声明在根 package.json；jsrepo 配置保留其默认发现位置。`node_modules` 由安装生成。PowerShell 与 macOS 启动器直接位于 `tools/launchers`；Windows 批处理入口转交 PowerShell，不再维护重复的 Windows 实现。

前端 HTML 位于 `src/client/index.html`，Vite 配置位于 `tools/configs/vite.config.ts`，OpenAPI 位于 `src/shared/contracts/openapi.yaml`。环境模板统一放在 `tools/configs/env.example`，首次启动复制到根目录 `.env`；已有 `.env` 保持原位。启动和构建命令显式选择 Vite 配置，根目录不保留第二份入口或接口目录。

`.agents/skills`、`.cursor/rules`、`.github/workflows` 与 `.vscode` 保存技能、工程规则、CI 和编辑器配置。`.local` 保存本机工具状态、进程记录、端口缓存、凭证与备份，不存放产品源码。

## 浏览器端

```text
src/client/
  index.html                 HTML 入口
  main.tsx                   React 启动入口
  app/                       应用组装、Provider、导航与全局交互
    lightbox/                全局灯箱及编辑动作
    context-menu/            全局右键菜单
  features/<功能>/
    components/              业务组件，组件多时再按用途归组
    hooks/                   React 状态、订阅与流程组合
    api/                     当前功能专属请求
    model/                   规则、转换、校验与业务类型
  shared/                    跨功能的浏览器能力
  store/                     全局 Zustand 切片与持久化
  assets/                    随构建打包的资源
  public/                    按原 URL 提供的图片、品牌和灵感素材
  styles/                    全局样式
  types/                     浏览器公共类型
```

功能根目录放页面入口、对外导出与功能样式。按实际需要建立职责目录：画布另有 `store`，生成引擎另有 `engine`，工坊另有 `views`，首页另有 `data`，设置另有 `tabs`。不为没有实现的职责创建空目录。

### 组件归组

以下路径相对于 `src/client/features/<功能>/components`。分类目录直接存放实现文件，已有 index.ts 只作为导出入口，不能用向上转发代替实际归类；功能内部优先直接导入所需文件。

| 功能 | 子目录 | 内容 |
| --- | --- | --- |
| `assets` | `cards` | 任务、提示词、原子资产卡片与图组预览 |
| `assets` | `dialogs` | 详情、编辑、新建、标签与提示词弹窗 |
| `assets` | `filters` | 列表筛选、工具栏与标签选择 |
| `assets` | `deconstruct` | 图集导入、反推弹窗和后台任务通知 |
| `assets` | `folders` | 文件夹规则、分类、移动、菜单与细分技能面板 |
| `assets` | `library` / `material` | 提示词资产库 / 素材项目与素材库视图 |
| `settings` | `providers` / `vendors` | 自定义服务商 / 具体厂商接入面板与展示数据 |
| `settings` | `models` / `modality` | 模型目录、报价、回退顺序 / 模态家族与同步 |
| `settings` | `storage` / `creator` / `appearance` | 存储配置 / 创作档案 / 主题、背景和语言 |
| `canvas` | `editor` / `nodes` | 编辑器、连线、图层、富文本 / 各类画布节点 |
| `canvas` | `tools` / `projects` | 打光、拆图、导入和模型选择 / 项目与首页列表 |
| `canvas` | `prompt` / `stage` / `video` / `storyboard` | 提示词输入 / 舞台 / 视频 / 分镜 |
| `workshop` | `layout` | 顶栏、侧栏、批次控制、保存通知与共享操作上下文 |
| `workshop` | `stage` / `product` | 各流程阶段 / 商品选择与参考图展示 |
| `workshop` | `settings` / `delivery` / `history` | 生成配置 / 成图、进度、审核与交付 / 历史批次 |
| `assistant` | `message` / `panels` / `brand-kit` / `document` / `skill` | 对话消息 / 功能面板 / 品牌 / 文档 / 技能 |

资产中心 `AssetCenter`、工坊组装组件 `BatchWorkshopView`、设置通用的 `SettingsControls / SettingsSidebar / SettingsPreview` 留在各自 components 根目录。只在本功能使用的共用组件无需提升到全局 shared。

工坊 model 按 `collection / analysis / generation / delivery / workspace` 分组。画布的几何、导入、图层、图关系和任务规则放在 model；节点类型和打光参数由 model 导出，hook 直接引用。设置默认模型在 `settings/model/presetModels.ts`；服务商图标与展示数据属于 components。

### 浏览器共享能力

- `shared/api` 提供统一鉴权请求和缓存；`shared/api/generation` 放提交、中止、恢复、深度任务与回退顺序。
- `shared/ui`、`shared/icons`、`shared/hooks` 放跨功能组件、图标和 hook；`shared/ui/markdown` 放 Markdown 渲染，`shared/ui/studio` 放全屏工作台外壳。
- `shared/media` 放下载、缓存、裁切、缩放与媒体处理；`shared/media/widgets` 放封面、文件夹、点阵和背景组件。
- `shared/agent` 放助手回合事件、素材映射、编辑草稿、提交回执与并发偏好，供助手和生成页共用。
- `shared/skills` 统一技能列表、详情与编辑；`shared/prompt-bar` 放跨功能的提示词输入。
- 商品采集的图片合并、来源识别与分类去重放在 `src/shared/domain/collection`，规则见 [product-collection.md](product-collection.md)。

### 功能导航

前端功能路径相对于 `src/client/features`，后端路径相对于 `src/backend/internal`。功能目录优先使用一个常用英文词；封面、关键词、PPT、带货分别记作 `poster / keywords / ppt / sales`。相同业务沿用相同名称，共用后端能力按实际归属列出。

| 功能 | 前端 | 后端 |
| --- | --- | --- |
| 首页 | `home` | `catalog` |
| AI 生成 | `generate` | `generate` |
| 画布 | `canvas` | `generate`、`catalog` |
| 资产库 | `assets` | `assets`、`library`、`catalog` |
| 设置 | `settings` | `system` |
| AI 助手 | `assistant` | `assistant` |
| 电商工坊 | `workshop` | `workshop`、`catalog`、`platform/database/learning` |
| 封面生成 | `poster` | `generate/poster` |
| 关键词审核 | `keywords` | `keywords` |
| 内容采集 | `collect` | `catalog`、`platform/collect` |
| PPT 生成 | `ppt` | `generate/ppt`、`generate/export` |
| 数字人 | `avatar` | `avatar` |
| 带货视频 | `sales` | `generate/sales` |
| 技能 | `skills` | `catalog`、`platform/database` |

页面入口统一为 `PosterStudio / KeywordsStudio / PptStudio / SalesStudio`。带货的共享业务规则位于 `src/shared/domain/sales`，模型协议适配位于后端 `gateway`。

目录名用于源码定位。浏览器视图参数、HTTP 接口地址、草稿存储键与数据库标识保持原有兼容形式，已有链接和工作记录继续可用。

产品操作与恢复规则分别见 [assistant-runtime.md](assistant-runtime.md)、[video-sales.md](video-sales.md)、[workshop-asset-binding.md](workshop-asset-binding.md) 与 [workshop-reference-generation.md](workshop-reference-generation.md)。

## Go 后端

`src/backend/cmd/api` 是进程入口。`pnpm dev`、`pnpm start`、双击启动器和数据库维护命令均使用同一套 Go API 与运行时迁移。

| 领域包 | 职责 |
| --- | --- |
| `internal/app` | 路由装配、鉴权中间件与静态页面 |
| `internal/config` / `internal/httpx` | 进程配置 / HTTP、工作区与公共请求工具 |
| `internal/system` | 系统设置、网关与模型目录、报价、深度环境、存储管理和桌宠 |
| `internal/catalog` | 类目、商品、风格、技能与采集入口 |
| `internal/library` / `internal/assets` | 素材库、图组、查重与反推 / 存储、生图任务与素材生命周期 |
| `internal/generate` | 图像、视频、分析、文案、语音与画布任务编排 |
| `internal/generate/{depth,poster,ppt,export,sales}` | 深度推理、封面设计、PPT、文件导出、带货视频子包 |
| `internal/workshop` / `internal/keywords` | 工坊批次与输出审核 / 关键词审核与提交保护 |
| `internal/assistant` | 回合、记忆、沙箱、工具与运行时；`extract` 抽取文档，`sessions` 读写会话 |
| `internal/avatar` | 数字人驱动与配音流程 |
| `internal/gateway` | 模型协议、提交适配与文本流式处理 |
| `internal/platform/collect` | 采集上游请求与响应 |
| `internal/platform/database` | 数据库连接、工具与按领域拆分的数据访问；`migrate` 负责版本化迁移与官方种子 |
| `internal/platform/{media,mediasign,network,storage}` | 媒体地址、读取签名、出站网络、本地与对象存储 |

Go 的同目录文件共同组成一个包，共享未导出类型。领域包内按文件前缀定位职责，例如 `generate/image_*.go`、`generate/video_*.go` 与 `gateway/text_*.go`；拆子包须先具备独立职责和稳定依赖，避免仅为减少文件数扩大导出接口。

当前 gateway 的模态入口是 `video_submit.go`、`audio_submit.go`、`avatar_submit.go`、`threed_submit.go` 与 `multimodal_submit.go`，公共提交在 `submit.go / adapter.go`，文本协议在 `text_*.go`。图像和视频部分上游协议仍与 generate 任务编排相邻；不存在独立的 `gateway/image` 等目录，也没有单独的 dispatcher.go。接入新模型先复用现有适配入口，厂商文档见 [models.md](models.md)。

路由修改后执行 `pnpm openapi:write`，更新共享 OpenAPI 和 `src/client/shared/api/openapi-types.ts`。Go 契约测试及 `pnpm check:openapi` 校验路由覆盖和生成类型。未登记的 `/api` 请求返回不存在。

## 共享层与依赖方向

| 模块 | 可以依赖的内部能力 |
| --- | --- |
| `client/app` | 功能模块、浏览器 shared、全局 store 与共享业务层 |
| `client/features/<功能>` | 本功能、浏览器 shared、store、shared/contracts 和 shared/domain |
| `client/shared` | 浏览器共用能力与 shared；不能反向引用 features |
| `client/features/*/model` | 规则与类型；不能引用功能 components、hooks 或 views |
| `shared/contracts` | 契约校验；不承载业务编排、不依赖 domain |
| `shared/domain` | 纯规则、模型适配与运行环境注入；不依赖 contracts、React、Node 或 client/backend |
| `backend` | Go 内部领域与基础能力，以及共享 JSON 的嵌入副本；不引用 client |

浏览器使用 `@client/*` 与 `@shared/*` 别名；Go 使用根 go.mod 的模块路径。client/shared 禁止引入 backend、Node 原生模块、Prisma、sharp 和 AWS SDK。不同 feature 之间不直接导入，由 app 组装；跨功能复用下沉最小公共能力，依赖豁免不能扩充。

`src/shared/workshopSnapshot.ts` 组合契约与业务规则，承担旧快照适配，避免让 contracts 与 domain 相互引用。`src/shared/data` 保存官方种子与主机规则；`textModelCapabilities.json` 位于 domain/models，由共享数据检查生成并校验 Go gateway 的嵌入副本。

domain 的子目录包括 `assistant / assets / collection / core / media / models / pets / products / prompts / sales / settings / skills / workshop`。其中 core 放环境注入、并发池和任务状态；models 放模型目录与调用适配；业务提示词、技能和工坊规则分别放入 prompts、skills 和 workshop。

## 运行、构建与数据

- `pnpm dev` 启动 Go API 与 Vite，`pnpm dev:ui` 仅启动 Vite。HTML 根是 `src/client`，环境配置目录是仓库根，公开资源来自 `src/client/public`。
- 所有入口共用 `tools/configs/vite.config.ts`；`pnpm build:ui` 输出到 `tools/build/ui`，`pnpm start` 由 Go 托管同一产物。部署模板和 `WEB_DIST_DIR` 指向该目录。
- `/app_logo.png`、`/inspirations/...` 等公开 URL 保持稳定。组件迁移同步更新静态导入、动态加载、样式路径与质量基线中的文件路径。
- Windows 根目录 `.bat` 只调用 `tools/launchers/启动贝壳云图.ps1`；macOS 使用 `tools/launchers/启动贝壳云图.command`，两个实现都定位到仓库根目录运行。开发端口写入 `.local/api-port`，兼容读取旧 `.local-api-port`；隔离端口写入 `.local/isolated-api-port`。
- 日常与隔离模式的进程记录分别放在 `.local/web-processes.json` 和 `.local/isolated-web-processes.json`。只操作 PID、启动时间、工作目录和配置匹配的已记录进程，不按端口或模糊名称停止服务。迁移前的 Vite 记录会在下次启动时核对并替换为新配置。
- PowerShell 验证隔离数据模式：设置 `$env:BEIKE_ISOLATED_DEV="1"` 后运行 `pnpm dev:web`；可再设置独立的 `AZHUO_DATA_DIR`。隔离模式使用独立令牌、API 空闲端口和 UI 5174，不能指向日常用户数据目录。
- `pnpm clean` 仅清除 `tools/build/ui`；`pnpm clean:all` 还清除 node_modules。跨平台清理脚本固定目标并检查实际路径位于仓库内。

日常启动沿用系统原有应用数据目录与访问令牌。新库由 `src/backend/internal/platform/database/migrate` 初始化；启动时校验 `_BeikeMigration` 版本与 checksum，待迁移时先备份，再执行迁移并同步官方种子。`beike-api migrate`、`pnpm db:migrate` 和 `pnpm db:deploy` 使用同一迁移链。

启动迁移和 HTTP 请求使用相同的数据库路径解析，兼容 Windows 原生 `file:C:\...`、相对路径和文件 URI。迁移失败时 API 停止启动，不向页面暴露底层 SQL 错误。新增迁移追加版本，不能改写已发布 SQL 的 checksum。

二级类目智能体的数据读取、记忆、经验与版本切换集中在 `src/backend/internal/platform/database/learning`；`catalog/category_skill_*` 负责模型观察、候选整理和接口。浏览器的 `assets/model/categoryAgent.ts` 只做流程判断，组件分别呈现类目总览、学习记忆与技能版本。生成侧继续冻结实际使用的规则和对照输入，评分由 `workshop` 写回同一学习域。本地原图进入模型的转换能力放在 `platform/media`，反推和类目观察共用，不重复实现文件读取。

`database/migrations` 保存历史 SQL，不参与新库初始化。数据库主文件和同名 WAL/SHM 是一组运行文件。快照放在数据库旁的 `database-backups`，本地开发库对应 `database/database-backups`；已有归档、备份和用户素材保持原位。生产数据位于配置的数据目录，无需搬入仓库。备份与恢复见 [deployment.md](deployment.md)。

工坊生成计划、提交标识与上游回执须先保存再轮询，保存失败时保留恢复信息；助手按当前工作区原子领取 turnId，重复请求核对原任务。服务重启后未确认的付费生成或后台反推任务不自动重放，用户重新进入后核对原结果。具体恢复规则以各产品文档为准。

## 验证与文件生命周期

`pnpm check` 串行执行目录与单项目结构检查、模型目录、工坊契约、共享数据、OpenAPI、类型检查、ESLint、质量基线、依赖边界、循环与密钥检查、Go 格式/vet/测试、前端单元测试与生产构建。CI 使用同一命令。

- `check:root-layout` 限定根目录归属，检查 HTML/Vite/OpenAPI 的唯一位置、docs 平铺和组件实际分类。
- `check:structure` 禁止嵌套 package.json、workspace 依赖和未声明的外部依赖。
- `lint:boundaries` 校验静态导入、re-export、类型导入、字面量动态 import 和 require，并阻止 feature model 反向依赖功能界面。
- `lint:deps` 检查孤立模块与依赖循环；`typecheck:client` 不加载 Node 全局类型。
- 文件有效代码预算为 400 行。第三方背景组件仍有已审查的长度基线；未使用、显式 any、文件长度和依赖边界基线只允许收紧，目录迁移只更新对应路径。
- 正式测试留在源码旁，使用 `*.test.ts` 和 Go `*_test.go`。QA fixture、截图、一次性报告和 Agent 计划放项目外。
- `.env*`、`.local`、数据库及 WAL/SHM、备份、上传素材、迁移与种子具有运行和恢复用途；不能按忽略状态或 import 数量删除。

## 新功能接入

1. 在 `src/shared/contracts` 定义请求响应，在 domain 中定义需要复用的纯规则；两者保持独立。
2. 在现有 Go 领域包实现接口、数据访问和必要迁移；仅在职责独立时增加领域包。
3. 在 `src/backend/internal/app/routes.go` 装配路由与中间件，执行 `pnpm openapi:write` 同步契约。
4. 在 `src/client/features/<功能>` 建立页面和实际需要的 components、hooks、api、model；组件分类直接存放实现。
5. 在 `src/client/store/appView.ts`、`src/client/app/routes.ts`、`AppSidebar.tsx` 与 `App.tsx` 登记视图和按需加载；更新相关产品文档后运行 `pnpm check`。

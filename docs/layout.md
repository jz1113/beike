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
| `database` | 可选的已有本地数据库和备份，整目录不提交 |
| `tools/configs` | 本地环境模板、Vite、TypeScript、Vitest、ESLint、依赖边界与质量基线 |
| `tools/scripts` | `common` 工具链查找、`web` 构建/启动/产物清理、`quality` 检查、`depth` 推理与环境、`db-maintenance` 数据维护 |
| `tools/launchers` | Windows PowerShell 启动器实现，由根目录 `.bat` 调用 |
| `tools/deploy` | 服务与反向代理模板、服务器安装入口 |
| `tools/build` | 自动生成的 API 可执行文件和 `ui` 前端产物 |
| `docs` | 当前架构、产品规则、模型接入与运维文档，文件直接放在本目录 |

根目录保留 `package.json`、`pnpm-lock.yaml`、`go.mod`、`go.sum`、`tsconfig.json`、`jsrepo.config.mts`、README、AGENTS，以及 Windows 双击入口 `启动贝壳云图.bat` 和 macOS 双击入口 `启动贝壳云图.command`。Node 依赖只声明在根 package.json；jsrepo 配置用于引入背景组件，保留其默认发现位置。`node_modules` 由安装生成。Windows 批处理入口转交 `tools/launchers` 中的 PowerShell 实现；macOS 实现直接放在根目录并保留可执行权限，其他目录不保留启动器副本。

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

功能根目录放页面入口、对外导出与功能样式。按实际需要建立职责目录：画布另有 `store`，生成引擎另有 `engine`，电商图文另有 `views`，首页另有 `data`，设置另有 `tabs`。不为没有实现的职责创建空目录。

### 组件归组

以下路径相对于 `src/client/features/<功能>/components`。分类目录直接存放实现文件，功能内部直接导入所需文件；不保留没有调用方的聚合导出，不用向上转发代替实际归类。

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

资产中心 `AssetCenter`、电商图文组装组件 `BatchWorkshopView`、设置通用的 `SettingsControls / SettingsSidebar / SettingsPreview` 留在各自 components 根目录。只在本功能使用的共用组件无需提升到全局 shared。

素材库的平铺列表、项目计数与项目详情使用相同的素材合并和来源筛选规则。画布封面与空项目占位不作为独立素材；文字备注不计入素材数。“我上传的”只展示带独立上传标记的记录，生成任务的参考图字段不改变生成结果的来源。历史素材逐页加载并显示加载或重试状态；历史未完整读取时不能删除对话项目。批量操作只作用于当前可见的勾选项，筛选切换和删除后清理失效勾选。项目归属使用精确标识匹配，服务端确认素材删除成功后才移除本地对话项目；删除、下载与项目清理共享操作锁。

电商图文 model 按 `collection / analysis / generation / delivery / workspace` 分组。画布的几何、导入、图层、图关系和任务规则放在 model；节点类型和打光参数由 model 导出，hook 直接引用。设置默认模型在 `settings/model/presetModels.ts`；服务商图标与展示数据属于 components。

### 浏览器共享能力

- `shared/api` 提供统一鉴权请求和缓存；`shared/api/generation` 放提交、中止、恢复、深度任务与回退顺序。
- `shared/ui`、`shared/icons`、`shared/hooks` 放跨功能组件、图标和 hook；`shared/ui/markdown` 放 Markdown 渲染，`shared/ui/studio` 放全屏工作台外壳。
- `shared/media` 放下载、缓存、裁切、缩放与媒体处理；`shared/media/widgets` 放封面、文件夹、点阵和背景组件。
- `shared/agent` 放助手回合事件、素材映射、编辑草稿、提交回执与并发偏好，供助手和生成页共用。
- `shared/skills` 统一技能列表、详情与编辑；`shared/prompt-bar` 放跨功能的提示词输入。
- 商品采集的图片合并、来源识别与分类去重放在 `src/shared/domain/collection`，规则见 [product-collection.md](product-collection.md)。

### 功能导航

前端功能路径相对于 `src/client/features`，后端路径相对于 `src/backend/internal`。功能目录优先使用一个常用英文词；封面、关键词、带货分别记作 `poster / keywords / sales`。相同业务沿用相同名称，共用后端能力按实际归属列出。

| 功能 | 前端 | 后端 |
| --- | --- | --- |
| 首页 | `home` | `catalog` |
| AI 生成 | `generate` | `generate` |
| 画布 | `canvas` | `generate`、`catalog` |
| 资产库 | `assets` | `assets`、`library`、`catalog` |
| 设置 | `settings` | `system` |
| AI 助手 | `assistant` | `assistant` |
| 电商图文 | `workshop` | `workshop`、`catalog`、`platform/database/learning` |
| 封面 | `poster` | `generate/poster` |
| 词包 | `keywords` | `keywords` |
| 采集 | `collect` | `catalog`、`platform/collect` |
| 电商视频 | `sales` | `generate/sales` |
| 技能 | `skills` | `catalog`、`platform/database` |

页面入口统一为 `PosterStudio / KeywordsStudio / SalesStudio`。带货的共享业务规则位于 `src/shared/domain/sales`，模型协议适配位于后端 `gateway`。

数字人与 PPT 功能重建中，首页仅保留入口占位，旧视图参数回到首页。旧工作室、专属契约与生成接口已移除；数字人历史数据库迁移、用户数据和模型线路配置保留。`generate/export` 继续服务电商图文等功能的通用 ZIP 导出。

目录名用于源码定位。浏览器视图参数、HTTP 接口地址、草稿存储键与数据库标识保持原有兼容形式，已有链接和工作记录继续可用。

产品操作与恢复规则分别见 [assistant-runtime.md](assistant-runtime.md)、[video-sales.md](video-sales.md)、[workshop-production.md](workshop-production.md)、[workshop-asset-binding.md](workshop-asset-binding.md) 与 [workshop-reference-generation.md](workshop-reference-generation.md)。

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
| `internal/generate/{depth,poster,export,sales}` | 深度推理、封面设计、文件导出、电商视频子包 |
| `internal/workshop` / `internal/keywords` | 电商图文批次与输出审核 / 关键词审核与提交保护 |
| `internal/assistant` | 回合、记忆、沙箱、工具与运行时；`extract` 抽取文档，`sessions` 读写会话 |
| `internal/gateway` | 模型协议、提交适配与文本流式处理 |
| `internal/platform/collect` | 采集上游请求与响应 |
| `internal/platform/database` | 数据库连接、工具与按领域拆分的数据访问；`migrate` 负责版本化迁移与官方种子 |
| `internal/platform/{media,mediasign,network,storage}` | 媒体地址、读取签名、出站网络、本地与对象存储 |

Go 的同目录文件共同组成一个包，共享未导出类型。领域包内按文件前缀定位职责，例如 `generate/image_*.go`、`generate/video_*.go` 与 `gateway/text_*.go`；拆子包须先具备独立职责和稳定依赖，避免仅为减少文件数扩大导出接口。

当前 gateway 的模态入口是 `video_submit.go`、`audio_submit.go`、`threed_submit.go` 与 `multimodal_submit.go`，公共提交在 `submit.go / adapter.go`，文本协议在 `text_*.go`。图像和视频部分上游协议仍与 generate 任务编排相邻；不存在独立的 `gateway/image` 等目录，也没有单独的 dispatcher.go。接入新模型先复用现有适配入口，厂商文档见 [models.md](models.md)。

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

官方架构由 `src/shared/domain/prompts/masterRecipes.ts` 的 `OFFICIAL_MASTER_RECIPES` 与 `src/shared/data/officialMasterRecipes.json` 同步维护，`pnpm check:shared-data` 校验两者一致，Go 种子加载器与 `seed:export` 统一使用 `officialMasterRecipes.json`；原始数据库架构行一并保存在提示词资产快照中，不再保留第二份架构导出文件。

domain 的子目录包括 `assistant / assets / collection / core / media / models / pets / products / prompts / sales / settings / skills / workshop`。其中 core 放环境注入、并发池和任务状态；models 放模型目录与调用适配；业务提示词、技能和电商图文规则分别放入 prompts、skills 和 workshop。

Agent 运行技能的可维护文件包存放在 `src/shared/domain/assistant/skills/packages/<skill-id>/`，主文件为 `SKILL.md`，展示信息、按需规范与交付模板随包维护。`pnpm skills:build` 生成浏览器安全目录；`pnpm check:skills` 防止正文、元数据与运行时漂移。包结构及自定义技能的工作区存储见[技能包维护](skills.md)。

## 运行、构建与数据

- `pnpm dev` 启动 Go API 与 Vite，`pnpm dev:ui` 仅启动 Vite。HTML 根是 `src/client`，环境配置目录是仓库根，公开资源来自 `src/client/public`。
- 所有入口共用 `tools/configs/vite.config.ts`；`pnpm build:ui` 输出到 `tools/build/ui`，`pnpm build:api` 输出到 `tools/build/beike-api`（Windows 为 `.exe`）。`pnpm build` 完成类型检查及前后端构建；`pnpm start` 只启动已有 API 并托管前端，缺少产物时退出并提示构建。部署模板和 `WEB_DIST_DIR` 指向前端产物目录。
- Go 查找集中在 `tools/scripts/common/go-toolchain.mjs`，双击启动器、开发构建、迁移与质量检查复用同一规则：从 `go.mod` 读取最低版本，使用本地稳定工具链；显式 `GO_BIN` 无效或版本过低时报错，否则从 PATH 和常见安装位置查找。`gofmt` 从选定 SDK 的 GOROOT 定位。生产启动不要求 Go 编译器。
- `/app_logo.png`、`/inspirations/...` 等公开 URL 保持稳定。组件迁移同步更新静态导入、动态加载、样式路径与质量基线中的文件路径。
- 首页大图可以配置 `thumbnail` 供列表使用，查看、下载与参考图继续使用 `image` 原图。`pnpm media:thumbnails` 用本机 FFmpeg 重建 `public/inspirations/thumbnails` 中的预览图。
- 首页作品按预先声明的比例排版，分页追加完整行；图片解码、重试和视频播放不改变已有卡片的位置。隐藏首页时暂停分页和媒体预览。作品预览只展示已记录的模型、日期与规格，不填入推测值；本地发布记录读取时兼容旧字段并校验格式，写入失败时提示错误。
- Windows 根目录 `.bat` 只调用 `tools/launchers/启动贝壳云图.ps1`；macOS 使用根目录 `启动贝壳云图.command`，两个实现都定位到仓库根目录运行。目录检查要求这两个双击入口存在，并禁止 `tools/launchers` 内重复的 `.bat` / `.command`。开发端口写入 `.local/api-port`，兼容读取旧 `.local-api-port`；隔离端口写入 `.local/isolated-api-port`。
- 日常与隔离模式的进程记录分别放在 `.local/web-processes.json` 和 `.local/isolated-web-processes.json`。只操作 PID、启动时间、工作目录和配置匹配的已记录进程，不按端口或模糊名称停止服务。迁移前的 Vite 记录会在下次启动时核对并替换为新配置。
- PowerShell 验证隔离数据模式：设置 `$env:BEIKE_ISOLATED_DEV="1"` 后运行 `pnpm dev:web`；可再设置独立的 `AZHUO_DATA_DIR`。隔离模式使用独立令牌、API 空闲端口和 UI 5174，不能指向日常用户数据目录。
- `pnpm clean` 仅清除 `tools/build/ui`；`pnpm clean:build` 清除完整 `tools/build`；`pnpm clean:cache` 仅清除 node_modules 内 Vite、Vitest 与工具缓存；`pnpm clean:all` 清除完整构建产物和 node_modules。跨平台清理脚本预先校验所有固定目标，拒绝符号链接重定向。执行前停止本项目服务与测试进程，之后按需重新安装依赖、构建；依赖统一使用 pnpm，保留根锁文件。
- 深度推理保持 `tools/scripts/depth/infer_video_depth.py` 为 Go 调用入口；`depth_runtime.py` 负责模型、配置与环境检查，`depth_processing.py` 负责图像后处理。三者随源码一起部署。

日常启动沿用原应用数据目录与访问令牌。当前 schema、版本登记、checksum 与官方种子统一由 `src/backend/internal/platform/database/migrate` 管理，`beike-api migrate`、`pnpm db:migrate`、`pnpm db:deploy` 与 API 启动使用同一迁移链。新增变更追加版本，不修改已发布迁移，也不保留第二套历史 SQL。迁移失败时 API 停止启动，不向页面暴露底层 SQL 错误。

二级类目智能体的数据读取、记忆、经验与版本切换集中在 `src/backend/internal/platform/database/learning`；`catalog/category_skill_*` 负责模型观察、候选整理和接口。浏览器的 `assets/model/categoryAgent.ts` 只做流程判断，组件分别呈现类目总览、学习记忆与技能版本。生成侧继续冻结实际使用的规则和对照输入，评分由 `workshop` 写回同一学习域。本地原图进入模型的转换能力放在 `platform/media`，反推和类目观察共用，不重复实现文件读取。

根 `database` 只兼容已有本地数据，新检出无需创建，整目录忽略提交；数据库、WAL/SHM、快照和素材保持原位。数据目录与 Windows/SQLite URL 解析、迁移前备份、维护命令选库及一致性恢复统一见[数据库维护](database.md)；生产路径与升级步骤见[服务器部署](deployment.md)。

电商图文生成计划、提交标识与上游回执须先保存再轮询，保存失败时保留恢复信息；助手按当前工作区原子领取 turnId，重复请求核对原任务。服务重启后未确认的付费生成或后台反推任务不自动重放，用户重新进入后核对原结果。具体恢复规则以各产品文档为准。

## 验证与文件生命周期

`pnpm check` 串行执行目录与单项目结构检查、模型目录、电商图文契约、共享数据、OpenAPI、类型检查、ESLint、质量基线、依赖边界、循环与密钥检查、Go 格式/vet/测试、前端单元测试与生产构建。CI 使用同一命令。

GitHub CI 额外运行 Gitleaks，配置位于 `tools/configs/gitleaks.toml`，保留默认检测规则。已核实的官方素材来源 SHA-256 与固定浏览器存储前缀仅按具体文件和精确内容共同匹配排除，不豁免整份文件或凭证字段。

- `check:root-layout` 限定根目录归属，检查 HTML/Vite/OpenAPI 的唯一位置、docs 平铺和组件实际分类。
- `check:structure` 禁止嵌套 package.json、workspace 依赖和未声明的外部依赖。
- `lint:boundaries` 校验静态导入、re-export、类型导入、字面量动态 import 和 require，并阻止 feature model 反向依赖功能界面。
- `lint:deps` 检查孤立模块与依赖循环；`typecheck:client` 不加载 Node 全局类型。
- `check:reachability` 从浏览器入口、HTML 引用的初始化脚本、正式测试和显式契约入口遍历完整引用图，拦截无人消费的导出文件及其依赖；仅由测试消费的实现会在通过信息中单独计数。
- 文件有效代码预算为 400 行。第三方背景组件仍有已审查的长度基线；未使用、显式 any、文件长度和依赖边界基线只允许收紧，目录迁移只更新对应路径。
- 正式测试留在源码旁，使用 `*.test.ts` 和 Go `*_test.go`。QA fixture、截图、一次性报告和 Agent 计划放项目外。
- `.env*`、`.local`、数据库及 WAL/SHM、备份、上传素材、迁移与种子具有运行和恢复用途；不能按忽略状态或 import 数量删除。

## 新功能接入

1. 在 `src/shared/contracts` 定义请求响应，在 domain 中定义需要复用的纯规则；两者保持独立。
2. 在现有 Go 领域包实现接口、数据访问和必要迁移；仅在职责独立时增加领域包。
3. 在 `src/backend/internal/app/server.go` 装配路由与中间件，执行 `pnpm openapi:write` 同步契约。
4. 在 `src/client/features/<功能>` 建立页面和实际需要的 components、hooks、api、model；组件分类直接存放实现。
5. 在 `src/client/store/appView.ts`、`src/client/app/routes.ts`、`AppSidebar.tsx` 与 `App.tsx` 登记视图和按需加载；更新相关产品文档后运行 `pnpm check`。

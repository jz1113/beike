# 贝壳云图全程序审查报告

审查日期：2026-08-22  
审查对象：当前工作区磁盘版本（Vite 6 + React 19、Hono 4、Prisma/SQLite、Tauri 2）  
源码规模：约 56,465 行（`src/`、`server/`、`src-tauri/src/`、`tools/scripts/`、`prisma/`）

## 1. 结论摘要

当前版本已经形成完整的电商素材采集、商品/配方管理、AI 分析、生图/视频、资产中心、导出、AI 助手和桌面端本地持久化链路，Rust 桌面壳可以通过 `cargo check`，前端也能被 Vite 打包。但当前版本不应直接作为正式发布候选：类型检查失败，Lint 基线严重失守，缺少自动化测试，并存在桌面端任意路径写文件、CSP 关闭、密钥长期保存在 Web Storage、资源下载先全量入内存后限流等安全和稳定性风险。

风险统计（按独立根因合并，而不是按每一条 Lint 输出计数）：

| 等级 | 数量 | 含义 |
|---|---:|---|
| 严重（P0） | 1 | 一旦渲染层被利用，可突破桌面文件边界 |
| 高（P1） | 6 | 发布阻断、凭证泄漏、内存耗尽或核心功能崩溃 |
| 中（P2） | 10 | 数据一致性、可靠性、性能、维护性明显不足 |
| 低（P3） | 4 | 防御纵深、体验或工程规范问题 |

建议发布门槛：先完成 P0/P1，建立 `typecheck + lint + test + build + cargo check` CI，再进行真实供应商凭证下的端到端验收。

## 2. 审查范围与功能清单

本次覆盖了所有主要源码目录及其公开功能入口：

- 应用外壳与导航：展馆首页、通用生成工作区、买家秀四步工坊、资产中心、全局弹窗与错误边界。
- 商品与素材采集：京东/淘宝等电商商品、外部社媒解析、批量采集、历史记录和本地素材复用。
- AI 工作流：多模态分析、提示词/分镜生成、图片生成、视频生成、异步轮询、失败记录和批量操作。
- 资产管理：商品库、配方库、提示词库、生成历史、分类、筛选、删除、下载和 ZIP 导出。
- AI 助手：会话持久化、流式聊天、附件、文档抽取、自定义技能、批量提示词和工具活动。
- 配置与存储：模型列表、第三方网关、采集服务、S3 兼容对象存储、本地缓存、IndexedDB、SQLite。
- 桌面能力：Node sidecar、动态本地端口、访问令牌、下载目录、文件写入、内存/磁盘统计、应用数据目录。
- 工程系统：Vite/Hono 迁移、Prisma schema、打包脚本、Tauri 配置、TypeScript、ESLint 和 Rust 编译。

审查方法包括结构与调用链阅读、危险 API/凭证/网络/持久化模式检索、TypeScript 类型检查、ESLint、Vite 生产构建、Rust `cargo check`。未使用真实第三方密钥发起付费生成或采集，也没有修改业务源码和用户数据库。

## 3. 验证结果

| 检查 | 结果 | 关键证据 |
|---|---|---|
| TypeScript `tsc --noEmit` | 失败 | 7 个错误，涉及 Hono 路由签名、设置模型类型、Blob 类型、缺失 `useRef`、脚本导入扩展名 |
| ESLint | 失败 | 500 项：221 errors、279 warnings；包含 Hook 依赖、空 catch、Node 脚本环境配置等 |
| Vite production build | 成功但有风险 | JS 主包 1,427.95 kB（gzip 386.82 kB），多处动态导入无法拆包 |
| Rust `cargo check` | 成功 | 桌面 Rust 源码可编译 |
| 自动化测试 | 缺失 | 未找到单元/集成/E2E 测试；`storage/test.ts` 是 API 路由，不是测试用例 |

Vite 成功不能证明发布可用：Vite 默认仅转译 TypeScript，不执行完整类型检查，因此它掩盖了实际编译错误。

## 4. 详细问题

### P0-01：Tauri 主窗口具备任意绝对路径写文件能力

证据：`src-tauri/src/storage.rs:99-111` 的 `write_binary_file(path, data)` 接受渲染层提供的任意路径，只拒绝显式 `..` 组件；绝对路径不包含 `..`，因此可写入当前用户有权限的任意位置。该命令通过 `src-tauri/permissions/allow-desktop-api.toml` 和 `src-tauri/capabilities/default.json` 授权给主窗口。与此同时 `src-tauri/tauri.conf.json` 将 CSP 设置为 `null`。

影响：任何渲染层 XSS、恶意远程内容链路、依赖供应链问题或被污染的本地状态，都可能把普通 Web 层问题升级为覆盖用户文件、写入 shell 配置/启动项等桌面代码执行前置条件。这是当前最高优先级问题。

建议：Rust 端不要接收完整目标路径。只接收经严格清洗的文件名和由原生目录选择器签发/保存的目录句柄；canonicalize 后验证目标必须位于已授权下载目录内，拒绝符号链接逃逸、设备路径、UNC 路径和保留文件名。进一步把写文件命令放入最小权限 capability，并恢复严格 CSP。

### P1-01：类型检查失败，发布包仍会被产出

证据：`tsc --noEmit` 返回 7 个错误；`package.json` 的 `build` 只有 `prisma generate && vite build`，没有 `tsc --noEmit`。当前 Vite 构建成功。

具体错误：

- `server/index.ts:53,71` 给无参数的 `GET()` 传了 Request。
- `src/features/settings/SettingsModal.tsx:248` 把 `WorkflowCapability[]` 写入 `WorkflowModel[]` state，`name` 可选性不兼容。
- `src/lib/desktopDownload.ts:8` 的 `Uint8Array<ArrayBufferLike>` 不符合当前 DOM `BlobPart` 类型。
- `src/shared/media/Stack.tsx:65` 使用了未导入的 `useRef`。
- `tools/scripts/verify-model-adapters.ts:5-6` 使用 `.ts` 扩展名导入，但 tsconfig 未允许。

影响：CI/本地构建会把存在确定缺陷的包误判为成功；类型契约迁移已经不一致。

建议：新增独立 `typecheck` 脚本并让 `build`/CI 先执行；修复全部错误后禁止回归。

### P1-02：Stack 组件在运行时直接崩溃

证据：`src/shared/media/Stack.tsx:3` 只导入 `useState/useEffect/useMemo/useCallback`，但 `:65` 调用 `useRef`。

影响：只要包含该组件的功能路径被渲染，浏览器会抛出 `ReferenceError: useRef is not defined`，对应区域或错误边界内页面不可用。生产构建不会拦截。

建议：导入 `useRef`，并添加组件渲染测试和 autoplay 定时器测试。

### P1-03：桌面 WebView 禁用 CSP，且开放默认 opener 权限

证据：`src-tauri/tauri.conf.json` 中 `app.security.csp` 为 `null`；`src-tauri/capabilities/default.json` 给主窗口 `opener:default`、`dialog:default` 以及全部自定义桌面命令。

影响：缺少 CSP 这一关键防线，注入脚本可直接调用高权限 Tauri 命令；与 P0-01 组合后风险显著放大。

建议：配置仅允许 `self`、必要图片/媒体源和本地 API 的 CSP；按命令逐项授权，避免 `*:default`；外链只允许 `https` 且经过域名确认。

### P1-04：多类长期密钥以明文保存在 localStorage，并回传到请求头/正文

证据：`SettingsModal.tsx`、`ApiServicesTab.tsx`、`storageClient.ts` 保存 AI API key、万邦 secret、外部解析 secret、对象存储 SecretAccessKey；`getClientStorageHeaders()` 仅 Base64 编码为 `x-storage-config`，不是加密。访问令牌也保存在 localStorage 和 JS 可读 cookie 中（`src/lib/apiToken.ts`）。

影响：任意 XSS、恶意浏览器扩展、WebView 调试接口或共享用户环境都能一次性取得 AI、采集和云存储凭证；对象存储密钥通常具有读写/删除权限。

建议：桌面端使用 OS Keychain/Credential Manager；服务端模式使用进程环境或密钥服务。前端只保存“已配置”状态，不保存 secret；访问 cookie 应由服务端设置为 HttpOnly/Secure，并避免 URL token。

### P1-05：媒体代理与导出先完整读入内存，之后才检查大小

证据：`server/routes/system/proxy-image.ts:324-330`、视频代理以及 `server/routes/generate/export-zip.ts:160-168` 均先 `response.arrayBuffer()`，再比较 25/80MB 上限。视频缓存最多 4 个 80MB Buffer，另有响应、切片和 GC 峰值。

影响：恶意或异常上游可忽略 Content-Length 或返回超大/无限流，导致 sidecar 内存暴涨、界面失联或进程被操作系统杀死。ZIP 多素材并发还会叠加峰值。

建议：先校验 Content-Length，再使用流式 reader 按累计字节硬中止；ZIP 使用流式归档、总大小/文件数/并发上限；缓存按总字节而非条目数淘汰。

### P1-06：文档抽取可被压缩炸弹或高复杂度文件耗尽资源

证据：`extract-document.ts` 只限制上传文件为 15MB，随后 JSZip/mammoth/unpdf/xlsx 在主 API 进程内解析；没有解压后大小、页数、工作表数、XML 条目数、解析时间或 worker 隔离限制。

影响：很小的压缩文档可能解压为巨量内容，阻塞 Node 事件循环或耗尽内存，令全部本地 API 无响应。

建议：预检 ZIP central directory 和解压总量；限制页/表/slide/entry 数；放到 worker/子进程并设置内存与超时，异常时强制终止。

### P2-01：ESLint 基线不可用，真实缺陷被 500 条噪声淹没

证据：221 errors、279 warnings。大量 Node 脚本因 ESLint 未配置 Node globals 报错，同时业务代码存在 Hook 依赖缺失、空 catch、无用变量等真实问题。

影响：团队无法把“Lint 通过”作为质量门槛，也很难从噪声中发现新回归。

建议：为浏览器、Node 脚本、服务端分别设置 flat config globals；先机械清理无效规则噪声，再逐项处理 Hook 与错误吞噬；CI 使用 `--max-warnings 0`（可分阶段收紧）。

### P2-02：多个 React Hook 依赖不完整，存在陈旧闭包和状态不同步

证据：ESLint 在 `AssetCenter`、`AIAssistantDrawer`、`BatchPromptModal`、`CustomSkillModal`、`ImageGenStudio`、`PromptStudio` 等核心页面报告缺失依赖。例如生成批处理 callback 缺少 `handleBatchGenerate`，助手恢复逻辑缺少 `selectedSkill`。

影响：切换模型、任务、筛选条件或技能后，effect/callback 可能继续使用旧值；表现为偶发错误模型、漏刷新、重复请求或无法复现的状态错乱。

建议：逐个按业务语义修复，而不是全局禁用规则；稳定函数引用，必要时使用 reducer/event 模式，并为切换场景写测试。

### P2-03：没有自动化测试，核心异步状态机和数据删除无回归保护

证据：仓库没有测试 runner 配置，也未找到单元、集成或 E2E 用例。`server/routes/assets/storage/test.ts` 只是“测试存储连接”的生产 API 路由。

影响：生成轮询、断点恢复、会话持久化、批量删除、迁移、模型适配、URL 安全等高风险逻辑只能靠人工验证。

建议：优先覆盖模型 adapter、safeUrl、鉴权、Prisma CRUD/删除约束、生成状态机和助手会话；再加入 Playwright/Tauri smoke test。

### P2-04：Product 删除与 ImageTask 外键关系没有定义级联策略

证据：Prisma schema 中 `ImageTask.product` 未声明 `onDelete`；`products.ts:142-144` 直接删除 Product，没有先处理关联 ImageTask。

影响：已有生成任务的商品可能因外键约束删除失败并返回 500；若某些 SQLite 配置未启用外键，又可能留下孤儿记录。用户看到的是泛化数据库错误。

建议：明确产品语义：保留历史则设 `onDelete: SetNull`，彻底删除则 `Cascade`；创建 migration，并将约束错误映射为 409/明确提示。

### P2-05：管理员令牌默认等同普通访问令牌

证据：`src/lib/apiAuth.ts:11-15` 未设置 `ADMIN_ACCESS_TOKEN` 时返回普通 token。存储测试/迁移和清空全部任务因此没有真正权限分层。

影响：只要取得普通应用 token，就可以执行被标记为“管理员”的破坏性操作；界面或日志对权限级别的描述与实际不一致。

建议：危险操作要求独立 admin token；若未配置，应禁用而不是回退。桌面单用户模式可改用原生确认 + 短时 challenge。

### P2-06：访问令牌允许出现在查询字符串中

证据：`apiAuth.ts:39-45` 对代理路由接受 `token`/`access_token` query。

影响：URL 会进入浏览器历史、复制内容、错误日志、代理日志和 Referer，造成凭证泄漏；一年有效期 cookie 又扩大暴露窗口。

建议：媒体请求使用短时、单资源签名，或由 HttpOnly cookie 鉴权；禁止长期访问 token 出现在 URL。

### P2-07：桌面 token 与 `.env` 文件没有显式收紧文件权限，随机性也不足

证据：Rust 使用时间戳纳秒 + PID 生成 token（`src-tauri/src/lib.rs:117-124`），然后普通 `fs::write` 写入 `access.token`；`.env` 同样普通写入。

影响：token 可预测性弱于密码学随机数；在宽松 umask、备份/同步或同机多用户场景，文件权限可能暴露 AI key 与本地 API token。

建议：使用 OS CSPRNG 生成至少 256-bit token；Unix 创建后 chmod 0600，Windows 使用用户 ACL；密钥优先进入系统凭证库。

### P2-08：生产主包过大，当前“动态导入”没有形成拆包

证据：Vite 输出单个 1,427.95kB JS（gzip 386.82kB），并明确警告 `apiClient`、`drawing`、Tauri plugins、`image-utils` 同时静态/动态导入，动态导入不会移动到独立 chunk。

影响：首屏解析和执行成本高，低内存设备更明显；xlsx、文档、动画/3D、生成工作区等非首屏能力没有真正延迟加载。

建议：按四个主视图使用 `React.lazy`；重型库只在功能入口动态加载；统一模块导入方式，配置稳定的 manualChunks，并用 bundle analyzer 设预算。

### P2-09：API 输入校验主要依赖宽松对象与类型断言

证据：多条路由直接 `await req.json()` 后解构，广泛使用 `any`；会话允许客户端提供任意消息额外字段，生成/导出批量数量与字符串长度缺少统一 schema 和总量限制。

影响：畸形数据可能落库、触发意外分支或制造超大请求/响应；错误通常变成 500，而非可诊断的 400。

建议：使用 Zod/Valibot 等在路由边界声明 schema；限制数组数、字符串长度、data URL 大小、分页和批处理总量；统一错误格式。

### P2-10：大量异常被空 catch 静默吞掉

证据：Lint 报告众多 `no-empty`，分布在生成、视频、助手、采集、store 持久化等核心路径。

影响：数据库写失败、localStorage 超限、模型解析失败和后台轮询错误可能没有日志或用户提示，形成“偶发丢数据/按钮无反应”。

建议：定义可预期异常清单；只对明确可忽略错误静默处理并写注释，其他错误进入结构化日志/用户状态，敏感字段先脱敏。

### P3-01：CORS 对全部来源开放

证据：`server/index.ts` 使用 `cors({ origin: '*' })`。

影响：token 仍提供一道防线，但任何来源都能探测 health 和尝试调用本地 API；若 token 通过其他渠道泄漏或浏览器策略改变，攻击面扩大。

建议：桌面只允许 Tauri origin 和本地 UI origin；开发环境显式列出 `127.0.0.1:5173`，生产按部署域名白名单。

### P3-02：错误响应直接返回底层异常文本

证据：多条 route 使用 `{ error: error.message }` 返回 500。

影响：可能泄漏数据库结构、文件路径、供应商响应或内部配置；同时外部错误格式不稳定。

建议：服务端记录带 request-id 的完整错误，客户端只返回稳定错误码和安全文案；供应商错误做统一映射。

### P3-03：开发默认访问令牌硬编码且长期保存

证据：前后端均硬编码 `azhuo-local-dev`；前端在没有配置时自动使用。

影响：一旦开发服务器错误绑定到局域网/被转发，所有人都知道默认口令。当前默认 host 为 127.0.0.1 降低了风险，但启动脚本或部署改动可能破坏该假设。

建议：每次开发启动随机生成临时 token 并注入 UI；检测非 loopback host 时拒绝默认令牌启动。

### P3-04：仓库处于大规模迁移的脏工作区，发布来源不可复现

证据：Git 状态包含大量重命名、删除、新增和修改，Next.js 路由向 Hono/Vite 迁移尚未形成干净提交。

影响：难以确认发布包含哪些改动、回滚哪个版本，也容易漏打包未跟踪文件。

建议：按“结构迁移/行为修改/安全修复”拆分提交；在干净 checkout 上执行完整构建和安装包 smoke test。

## 5. 功能链路评价

### 展馆与通用生成

结构上已经把全局生成引擎与视图切换解耦，方向正确；但全局 engine 包含轮询和恢复逻辑，缺测试且有 Hook 依赖告警。需要验证切页、休眠恢复、网络断开、重复提交和取消后的幂等性。

### 买家秀四步工坊

产品、风格/脸部参考、分镜、生成和导出链路完整，状态持久化较丰富。主要风险是状态规模大、localStorage/IndexedDB/SQLite 三套持久化权威边界不够清晰；重置、删除和恢复应建立状态机级测试。

### 采集与资产中心

支持缓存商品、历史、批量下载和对象存储迁移；URL allowlist 与 DNS 私网地址检查是积极措施。但媒体下载的流控不足，产品删除外键语义未定义，对象存储 secret 留在渲染层。

### AI 助手

具备流式响应、附件、文档抽取、会话落库和工具调用，功能面完整。风险集中在单文件路由过大、输入 schema 宽松、文档解析资源隔离不足、会话消息额外字段未白名单化，以及错误大量静默吞掉。

### Tauri 桌面端

动态端口、sidecar 健康检查、数据目录和退出清理设计合理，Rust 可编译。当前首要问题是 WebView 与原生命令之间没有形成最小权限边界；在修复任意路径写入和 CSP 前，不建议向不受控用户分发。

## 6. 推荐整改顺序

### 第一阶段：发布阻断（立即）

1. 限制/重构 `write_binary_file`，恢复 CSP，缩小 capability。
2. 修复 7 个 TypeScript 错误，把 typecheck 加入 build/CI。
3. 将所有长期 secret 移出 localStorage，取消长期 query token。
4. 媒体下载和文档解析加入流式硬上限与资源隔离。

### 第二阶段：正确性与可回归（1 个迭代）

1. 修复 Hook 依赖和关键空 catch。
2. 明确 Product/ImageTask 删除策略并迁移数据库。
3. 给路由增加统一 schema、错误码、请求体/批量上限。
4. 建立模型适配、鉴权、safeUrl、生成状态机、会话持久化测试。

### 第三阶段：工程与性能（随后）

1. 清理 ESLint 配置和历史告警，CI 零错误。
2. 主视图懒加载与重型依赖拆包，设首屏 bundle 预算。
3. 在干净工作区完成 Tauri 安装包 smoke、升级/迁移、离线/断网和低内存测试。

## 7. 建议验收矩阵

- 安全：XSS PoC 不能调用未授权原生命令；文件只能写入用户批准目录；私网/重定向/IPv6/DNS rebinding URL 均被拦截；secret 不出现在 localStorage、URL、日志。
- 数据：有关联任务的商品删除行为符合产品定义；崩溃重启不丢会话/任务；重复轮询和重试不产生重复记录。
- 生成：每个模型 adapter 覆盖同步、异步、失败、超时、空响应、非 JSON 响应；切页和睡眠恢复后任务继续且只完成一次。
- 资源：超大/无限媒体流在达到阈值时立即中止；压缩炸弹在隔离进程内失败；批量 ZIP 峰值受控。
- 桌面：首次启动、端口占用、sidecar 启动失败、退出清理、下载目录失效、升级保留数据库均有验证。
- 工程：`typecheck`、`lint`、单元/集成测试、Vite build、`cargo check` 全部通过；干净 checkout 可重复产出安装包。

## 8. 审查限制

本报告是对当前 56k 行源码和实现功能的全目录静态/构建审查，不等同于真实供应商环境渗透测试。由于没有提供可消耗的第三方 API 测试账号，本次未执行付费图片/视频生成、真实社媒采集、真实对象存储迁移；也未在 macOS/Windows 安装包中完成 GUI 端到端操作。因此供应商协议兼容性、模型返回格式漂移、Windows 路径/签名/升级等仍需按第 7 节补验。

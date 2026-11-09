# 服务器部署与排障

仓库采用单 package、单 Go module。以下以 Ubuntu 22.04 / 24.04、代码目录 `/opt/beike`、数据目录 `/var/lib/beike`、服务用户 `beike` 为例；自定义目录时同步服务模板、环境变量与 Nginx 静态路径。数据库维护细则统一见[数据库维护](database.md)。

## 目录、环境与模板

- 安装与构建使用 Node.js 22、pnpm 10.13.1、Go 1.26 或更高稳定版本；安装脚本检查并准备 Go。生产重启只运行已有构建产物。
- `pnpm build` 执行类型检查并构建 `tools/build/ui/` 与 `tools/build/beike-api`；`pnpm build:api` 可单独更新后端。Windows API 为 `.exe`，服务器须使用目标系统的构建产物。
- Go 提供 API、静态页与素材访问；systemd 运行 `tools/scripts/web/start-web.mjs`，Nginx 反向代理到 `127.0.0.1:3000`。
- 生产数据库、`.env`、`storage/` 与备份放在数据目录，不随源码发布覆盖。API 启动时执行版本化迁移与官方种子；迁移失败须排障，不能删除用户库。
- 执行模板在 `tools/deploy/`：`bootstrap-ubuntu.sh`、`beike.service`、`env.production.example`、HTTP / HTTPS Nginx 配置及 `enable-https.sh`。

网络放行 SSH、80、443，SSH 来源限制为管理端；应用 3000 端口只供本机代理，不向公网开放。公网地址和域名使用实际部署值，不在文档中保存某台服务器 IP 或登录信息。

Nginx 默认请求体上限为 `64m`；仅九宫格裁切接口 `/api/sales/asset-view-grid` 单独设为 `96m`，为最大 64 MiB 原图的 Base64 JSON 留出空间。已有部署升级时需同步 HTTP / HTTPS 模板中的该精确匹配代理规则，保留认证、代理头与超时配置，运行 `sudo nginx -t` 通过后再执行 `sudo systemctl reload nginx`。

## 浏览器凭据与入口边界

HTTPS 公共入口设置 `BEIKE_PUBLIC_WEB=1`，打开页面即由 Go 签发 Secure、HttpOnly 的签名会话 Cookie。服务器令牌只用于签名与已有运维调用。浏览器继续使用原有工作区密钥访问自己的历史和素材。启用公共入口前，运行进程须移除共享的第三方服务凭据，万邦等接口由浏览器随请求发送个人配置。Go 端口仅监听回环地址，初装 HTTP 入口仅供配置 HTTPS 前使用。

网页设置中的第三方凭据保存在浏览器 localStorage，属于明文、同源脚本可读的持久数据，不是系统钥匙串或加密保险箱。本机数据、浏览器配置和同源脚本应按此边界保护。生产应用 Cookie 与网页设置中的第三方凭据分别保存。

## OSS 参考视频存储

本地开发使用 `pnpm dev` 同时运行 Go API 与前端。`pnpm dev:ui` 只启动前端；出现“本地后台服务未连接”时，先确认 `http://127.0.0.1:3000/api/health` 返回成功，再排查 OSS。API 端口以实际启动日志为准。

网页设置选择“存储 → 阿里云 OSS”，配置值与 OSS 控制台中同一个 Bucket 对应：

OSS 上传与删除使用阿里云官方 Go SDK V2 的 OSS V4 签名，地域从标准 Endpoint 推导；其他 S3 兼容存储继续使用对应协议。不能直接把 AWS S3 的签名请求作为 OSS 原生 V4 请求。

- `Bucket`：只填存储桶名称，不带协议、域名或目录。
- `Endpoint`：填写该桶所在地域的外网 Endpoint，例如北京为 `https://oss-cn-beijing.aliyuncs.com`，不带 Bucket 名称，不使用 `-internal` 内网地址。
- `AK ID / AK Secret`：使用具备目标桶对象上传、读取及删除权限的 RAM 用户凭据；可将权限范围限制为该桶的 `oss:PutObject`、`oss:GetObject`、`oss:DeleteObject`。
- `API 前缀`：例如 `seedance/`；参考视频上传到此前缀下的 `refs/`。支持中文目录，配置经 JSON Unicode 转义后放入 HTTP 请求头，后端解析还原原始目录名。
- `素材前缀`：例如 `canvas-materials/`。
- `公开访问域名 / CDN`：未绑定自有域名时可留空，系统生成 `https://桶名.Endpoint/对象路径`。

保存配置后点击“测试上传”。此测试写入临时对象并尝试删除，成功只表示连接和写入正常，不验证公网读取，返回的测试 URL 也不作为长期可用链接。

通过参考上传接口提交的 OSS 视频返回有效期 24 小时的 OSS V4 签名读取 URL，支持私有桶，无需修改整个桶的读写权限。重试时重新上传获取新的签名，不把过期的临时 URL 当作永久素材地址。

全局素材和成品存储仍返回永久对象 URL。需要对此类 URL 开放匿名读取时，专用公开素材桶可设为“公共读”，保持写入受鉴权控制；OSS 全局或 Bucket 层面的“阻止公共访问”会覆盖公开读取设置。应用不自动修改桶权限。

验证公网读取时，将实际视频的签名 URL 或公开对象 URL 在未登录阿里云的无痕窗口直接打开。能播放或下载才说明模型可读取；不要通过访问 Bucket 根地址判断，公共读也不代表允许匿名列举文件。当前参考上传接口的 multipart 请求体上限为 32 MiB，视频需为表单保留余量。

若出现 `InvalidBucketName`，核对 Bucket 纯名称和 Endpoint；`SignatureDoesNotMatch` 核对密钥配对、地域和设备时间。Secret 只能从创建时保留的原始密钥文件或创建界面获取，不使用脱敏星号、登录密码或其他 Key 对应的 Secret；无法找回时由用户在 RAM 创建一对新的 AccessKey，再在本机同时替换两个字段。`AccessDenied` 核对 RAM 授权及对象读取权限。修改源码后，本机开发须重启 Go API；生产部署先执行 `pnpm build:api` 并按升级流程重启服务。

OSS 返回签名错误及签名原文时，后台会比较本次客户端签名原文与 OSS 返回值，只显示比较结论，不输出密钥或签名原文。“签名原文一致”时优先核对当前 AK ID 与 Secret 的配对；更换 RAM 用户后，应在应用中检查 AK ID 是否也已同步更新，保存并重新打开设置确认。“签名原文不一致”时检查签名配置及网络代理是否改写请求。

官方说明：[地域与 Endpoint](https://help.aliyun.com/zh/oss/user-guide/regions-and-endpoints)、[RAM Policy](https://help.aliyun.com/zh/oss/user-guide/ram-policy)、[访问权限](https://help.aliyun.com/zh/oss/user-guide/oss-bucket-acl)、[阻止公共访问](https://help.aliyun.com/zh/oss/user-guide/block-public-access)。

## 首次安装

把已确认版本的源码放到 `/opt/beike`，在服务器执行：

```bash
sudo bash /opt/beike/tools/deploy/bootstrap-ubuntu.sh
sudo -u beike -H bash -lc 'cd /opt/beike && pnpm install --frozen-lockfile && pnpm build'
```

安装脚本创建服务用户、数据目录、systemd 与 HTTP Nginx 配置；首次生成的网页访问凭据应妥善保存，文件位于 `/etc/nginx/.htpasswd`。已有服务升级不重复运行首次安装脚本。

编辑 `/var/lib/beike/.env`，至少设置 `LOCAL_ACCESS_TOKEN`、管理员操作所需的 `ADMIN_ACCESS_TOKEN`、`PUBLIC_WEB_ORIGIN`，核对 `AZHUO_DATA_DIR`、`DATABASE_URL`、`WEB_DIST_DIR`。已有环境的前端目录应为 `/opt/beike/tools/build/ui`，运行数据保持原位。

个人网关模式下保持 `AI_DRAWING_BASE_URL` 与 `AI_DRAWING_API_KEY` 为空。用户在网页设置保存自己的渠道配置，凭证随当前请求转发，不把本机个人密钥同步为服务器共享密钥。

新建空环境可直接启动，由迁移初始化数据库；需要继承本机数据时，先在本机执行 `pnpm db:backup`，把本次输出的一致性快照上传到服务器暂存位置并校验，再按[数据库恢复规则](database.md#检查备份与恢复)安装到尚未运行的目标库。已有生产库须先停服务、保留原文件及 WAL/SHM，不能用 scp 直接覆盖。图片等素材须另行同步，单独复制数据库不会包含媒体文件。

```bash
sudo systemctl start beike
sudo systemctl status beike --no-pager
curl --fail http://127.0.0.1:3000/api/health
```

浏览器通过公网 IP 或域名访问，先通过 Nginx 网页认证，再检查电商图文、素材库及当前工作区。官方种子来自 `src/shared/domain/prompts/masterRecipes.ts` 与 `src/shared/data/`，启动时同步，不能当作无引用文件删除。`pnpm seed:export` 会改写仓库种子，应按[种子导出](database.md#官方种子导出)明确选择数据源，不是每次部署必跑步骤。

## HTTPS

域名解析到服务器后执行以下命令，将示例域名和邮箱替换为实际值：

```bash
sudo bash /opt/beike/tools/deploy/enable-https.sh example.com ops@example.com
```

随后将 `PUBLIC_WEB_ORIGIN` 改为实际 HTTPS 来源并重启服务。首次安装无需预先准备证书；不要直接启用依赖尚不存在证书文件的配置。

## 代码升级

1. 记录当前发布提交，保留旧源码、前端产物、API 可执行文件及部署配置，作为同一版本的回退集。
2. 暂停新生产请求，等待已提交的生成与后台反推收尾；维护命令在仓库根目录以服务用户执行：
   `AZHUO_DATA_DIR=/var/lib/beike pnpm db:backup`。保存命令输出的实际快照路径，并备份素材目录。
3. 将已测试、可追溯提交的源码更新到服务器。同步范围限于发布源码，排除 `.env*`、`.local/`、`database/`、备份、存储、上传素材与服务器自有公开资源；不从本机复制 `node_modules`。源码覆盖或删除前核对目标目录，避免清理运行数据。
4. 在停服窗口完成依赖和构建，然后启动并核对日志与健康状态：

```bash
sudo systemctl stop beike
sudo -u beike -H bash -lc 'cd /opt/beike && pnpm install --frozen-lockfile && pnpm build'
sudo systemctl start beike
sudo systemctl status beike --no-pager
curl --fail http://127.0.0.1:3000/api/health
```

前端静态资源由 Nginx 直接读取，构建目录替换期间可能暂时不可用；安排维护窗口。浏览器刷新后核对版本、素材读取与工作区；上线验证不必触发收费生成。后台未知任务先核对原记录，不自动重放。

## 备份、恢复与回退

数据库采用 SQLite 一致性快照，包含已提交 WAL 数据；快照位于源库旁的 `database-backups/`。旧快照、`.local/deploy-backup/` 与历史恢复库保持原位，不随发布清理。详细路径选择、验证命令与停服替换顺序见[数据库维护](database.md)。

`storage/` 要与数据库建立对应备份，特别是工作区的 `deconstruct-inputs`、`deconstruct-results`、生成图与上传素材。恢复时先验证数据库快照，停服务并保留当前库及附属文件，再恢复对应素材、权限和配置；对象存储素材还需保留原桶与访问配置。

失败回退使用升级前保存的源码、前端与 API 产物及相应配置。已经执行数据库迁移时，不能假设旧程序兼容新 schema；应先判断兼容性，必要时停服恢复对应升级前快照与素材。恢复旧快照会回退此后写入，必须先保留故障时的数据库与素材供核对。迁移 checksum 报错应核对发布版本和迁移源，不通过改 checksum 或删除账本绕过。

二级类目学习的观察、经验、版本和评分保存在数据库；学习当前依赖页面打开，关闭页面会中断当前轮，已完成观察保留。后台图集反推由 API 执行，关闭浏览器不停止队列；服务重启遗留的未确认调用只标记待核对，执行密钥不持久化到任务。

## 健康检查与常见故障

```bash
sudo journalctl -u beike -n 100 --no-pager
sudo nginx -t
sudo systemctl status nginx --no-pager
curl --fail http://127.0.0.1:3000/api/health
```

- API 健康但公网失败：检查 Nginx 配置、认证、域名和 `PUBLIC_WEB_ORIGIN`；查看 `/var/log/nginx/error.log`。
- 静态资源 403：检查代码目录的遍历权限及 Nginx 静态根路径，不通过开放整个数据目录权限解决。
- 缺少构建产物：核对 `tools/build/ui/index.html`、`tools/build/beike-api`，在目标机器运行 `pnpm build`。
- API 启动失败：检查服务日志、运行用户权限、环境文件与迁移前备份；不要删除运行库重试。
- 素材丢失：检查 `AZHUO_DATA_DIR`、存储目录及工作区归属，先恢复原素材引用，再处理旧生成任务。
- 模型提交未知：按原任务标识查询和核对渠道，不能把重启服务当成重新生成的依据。

## 深度图片与视频环境

保留深度推理功能时，在仓库根目录为实际运行服务的用户准备 Python 环境：

```bash
python3 -m pip install --user -r tools/scripts/depth/requirements.txt
pnpm run setup:depth-env
pnpm run setup:depth-model
```

`requirements.txt` 包括图像处理、PyTorch、Transformers 与 Accelerate 依赖；模型安装需要网络和额外磁盘空间。使用虚拟环境时在其中安装依赖，并将 `DEPTH_VIDEO_PYTHON` 指向该环境的 Python。服务器服务用户必须能访问依赖与模型缓存。

`setup:depth-env` 检查 FFmpeg、ffprobe 与 Python 环境，并验证视频编码与探测链路；`setup:depth-model` 准备深度模型。FFmpeg 与 ffprobe 分别由 `@ffmpeg-installer/ffmpeg` 和 `@ffprobe-installer/ffprobe` 按当前操作系统和架构安装，执行权限由安装脚本自动处理。Go 解析安装器的真实目录以兼容 pnpm 链接结构，并转换 Windows、x64 与 ia32 平台名称；内置工具不可用时回退到系统 PATH。部署时在目标机器运行 `pnpm install --frozen-lockfile`，不要跨操作系统复制 node_modules，也不要使用 `--no-optional` 跳过媒体二进制。

推理入口为 `tools/scripts/depth/infer_video_depth.py`，同目录 `depth_runtime.py`、`depth_processing.py` 与 `depth_subject.py` 必须一起部署。`setup:depth-model` 一次安装 requirements 中的依赖并检查环境，首次实际推理时下载权重。环境检查可单独执行：

```bash
python3 tools/scripts/depth/infer_video_depth.py --check-env
```

动作捕捉视频从原始 RGB 帧逐帧提取人物蒙版，使用 `nvidia/segformer-b0-finetuned-ade-512-512`（首次运行自动下载并缓存）。按原片亮度边缘细化蒙版，利用当前帧深度补回与人物相连的漏分区域，保留与背景同深度的肢体间隙，再将人物深度映射为亮白轮廓，保留轻微灰度变化，背景置为纯黑；无人帧输出黑帧。标准档使用 518 像素推理并逐帧估计深度，避免跳帧插值及跨帧中值导致动作边缘模糊。该步骤增加逐帧推理开销；人物分割权重加载失败会使任务报错。原始灰度、伪彩色和深度图片沿用原有处理。已有深度视频无法恢复原片中已丢失的外观细节，建议上传原视频重新生成。

`pnpm run setup:depth-env` 使用 `DEPTH_VIDEO_PYTHON` 指定的解释器；不设置时使用 `python3`。

## 视频表格下载

托管环境（`NODE_ENV=production`）由浏览器逐个接收视频并保存到浏览器设置的下载位置；页面提示完成表示已交给浏览器，实际保存结果请检查浏览器下载列表。首次批量保存可能需要允许多个文件下载。浏览器模式不发送本机目录，服务器拒绝客户端指定目录写入。

本机环境继续使用原生文件夹选择器和后台目录下载。仅记住路径不构成写授权：刷新页面、服务重启或授权超过 8 小时后需重新选择目录。授权限当前工作区和选定目录；任务读取和取消也校验工作区，媒体只读签名不能启动下载。每次任务最多 500 个视频、单个不超过 200MiB，最长运行 2 小时。

本机下载使用独占临时文件与硬链接发布，拒绝覆盖已有文件或同名软链接；目录必须支持硬链接（常见本地 APFS/NTFS/ext4 支持，部分移动盘或网络盘不支持），失败时更换支持的保存目录。取消和失败清理本次临时文件，不截断已有文件。托管环境按浏览器自身规则处理同名文件。

## 商品图片文字识别

以实际运行 Go API 的用户执行 `pnpm setup:ocr`（Python 3.9–3.12），为服务安装 CPU 版 RapidOCR 及随包中文模型。安装命令与服务须使用相同的 `AZHUO_DATA_DIR`；也可统一设置 `OCR_PYTHON` 指向已有环境。部署须保留 `tools/scripts/ocr/recognize.py` 与 requirements/setup 脚本，模型推理无需付费 API。环境未安装时接口返回 503，其他功能可正常使用。详细限制及缓存规则见[电商视频商品准备](video-sales.md)。

# 贝壳云图云服务器部署（新手逐步）

> 单项目结构：从根目录安装和构建，产物为 `tools/build/ui/`。已有环境的 `WEB_DIST_DIR` 与 Nginx 静态根路径须改为 `/opt/beike/tools/build/ui`；无需迁移 `/var/lib/beike` 中的运行数据。

https://www.yeziidc.com/ 是椰子云商家官网，用来买机器、看实例、重置密码。它不是贝壳云图上线后的网址。上线后请用你这台机器的公网 IP，或你自己另外买的域名。

提示词架构（珠宝 / 手机通讯 8 段式、以及已沉淀的提示词资产）已经写进仓库种子，启动时会自动装上，不要删除 `src/shared/domain/prompts/masterRecipes.ts` 与 `src/shared/domain/seeds/`。

## 1. 在椰子云控制台拿到登录信息

1. 打开 [https://www.yeziidc.com/](https://www.yeziidc.com/) 并登录买机器时的账号。
2. 进入「控制台 / 用户中心 / 云服务器 / 实例列表」，点开你买的那台。
3. 抄下这些信息：
   - 公网 IP（类似 `47.x.x.x`）
   - 系统（请用 Ubuntu 22.04 或 24.04；若是 Windows，先重装成 Ubuntu）
   - SSH 端口（一般是 22）
   - 用户名（一般是 `root`）
4. 如果没有密码或忘记了：找「重置密码」，设一个强密码，等机器重启完成。
5. 安全组 / 防火墙按需放行 TCP 22（SSH）、80（HTTP）、443（HTTPS），并确认规则已绑定到目标实例。SSH 来源限制为管理端 IP；3000 仅供本机反向代理使用，不对公网放行。

把公网 IP、用户名、SSH 密码发给部署的人即可继续。没有自己的域名时，用 `http://公网IP/` 访问。

本机 Mac 测试 SSH（把 IP 换成你的）：

```bash
ssh root@你的公网IP
```

第一次会问是否继续，输入 `yes`。然后粘贴密码（输入时屏幕不会显示字符，属正常）。

## 2. 服务器上要做的事（有 SSH 之后）

建议配置：2 核 4G 起，磁盘 ≥ 40G，Ubuntu 22.04。

把仓库放到 `/opt/beike`（git clone 或上传压缩包），然后：

```bash
sudo bash /opt/beike/tools/deploy/bootstrap-ubuntu.sh
sudo -u beike -H bash -lc 'cd /opt/beike && pnpm install --frozen-lockfile && pnpm run build:ui'
```

首次安装只启用 HTTP，不要求预先存在证书。域名解析到服务器后，再运行 `sudo bash /opt/beike/tools/deploy/enable-https.sh 你的域名 你的邮箱` 获取证书并启用 HTTPS；随后把 `PUBLIC_WEB_ORIGIN` 改为 `https://你的域名` 并重启服务。网页访问凭据保存在服务器的 `/etc/nginx/.htpasswd`。

编辑 `/var/lib/beike/.env`：填入 `LOCAL_ACCESS_TOKEN`，并把 `PUBLIC_WEB_ORIGIN` 改成 `http://你的公网IP`。

网页部署时，建议将 `AI_DRAWING_BASE_URL` 与 `AI_DRAWING_API_KEY` 保持为空。用户首次打开网页后，在「设置 → API 服务」输入自己的网关地址和 API Key 并保存；密钥只保存在该浏览器并随当前请求转发，不会写入服务器 `.env` 或影响其他用户。不要把本机浏览器里保存的第三方 API Key 同步到服务器。产品不再使用桌面端。

把本机数据库拷上去（封面大图 `storage/generated` 有 8G+，可先只拷库）：

```bash
scp ".local/deploy-backup/azhuo.db" root@你的公网IP:/var/lib/beike/azhuo.db
```

然后：

```bash
sudo chown beike:beike /var/lib/beike/azhuo.db
sudo systemctl start beike
sudo systemctl status beike --no-pager
```

浏览器打开 `http://公网IP/`，先输入 Nginx 网页用户名密码，再进入种草工坊：类目拍摄架构应能看到珠宝与手机通讯；提示词资产库应有完整卡片并可点「应用」。

运行中的数据库需要备份时，以 `beike` 用户在仓库根目录执行 `pnpm db:backup`，脚本会读取生产环境的 `DATABASE_URL` 并生成一致性快照到数据库旁的 `database-backups/`。恢复前先用 `pnpm db:restore:verify <快照路径>` 校验完整性和外键；替换运行库前须停服务并保留原文件及 WAL/SHM。

图集后台反推由运行中的 API 进程执行，任务状态持久化到数据库；关闭或刷新浏览器不影响执行。升级服务时先停止新派发并等待已提交请求收尾，重启后未确认任务只标记中断，不自动重放付费请求。用户重新进入页面即可查询状态和核对结果。工作区存储中的 `deconstruct-inputs` 与 `deconstruct-results` 分别保存本地图集和大体积解析结果，须与数据库一起备份；模型密钥只保留在执行中的内存，任务恢复不会保存或重用该密钥。

## 3. 本机仓库里已经准备好的文件

- `src/shared/domain/prompts/masterRecipes.ts`：官方 8 段式（珠宝 + 手机通讯）
- `src/shared/domain/seeds/promptAssets.json`：已沉淀提示词资产
- `tools/deploy/env.production.example`、`tools/deploy/beike.service`、`tools/deploy/nginx.conf.example`、`tools/deploy/nginx.https.conf.example`
- 启动：`pnpm run start:web`（先 `pnpm run build:ui`）
- 重新从本机数据库导出种子：`pnpm run seed:export`

本机数据库备份在 `.local/deploy-backup/azhuo.db`（不进 Git）。本机 `storage/` 约 8.6G，其中生成图可按需再同步。

## 4. 本机改完代码后，怎么同步到已上线的服务器

不要重装系统，也不要再跑一遍 `bootstrap-ubuntu.sh`。密钥、数据库在 `/var/lib/beike/`，同步代码时不要覆盖它们。

在 Mac 仓库根目录执行（把密钥路径换成你本机的部署密钥）：

```bash
rsync -a --delete --progress \
  --exclude node_modules --exclude .git --exclude '.env*' --exclude '.local*' \
  --exclude /tools/build/ --exclude /src/client/public/inspirations/ --exclude /storage/ \
  --exclude database/database-backups --exclude database/backups \
  --exclude '*.db*' --exclude '*.sqlite*' \
  -e 'ssh -i .local/beike-deploy-key -o IdentitiesOnly=yes' \
  ./ root@103.108.66.184:/opt/beike/
```

然后 SSH 登录服务器执行：

```bash
chown -R beike:beike /opt/beike
chmod 755 /opt/beike
sudo -u beike -H bash -lc 'cd /opt/beike && pnpm install --frozen-lockfile && pnpm run db:generate && pnpm run build:ui'
systemctl restart beike
systemctl status beike --no-pager
```

浏览器强制刷新 `http://103.108.66.184/`。灵感图目录 `/opt/beike/src/client/public/inspirations` 不必每次重传。

上线前先提交并推送 GitHub，用该提交导出的源码同步，避免本机忽略文件混入发布。先备份代码、前端产物与一致性数据库快照；代码根目录必须允许 Nginx 遍历（755），否则静态资源会返回 403。启动时按版本迁移工作区图组库编号，旧全库号保留用于历史追溯；当前工作区的私有图组与共享官方图组统一按库号升序展示，不会因其它工作区的旧记录出现编号跳涨。

## 深度图片与视频环境

保留深度推理功能时，在仓库根目录为实际运行服务的用户准备 Python 环境：

```bash
python3 -m pip install --user -r tools/scripts/depth/requirements.txt
pnpm run setup:depth-env
pnpm run setup:depth-model
```

`requirements.txt` 包括图像处理、PyTorch、Transformers 与 Accelerate 依赖；模型安装需要网络和额外磁盘空间。使用虚拟环境时在其中安装依赖，并将 `DEPTH_VIDEO_PYTHON` 指向该环境的 Python。服务器服务用户必须能访问依赖与模型缓存。

`setup:depth-env` 检查 FFmpeg 与 Python 环境，`setup:depth-model` 准备深度模型。FFmpeg 执行权限修复仍由安装脚本自动处理。推理入口为 `tools/scripts/depth/infer_video_depth.py`，由后端图片和视频深度服务调用；环境检查可单独执行：

```bash
python3 tools/scripts/depth/infer_video_depth.py --check-env
```

`pnpm run setup:depth-env` 使用 `DEPTH_VIDEO_PYTHON` 指定的解释器；不设置时使用 `python3`。

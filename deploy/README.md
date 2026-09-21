# 贝壳云图云服务器部署（新手逐步）

https://www.yeziidc.com/ 是椰子云商家官网，用来买机器、看实例、重置密码。它不是贝壳云图上线后的网址。上线后请用你这台机器的公网 IP，或你自己另外买的域名。

提示词架构（珠宝 / 手机通讯 8 段式、以及已沉淀的提示词资产）已经写进仓库种子，启动时会自动装上，不要删除 `packages/domain/src/masterRecipes.ts` 与 `packages/domain/src/seeds/`。

## 1. 在椰子云控制台拿到登录信息

1. 打开 [https://www.yeziidc.com/](https://www.yeziidc.com/) 并登录买机器时的账号。
2. 进入「控制台 / 用户中心 / 云服务器 / 实例列表」，点开你买的那台。
3. 抄下这些信息：
   - 公网 IP（类似 `47.x.x.x`）
   - 系统（请用 Ubuntu 22.04 或 24.04；若是 Windows，先重装成 Ubuntu）
   - SSH 端口（一般是 22）
   - 用户名（一般是 `root`）
4. 如果没有密码或忘记了：找「重置密码」，设一个强密码，等机器重启完成。
5. 安全组 / 防火墙放行 22（SSH）、80（网页）。不要放行 3000。椰子云空安全组页的逐项点击见 [`yeziidc-console.md`](yeziidc-console.md)（目标 IP `103.108.66.184`）。

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
sudo bash /opt/beike/deploy/bootstrap-ubuntu.sh
sudo -u beike -H bash -lc 'cd /opt/beike && pnpm install && pnpm run build:ui'
```

编辑 `/var/lib/beike/.env`：填入 `LOCAL_ACCESS_TOKEN`，并把 `PUBLIC_WEB_ORIGIN` 改成 `http://你的公网IP`。

网页部署时，建议将 `AI_DRAWING_BASE_URL` 与 `AI_DRAWING_API_KEY` 保持为空。用户首次打开网页后，在「设置 → API 服务」输入自己的网关地址和 API Key 并保存；密钥只保存在该浏览器并随当前请求转发，不会写入服务器 `.env` 或影响其他用户。不要把本机桌面版的第三方 API Key 同步到服务器。

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

## 3. 本机仓库里已经准备好的文件

- `packages/domain/src/masterRecipes.ts`：官方 8 段式（珠宝 + 手机通讯）
- `packages/domain/src/seeds/promptAssets.json`：已沉淀提示词资产
- `deploy/env.production.example`、`deploy/beike.service`、`deploy/nginx.conf.example`
- 启动：`pnpm run start:web`（先 `pnpm run build:ui`）
- 重新从本机桌面库导出种子：`pnpm run seed:export`

本机数据库备份在 `.local/deploy-backup/azhuo.db`（不进 Git）。本机 `storage/` 约 8.6G，其中生成图可按需再同步。

## 4. 本机改完代码后，怎么同步到已上线的服务器

不要重装系统，也不要再跑一遍 `bootstrap-ubuntu.sh`。密钥、数据库在 `/var/lib/beike/`，同步代码时不要覆盖它们。

在 Mac 仓库根目录执行（把密钥路径换成你本机的部署密钥）：

```bash
rsync -a --delete --progress \
  --exclude node_modules --exclude .git --exclude .env --exclude .env.production \
  --exclude .local --exclude apps/web/dist --exclude apps/web/public/inspirations \
  --exclude apps/desktop \
  -e 'ssh -i .local/beike-deploy-key -o IdentitiesOnly=yes' \
  ./ root@103.108.66.184:/opt/beike/
```

然后 SSH 登录服务器执行：

```bash
mkdir -p /opt/beike/apps/desktop
chown -R beike:beike /opt/beike
sudo -u beike -H bash -lc 'cd /opt/beike && pnpm install && pnpm run build:ui'
systemctl restart beike
systemctl status beike --no-pager
```

浏览器强制刷新 `http://103.108.66.184/`。灵感图目录 `/opt/beike/apps/web/public/inspirations` 不必每次重传。

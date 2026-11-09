# 画布远程 MCP

WorkBuddy 和 Codex 可使用同一套工具搭建贝壳 Studio 画布、修改提示词并保存线上草稿。工具只写画布草稿，不上传素材、不调用生成 API、不提交任务。打开链接后，当前浏览器按草稿版本创建一份 Studio 项目；同版本重开沿用已编辑的副本，线上版本更新时另开一份，浏览器里的编辑不会反写到线上草稿。已有本机项目不迁移。

## 在贝壳服务端启用

1. 按[部署说明](deployment.md)部署新版本，并通过 HTTPS 访问贝壳。使用 Nginx Basic Auth 的部署需要同步最新 HTTPS 模板：只在精确路径 `/api/canvas/mcp` 关闭 Basic Auth，将 Bearer 令牌转交 Go 后端；页面和草稿读取接口仍沿用原鉴权。
2. 在用于编辑草稿的浏览器打开贝壳网页。在该页面的开发者工具 Console 中运行以下代码，得到工作区 ID。这个值是工作区密钥的 SHA-256 摘要；不要复制或发送工作区密钥本身。

   ```js
   const secret = localStorage.getItem('beike_workspace_secret')?.trim();
   if (!secret || secret.length < 32) throw new Error('请先打开并加载贝壳首页');
   const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
   console.log(Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join(''));
   ```

3. 在服务端运行环境填入以下三项，然后重启服务。用 `openssl rand -hex 32` 单独生成 MCP 令牌；它只用于此连接器，不是贝壳登录令牌。

   ```dotenv
   CANVAS_PUBLIC_URL="https://beike.example.com"
   CANVAS_MCP_WORKSPACE_ID="填入上一步得到的 64 位十六进制工作区 ID"
   CANVAS_MCP_TOKEN="填入独立生成的 MCP 令牌"
   ```

   当前每个部署只绑定一个工作区。清除网站数据后，浏览器可能生成新的工作区密钥；仅修改配置不会迁移旧工作区的草稿。开发环境可使用 `http://127.0.0.1:3000`，此时沿用项目的本地工作区，无需设置工作区 ID。

## 添加到助手

在 WorkBuddy 的「专家 · 技能 · 连接器 → 自定义连接器」中添加远程 MCP。传输类型选 Streamable HTTP，地址为 `https://beike.example.com/api/canvas/mcp`，请求头设为 `Authorization: Bearer <MCP 令牌>`。支持编辑 MCP JSON 的版本可使用以下配置，实际令牌只填在私有客户端配置中。参见 [WorkBuddy 官方连接器说明](https://open.workbuddy.cn/docs/connector)。

```json
{
  "mcpServers": {
    "beike-canvas": {
      "type": "streamableHttp",
      "url": "https://beike.example.com/api/canvas/mcp",
      "headers": { "Authorization": "Bearer <MCP 令牌>" }
    }
  }
}
```

在 Codex 中，将相同的令牌设为 Codex 进程可读取的 `BEIKE_CANVAS_TOKEN` 环境变量，再注册：

```sh
codex mcp add beike-canvas --url https://beike.example.com/api/canvas/mcp --bearer-token-env-var BEIKE_CANVAS_TOKEN
```

如果使用桌面版，确保从桌面启动的 Codex 也能读取该环境变量。注册后在新对话试一句：

> 用贝壳画布现有节点搭一个 15 秒竖屏服装短片：商品图和人物图接首帧，首帧接视频，视频接预览，旁白独立。先创建草稿，再把视频提示词按 Seedance 的镜头动作和时序改写，返回贝壳链接。

## 工具行为

| 工具 | 用途 |
| --- | --- |
| `canvas_list_nodes` | 查看首版节点及连线类型。模型、生成模式和素材在编辑器中设置。 |
| `canvas_create_draft` | 校验节点、连线与基础参数，自动布局，保存线上草稿并返回链接。 |
| `canvas_get_draft` | 读取当前版本、结构和提示词修改记录。 |
| `canvas_revise_prompt` | 保存助手写好的优化稿和理由，按版本防止并发覆盖，保留初稿。目标模型仅记录改写依据。 |

素材节点先留空。比例和时长是草稿参数，实际生成前由编辑器按启用模型检查。打开链接需要贝壳网页的登录和对应工作区；链接本身不携带授权凭证。

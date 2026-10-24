# 社媒内容解析

本页说明项目实际使用的 APIA 与奇云解析。电商商品采集由万邦负责，见[商品图片采集](product-collection.md)。解析成功只代表取得素材地址，不代表素材已经下载、长期有效或完成图组反推。

## 项目接口与凭证

`POST /api/catalog/styles/parse-link` 接收 `url`，也兼容 `text`、`link`、`query`。分享文案会先提取其中的 HTTP(S) 链接；常见图片后缀的直链直接整理为单图素材，不调用解析商。

在“设置 → API 接入”配置 APIA 的接口 ID/密钥，或奇云的 AppId/AppKey。请求可通过 `scraperId` / `scraperSecret`、`qiyunAppId` / `qiyunAppKey` 提供凭证，也支持 `x-apia-client-id` / `x-apia-secret-key`、`x-qiyun-appid` / `x-qiyun-appkey` 请求头。生产解析不回退读取服务器环境中的个人凭证；开发环境才允许环境变量兜底。

成功响应包含 `title`、`description`、`author`、`cover`、`images`、`video`、`videos`，并在 `data` 中提供整理后的素材。经解析商处理时另有 `apiUsed` 和 `attempts`；直链分支没有解析商调用记录。

```json
{
  "url": "https://www.xiaohongshu.com/discovery/item/example",
  "preferredScraper": "auto"
}
```

示例仅展示业务字段，实际请求还需携带工作区、应用鉴权与解析商凭证。

## 调度规则

- 自动模式通常先 APIA，再尝试已配置的奇云；只配置奇云时直接使用奇云。
- `preferredScraper: "qiyun"` 将奇云排在前面；这是优先顺序，不是禁止其他解析商的硬锁定。
- 微信、微博、哔哩哔哩及皮皮虾相关域名要求奇云，不回退 APIA；未配置奇云时提前报错。
- `preferredScraper: "wanbang"` 在社媒接口直接拒绝，避免把商品解析凭证用于社媒。

奇云调用 `POST https://qyapi.ipaybuy.cn/api/video`，JSON 传递 `appId`、`appKey`、`url`。APIA 使用 `https://apia.vip/api/dsp/{secret}/{clientId}/`，先 GET；仅方法不支持或成功响应没有素材等适配情形继续尝试 JSON POST、表单 POST。业务错误与网络失败不会在同一解析商内无条件重试。

## 错误处理

失败返回 `error`、`attempts`，可附 `upstreamCode`、`httpStatus`、`retryable`。额度不足映射为 402，限流为 429，凭证错误为 400，作品不存在或不支持通常为 422，APIA 接口停用为 503；网络及上游服务异常通常为 502。`attempts` 用于判断实际经过哪些解析商，不应只看最后一条错误。

额度、凭证、作品失效和接口停用应先处理原因，再由用户发起新解析。不要在界面外层无条件循环重试；一次调度本身可能已经访问多个解析商。

实现真源：`src/backend/internal/catalog/social_parse.go`、`social_provider_errors.go`、`style_link.go`；前端调度入口为 `src/client/features/collect/api/collectSourceMedia.ts`。

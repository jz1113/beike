# DeepSeek 官方 API 接入参考

> 整理日期：2026-09-22。本文是项目接入用的摘要，不替代官方文档；模型可用性、限额与价格请以文末官方链接为准。

## 基础约定

| 项目 | 正式 API | Beta API |
| --- | --- | --- |
| Base URL | `https://api.deepseek.com` | `https://api.deepseek.com/beta` |
| 认证 | `Authorization: Bearer $DEEPSEEK_API_KEY` | 相同 |
| JSON 请求头 | `Content-Type: application/json` | 相同 |
| 主对话端点 | `POST /chat/completions` | `POST /chat/completions` |
| 用途 | 对话、思考、视觉理解、工具调用 | 对话前缀续写与 FIM 补全 |

当前官方模型列表示例包含 `deepseek-flash` 与 `deepseek-v4-pro`。运行时必须通过 `GET /models` 发现模型，不应把本文示例当成永久白名单。

## 端点一览

| 端点 | 方法 | 用途 | 关键说明 |
| --- | --- | --- | --- |
| `/chat/completions` | `POST` | 对话、视觉理解、工具调用、SSE 流式输出 | OpenAI Chat Completions 兼容格式 |
| `/responses` | `POST` | OpenAI Responses 兼容调用 | 服务端不保存响应或会话；客户端应回传完整 `input` 历史 |
| `/completions` | `POST` | FIM（Fill in the Middle）补全 | **仅 Beta Base URL** |
| `/models` | `GET` | 拉取当前可用模型 | 返回 `{ object: "list", data: Model[] }` |
| `/user/balance` | `GET` | 查询余额 | 返回按 `CNY` / `USD` 分组的余额 |

## Chat Completions：标准调用格式

```ts
const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'deepseek-flash',
    messages: [
      { role: 'system', content: '你是贝壳云图的创作助手。' },
      { role: 'user', content: '为这件商品写三条标题。' },
    ],
    stream: true,
    stream_options: { include_usage: true },
  }),
});
```

- `messages` 至少包含一条消息；支持 `system`、`user`、`assistant`、`tool`。
- 普通多轮对话为无状态模式：每一轮都应带上完整历史。
- `stream: true` 时使用 SSE；以 `data: [DONE]` 结束。启用 `stream_options.include_usage` 后，最终内容块携带用量。
- 常用请求字段：`model`、`messages`、`max_tokens`、`stream`、`stream_options`、`response_format`、`stop`、`tools`、`tool_choice`、`user_id`。
- `response_format: { type: 'json_object' }` 仅保证 JSON 结构；提示词仍必须明确要求 JSON 输出，并要处理 `finish_reason: 'length'` 的截断结果。

## 图像理解：`deepseek-flash`

图片只能出现在 `user` 消息中。`system` 或 `assistant` 消息附图会返回 `400`。

```json
{
  "model": "deepseek-flash",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "提取商品图中的文字并描述主体。" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,<BASE64_DATA>",
            "detail": "low"
          }
        }
      ]
    }
  ]
}
```

支持三种图片来源：

1. `image_url.url` 传 `data:` URL（适用于本地图片）。
2. `image_url.url` 传公开 `http(s)` 图片 URL。
3. `file` 内容块传 `file_id`，或传 `file_data`（二者互斥；`file_data` 应同时提供 `filename`）。

格式为 JPEG、PNG、GIF、WebP。`detail` 支持 `low`、`high`、`original`、`auto`；其中 `low` 会缩放到 512×512，以更快、更省 token。内联请求体上限为 48 MiB；外链或 Base64 单图最大 32 MiB，Files API `file_id` 单图最大 64 MiB。应在客户端先校验文件大小、格式与图片数。

## 思考模式与工具调用

思考模式默认开启，默认强度为 `high`。Chat Completions 可以同时使用：

```json
{
  "model": "deepseek-flash",
  "messages": [{ "role": "user", "content": "比较两个执行方案的风险。" }],
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high"
}
```

- `thinking.type`：`enabled` / `disabled`。
- `reasoning_effort`：`none`、`low`、`high`、`max`。兼容值 `minimal → low`，`medium` / `xhigh → high`，`ultra → max`。
- 响应的 `choices[0].message` 可能同时包含 `reasoning_content` 与最终 `content`；流式增量同样可能出现 `delta.reasoning_content`。
- 思考模式中 `temperature`、`presence_penalty`、`frequency_penalty` 不生效；`top_p` 仅在思考模式生效，实际范围为 `0.95–1.0`。
- 若请求使用 `tools`，后续轮次必须原样回传历史 assistant 消息的 `reasoning_content`，否则会收到 `400`。工具参数在执行前必须按 JSON Schema / 业务规则校验。
- 思考模式不支持 `tool_choice: 'required'` 或强制指定某一工具；需要该行为时应先关闭思考模式。

## 多轮对话与前缀续写

普通多轮对话每轮附带完整 `messages` 历史。无 `tools` 时，历史中的 `reasoning_content` 不需要回传，回传也不会进入上下文；有 `tools` 时规则见上一节。

前缀续写为 Beta 功能：最后一条消息必须是 `assistant`，且带 `prefix: true`，并使用 `https://api.deepseek.com/beta`。适合受控代码/文本开头续写，不应用于普通聊天路径。

```json
{
  "model": "deepseek-flash",
  "messages": [
    { "role": "user", "content": "写一个快速排序函数" },
    { "role": "assistant", "content": "```ts\n", "prefix": true }
  ],
  "stop": ["```"]
}
```

## Responses API

`POST /responses` 使用 OpenAI Responses 兼容格式，适合以 `input` 条目组织消息、工具输出与多模态内容。图片使用 `input_image` 内容块，例如：

```json
{
  "model": "deepseek-flash",
  "input": [{
    "role": "user",
    "content": [
      { "type": "input_text", "text": "描述这张图" },
      { "type": "input_image", "image_url": "https://example.com/image.jpg", "detail": "low" }
    ]
  }]
}
```

Responses API 不保存响应或会话。因此接入层需要持久化完整对话并在下一次请求中重新发送，而不能依赖服务端会话 ID。`input_image` 的图片限制与 Chat Completions 一致；使用文件时 `image_url` 与 `file_id` 互斥。

## FIM 补全（Beta）

```ts
await fetch('https://api.deepseek.com/beta/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: 'deepseek-flash',
    prompt: 'function sort(items) {',
    suffix: '\\n}',
    max_tokens: 512,
  }),
});
```

- 仅限 Beta Base URL；支持 `deepseek-flash` 与 `deepseek-v4-pro`。
- `prompt` 必填，`suffix` 可选；支持 `max_tokens`、`stop`、`stream`、`logprobs`、`top_p`、`temperature`。
- `echo` 不能与 `suffix` 或 `logprobs` 同时使用。
- 这是代码编辑能力，不能复用到普通对话或图像理解请求。

## 发现模型与查询余额

```ts
const headers = { Authorization: `Bearer ${apiKey}` };
const [models, balance] = await Promise.all([
  fetch('https://api.deepseek.com/models', { headers }),
  fetch('https://api.deepseek.com/user/balance', { headers }),
]);
```

`GET /models` 返回的 `data` 项至少包含 `id`、`object: 'model'`、`owned_by`。`GET /user/balance` 返回 `balance_infos`；每一项包含 `currency`（`CNY` 或 `USD`）、`total_balance`、`granted_balance` 与 `topped_up_balance`。余额字段应作为金额字符串处理，避免浮点精度误差。

## 贝壳云图接入边界

- 当前设置页的 DeepSeek 服务配置使用正式 Base URL，不应把 Beta Base URL 设为全局网关。
- 视觉分析应使用 `deepseek-flash` 和标准 `/chat/completions` 内容块；图片上传前须遵守以上大小限制。
- 官方模型发现结果需要经过项目的批准模型筛选，不能直接把所有远端模型暴露给工作流。
- 该服务不提供项目所需的商业生图、生视频能力；这些请求继续走 Comfly 网关及对应模型适配器。

## 官方来源

- [图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision)
- [思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)
- [多轮对话](https://api-docs.deepseek.com/zh-cn/guides/multi_round_chat)
- [对话前缀续写（Beta）](https://api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion)
- [FIM 补全（Beta）](https://api-docs.deepseek.com/zh-cn/guides/fim_completion)
- [Chat Completions API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)
- [Responses API](https://api-docs.deepseek.com/zh-cn/api/create-response)
- [FIM 补全 API](https://api-docs.deepseek.com/zh-cn/api/create-completion)
- [获取模型列表](https://api-docs.deepseek.com/zh-cn/api/list-models)
- [查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance)

# 官方接口索引

批准模型的单一真相源是 [`packages/domain/src/modelCatalog.ts`](../../../packages/domain/src/modelCatalog.ts)。
本目录保存双份文档：

- `aggregator/` — 聚合平台 [gpt-best.apifox.cn](https://gpt-best.apifox.cn/llms.txt) 的 OpenAPI spec
- `vendor/` — 各厂商官网文档入口（链接索引）

文档映射配置：[`tools/configs/vendor-docs.map.json`](../../../tools/configs/vendor-docs.map.json)。
历史草稿（官方接口转 / Comfly / 万邦 / 三方解析）在 [`legacy/`](legacy/)。

运行时约定：

- 网关 `GET /v1/models` 仍全量拉取，但 `parseDiscoveredModels` 只保留白名单 id
- 生图 / 生视频 / 多模态提交入口对未批准模型返回 400
- 设置页 `custom_models` 启动时剔除已下线 id
- 多模态统一走 `/v1/chat/completions`（OpenAI 兼容）；Claude / Gemini 官方格式仅作对照，不切换运行时协议

| 能力 | 模型 id | 厂商 | 适配器 | 聚合文档 | 厂商文档 |
| --- | --- | --- | --- | --- | --- |
| 生图 | `gpt-image-2.5-flare` GPT Image 2.5 Flare | openai | `openai-dalle` | [aggregator/openai/gpt-image-2.5-flare.md](aggregator/openai/gpt-image-2.5-flare.md) | [vendor/openai/gpt-image-2.5-flare.md](vendor/openai/gpt-image-2.5-flare.md) |
| 生图 | `gpt-image-2.5-sunburst` GPT Image 2.5 Sunburst | openai | `openai-dalle` | [aggregator/openai/gpt-image-2.5-sunburst.md](aggregator/openai/gpt-image-2.5-sunburst.md) | [vendor/openai/gpt-image-2.5-sunburst.md](vendor/openai/gpt-image-2.5-sunburst.md) |
| 生图 | `gpt-image-2` GPT Image 2 | openai | `openai-dalle` | [aggregator/openai/gpt-image-2.md](aggregator/openai/gpt-image-2.md) | [vendor/openai/gpt-image-2.md](vendor/openai/gpt-image-2.md) |
| 生图 | `nano-banana-pro` Nano Banana Pro | google | `gemini-nano` | [aggregator/google/nano-banana-pro.md](aggregator/google/nano-banana-pro.md) | [vendor/google/nano-banana-pro.md](vendor/google/nano-banana-pro.md) |
| 生图 | `nano-banana` Nano Banana | google | `gemini-nano` | [aggregator/google/nano-banana.md](aggregator/google/nano-banana.md) | [vendor/google/nano-banana.md](vendor/google/nano-banana.md) |
| 生图 | `doubao-seedream-4-0-250828` Seedream 4.0 | bytedance | `seedream` | [aggregator/volcengine/doubao-seedream-4-0-250828.md](aggregator/volcengine/doubao-seedream-4-0-250828.md) | [vendor/volcengine/doubao-seedream-4-0-250828.md](vendor/volcengine/doubao-seedream-4-0-250828.md) |
| 生图 | `doubao-seedream-4-5-251128` Seedream 4.5 | bytedance | `seedream` | [aggregator/volcengine/doubao-seedream-4-5-251128.md](aggregator/volcengine/doubao-seedream-4-5-251128.md) | [vendor/volcengine/doubao-seedream-4-5-251128.md](vendor/volcengine/doubao-seedream-4-5-251128.md) |
| 生图 | `doubao-seedream-5-0-260128` Seedream 5.0 | bytedance | `seedream` | [aggregator/volcengine/doubao-seedream-5-0-260128.md](aggregator/volcengine/doubao-seedream-5-0-260128.md) | [vendor/volcengine/doubao-seedream-5-0-260128.md](vendor/volcengine/doubao-seedream-5-0-260128.md) |
| 生图 | `seedream-v5-pro` Seedream V5 Pro | bytedance | `seedream` | [aggregator/volcengine/seedream-v5-pro.md](aggregator/volcengine/seedream-v5-pro.md) | [vendor/volcengine/seedream-v5-pro.md](vendor/volcengine/seedream-v5-pro.md) |
| 生图 | `qwen-image-max` Qwen Image Max | alibaba | `openai-dalle` | [aggregator/alibaba/qwen-image-max.md](aggregator/alibaba/qwen-image-max.md) | [vendor/alibaba/qwen-image-max.md](vendor/alibaba/qwen-image-max.md) |
| 生图 | `z-image-turbo` Z-Image Turbo | alibaba | `openai-dalle` | [aggregator/alibaba/z-image-turbo.md](aggregator/alibaba/z-image-turbo.md) | [vendor/alibaba/z-image-turbo.md](vendor/alibaba/z-image-turbo.md) |
| 生图 | `qwen-image` Qwen Image | alibaba | `openai-dalle` | [aggregator/alibaba/qwen-image.md](aggregator/alibaba/qwen-image.md) | [vendor/alibaba/qwen-image.md](vendor/alibaba/qwen-image.md) |
| 生图 | `qwen-image-edit` Qwen Image Edit | alibaba | `qwen-edit` | [aggregator/alibaba/qwen-image-edit.md](aggregator/alibaba/qwen-image-edit.md) | [vendor/alibaba/qwen-image-edit.md](vendor/alibaba/qwen-image-edit.md) |
| 生图 | `midjourney` Midjourney | midjourney | `midjourney` | [aggregator/midjourney/midjourney.md](aggregator/midjourney/midjourney.md) | [vendor/midjourney/midjourney.md](vendor/midjourney/midjourney.md) |
| 生图 | `flux` Flux | bfl | `flux` | [aggregator/bfl/flux.md](aggregator/bfl/flux.md) | [vendor/bfl/flux.md](vendor/bfl/flux.md) |
| 生图 | `flux-pro-max` Flux Pro Max | bfl | `flux` | [aggregator/bfl/flux-pro-max.md](aggregator/bfl/flux-pro-max.md) | [vendor/bfl/flux-pro-max.md](vendor/bfl/flux-pro-max.md) |
| 生图 | `grok-4.1-image` Grok 4.1 Image | xai | `grok-image` | [aggregator/xai/grok-4.1-image.md](aggregator/xai/grok-4.1-image.md) | [vendor/xai/grok-4.1-image.md](vendor/xai/grok-4.1-image.md) |
| 生图 | `grok-4.2-image` Grok 4.2 Image | xai | `grok-image` | [aggregator/xai/grok-4.2-image.md](aggregator/xai/grok-4.2-image.md) | [vendor/xai/grok-4.2-image.md](vendor/xai/grok-4.2-image.md) |
| 生图 | `grok-imagine-image-quality` Grok Imagine Image Quality | xai | `grok-image` | [aggregator/xai/grok-imagine-image-quality.md](aggregator/xai/grok-imagine-image-quality.md) | [vendor/xai/grok-imagine-image-quality.md](vendor/xai/grok-imagine-image-quality.md) |
| 生视频 | `veo3.1` Google Veo 3.1 | google | `veo` | [aggregator/google/veo3.1.md](aggregator/google/veo3.1.md) | [vendor/google/veo3.1.md](vendor/google/veo3.1.md) |
| 生视频 | `veo3.1-fast` Google Veo 3.1 Fast | google | `veo` | [aggregator/google/veo3.1-fast.md](aggregator/google/veo3.1-fast.md) | [vendor/google/veo3.1-fast.md](vendor/google/veo3.1-fast.md) |
| 生视频 | `omni_flash-10s` Veo Omni Flash 10s | google | `veo` | [aggregator/google/omni_flash-10s.md](aggregator/google/omni_flash-10s.md) | [vendor/google/omni_flash-10s.md](vendor/google/omni_flash-10s.md) |
| 生视频 | `kling-video-v3` 可灵 Kling Video v3 | kuaishou | `kling` | [aggregator/kling/kling-video-v3.md](aggregator/kling/kling-video-v3.md) | [vendor/kling/kling-video-v3.md](vendor/kling/kling-video-v3.md) |
| 生视频 | `kling-video-v3-omni` 可灵 Kling Video v3 Omni | kuaishou | `kling` | [aggregator/kling/kling-video-v3-omni.md](aggregator/kling/kling-video-v3-omni.md) | [vendor/kling/kling-video-v3-omni.md](vendor/kling/kling-video-v3-omni.md) |
| 生视频 | `kling-video-v2-5-turbo` 可灵 Kling Video v2.5 Turbo | kuaishou | `kling` | [aggregator/kling/kling-video-v2-5-turbo.md](aggregator/kling/kling-video-v2-5-turbo.md) | [vendor/kling/kling-video-v2-5-turbo.md](vendor/kling/kling-video-v2-5-turbo.md) |
| 生视频 | `kling-video-v2-6` 可灵 Kling Video v2.6 | kuaishou | `kling` | [aggregator/kling/kling-video-v2-6.md](aggregator/kling/kling-video-v2-6.md) | [vendor/kling/kling-video-v2-6.md](vendor/kling/kling-video-v2-6.md) |
| 生视频 | `doubao-seedance-2-0-260128` 即梦 Seedance 2.0 | bytedance | `seedance` | [aggregator/volcengine/doubao-seedance-2-0-260128.md](aggregator/volcengine/doubao-seedance-2-0-260128.md) | [vendor/volcengine/doubao-seedance-2-0-260128.md](vendor/volcengine/doubao-seedance-2-0-260128.md) |
| 生视频 | `doubao-seedance-2-0-fast-260128` 即梦 Seedance 2.0 Fast | bytedance | `seedance` | [aggregator/volcengine/doubao-seedance-2-0-fast-260128.md](aggregator/volcengine/doubao-seedance-2-0-fast-260128.md) | [vendor/volcengine/doubao-seedance-2-0-fast-260128.md](vendor/volcengine/doubao-seedance-2-0-fast-260128.md) |
| 生视频 | `doubao-seedance-2.0-mini` 即梦 Seedance 2.0 mini | bytedance | `seedance` | [aggregator/volcengine/doubao-seedance-2.0-mini.md](aggregator/volcengine/doubao-seedance-2.0-mini.md) | [vendor/volcengine/doubao-seedance-2.0-mini.md](vendor/volcengine/doubao-seedance-2.0-mini.md) |
| 生视频 | `doubao-seedance-2.5` 即梦 Seedance 2.5 | bytedance | `seedance` | [aggregator/volcengine/doubao-seedance-2.5.md](aggregator/volcengine/doubao-seedance-2.5.md) | [vendor/volcengine/doubao-seedance-2.5.md](vendor/volcengine/doubao-seedance-2.5.md) |
| 生视频 | `sora-2` OpenAI Sora 2 | openai | `sora` | [aggregator/openai/sora-2.md](aggregator/openai/sora-2.md) | [vendor/openai/sora-2.md](vendor/openai/sora-2.md) |
| 生视频 | `sora-2-pro` OpenAI Sora 2 Pro | openai | `sora` | [aggregator/openai/sora-2-pro.md](aggregator/openai/sora-2-pro.md) | [vendor/openai/sora-2-pro.md](vendor/openai/sora-2-pro.md) |
| 生视频 | `MiniMax-H3` MiniMax-H3 | minimax | `minimax` | [aggregator/minimax/MiniMax-H3.md](aggregator/minimax/MiniMax-H3.md) | [vendor/minimax/MiniMax-H3.md](vendor/minimax/MiniMax-H3.md) |
| 生视频 | `wan3.0-video` 通义万相 Wan 3.0 | alibaba | `wan` | [aggregator/alibaba/wan3.0-video.md](aggregator/alibaba/wan3.0-video.md) | [vendor/alibaba/wan3.0-video.md](vendor/alibaba/wan3.0-video.md) |
| 生视频 | `grok-imagine-video-1.5` Grok Imagine Video 1.5 | xai | `grok-video` | [aggregator/xai/grok-imagine-video-1.5.md](aggregator/xai/grok-imagine-video-1.5.md) | [vendor/xai/grok-imagine-video-1.5.md](vendor/xai/grok-imagine-video-1.5.md) |
| 生视频 | `viduq3` Vidu Q3 | vidu | `vidu` | [aggregator/vidu/viduq3.md](aggregator/vidu/viduq3.md) | [vendor/vidu/viduq3.md](vendor/vidu/viduq3.md) |
| 生视频 | `viduq3-mix` Vidu Q3 Mix | vidu | `vidu` | [aggregator/vidu/viduq3-mix.md](aggregator/vidu/viduq3-mix.md) | [vendor/vidu/viduq3-mix.md](vendor/vidu/viduq3-mix.md) |
| 生视频 | `viduq3-turbo` Vidu Q3 Turbo | vidu | `vidu` | [aggregator/vidu/viduq3-turbo.md](aggregator/vidu/viduq3-turbo.md) | [vendor/vidu/viduq3-turbo.md](vendor/vidu/viduq3-turbo.md) |
| 生视频 | `viduq3-pro` Vidu Q3 Pro | vidu | `vidu` | [aggregator/vidu/viduq3-pro.md](aggregator/vidu/viduq3-pro.md) | [vendor/vidu/viduq3-pro.md](vendor/vidu/viduq3-pro.md) |
| 多模态 | `gpt-5.6-luna` GPT 5.6 Luna | openai | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `gpt-5.6-sol` GPT 5.6 Sol | openai | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `gpt-5.6-terra` GPT 5.6 Terra | openai | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `gpt-5.4-mini` GPT 5.4 Mini | openai | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `claude-opus-5` Claude Opus 5 | anthropic | `openai-chat` | [aggregator/chat/claude-messages.md](aggregator/chat/claude-messages.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `claude-fable-5` Claude Fable 5 | anthropic | `openai-chat` | [aggregator/chat/claude-messages.md](aggregator/chat/claude-messages.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `claude-opus-4-7` Claude Opus 4.7 | anthropic | `openai-chat` | [aggregator/chat/claude-messages.md](aggregator/chat/claude-messages.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `claude-haiku-4-5-20251001-thinking` Claude Haiku 4.5 Thinking | anthropic | `openai-chat` | [aggregator/chat/claude-messages.md](aggregator/chat/claude-messages.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `claude-sonnet-5` Claude Sonnet 5 | anthropic | `openai-chat` | [aggregator/chat/claude-messages.md](aggregator/chat/claude-messages.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `gemini-3.8-flash` Gemini 3.8 Flash | google | `openai-chat` | [aggregator/chat/gemini.md](aggregator/chat/gemini.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `gemini-3.7-flash` Gemini 3.7 Flash | google | `openai-chat` | [aggregator/chat/gemini.md](aggregator/chat/gemini.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `gemini-3.1-pro-preview` Gemini 3.1 Pro Preview | google | `openai-chat` | [aggregator/chat/gemini.md](aggregator/chat/gemini.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `deepseek-v4.1-flash` DeepSeek V4.1 Flash | deepseek | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `deepseek-v4-flash` DeepSeek V4 Flash | deepseek | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `qwen3.8-max` Qwen 3.8 Max | alibaba | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `grok-4.6` Grok 4.6 | xai | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |
| 多模态 | `kimi-k3` Kimi K3 | moonshot | `openai-chat` | [aggregator/chat/openai-chat.md](aggregator/chat/openai-chat.md) | [vendor/chat/multimodal-chat.md](vendor/chat/multimodal-chat.md) |

## 目录

```
docs/vendors/官方接口/
  README.md
  aggregator/   # openai google volcengine alibaba midjourney bfl kling xai minimax vidu chat
  vendor/       # 同上 + anthropic deepseek moonshot
  legacy/       # 官方接口转、comfly统一接口、万邦接口、三方解析
```


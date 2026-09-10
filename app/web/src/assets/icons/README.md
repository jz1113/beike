# 贝壳云图 · 统一矢量图库与图标资源库 (Unified SVG & Icons Library)

本目录为应用中所有使用到的 SVG 矢量图、模型厂商图标及功能图标的统一归集目录。

---

## 📁 目录结构

```text
icons/
├── ui/                     # 业务功能与界面交互矢量图标 (20 个标准 SVG)
│   ├── canvas-drawing.svg      # 绘图节点专属矢量图标
│   ├── canvas-video.svg        # 视频生成专属摄像机与播放镜头图标
│   ├── canvas-material.svg     # 素材上传双层卡片相片图标
│   ├── canvas-lighting.svg     # 3D 打光调节图标
│   ├── canvas-multiangle.svg   # 多角度全景环绕视角图标
│   ├── canvas-upload.svg       # 本地上传箭头托盘图标
│   ├── canvas-asset-folder.svg # 资产文件夹折角图标
│   ├── mode-image.svg          # 模式选择 · 图片生成图标
│   ├── mode-video.svg          # 模式选择 · 视频生成图标
│   ├── mode-depth-image.svg    # 模式选择 · 深度图片图标
│   ├── mode-depth-video.svg    # 模式选择 · 深度视频图标
│   ├── brand-onebound.svg      # 万邦电商 (OneBound) 官方矢量 Logo
│   ├── brand-taobao.svg        # 淘宝 (Taobao) 矢量 Logo
│   ├── brand-shell-tech.svg    # 贝壳科技集团品牌徽标
│   ├── brand-vision-pulse.svg  # 贝壳云图极简镜头微标
│   ├── action-reedit.svg       # 气泡框重新编辑图标
│   ├── action-regenerate.svg   # 双向回环再次生成图标
│   ├── nav-home.svg            # 全局导航 · 首页图标
│   ├── nav-generate.svg        # 全局导航 · 创作工作区图标
│   └── assistant-skill.svg     # AI 助理 · 技能微标
│
└── models/                 # 官方 AI 模型厂商 SVG 矢量图 (35 个主流厂商)
    ├── openai.svg          # OpenAI / GPT-4o / GPT Image
    ├── gemini.svg          # Google Gemini / Imagen
    ├── claude.svg          # Anthropic Claude
    ├── deepseek.svg        # DeepSeek
    ├── qwen.svg            # 阿里通义千问 (Qwen) / Wan 3.0
    ├── sora.svg            # Sora-2
    ├── runway.svg          # Runway Gen-3 / Gen-4
    ├── kling.svg           # 快手可灵 (Kling)
    ├── luma.svg            # Luma Ray-2
    ├── vidu.svg            # 生数科技 (Vidu)
    ├── minimax.svg         # MiniMax 海螺 / Hailuo
    ├── midjourney.svg      # Midjourney
    ├── flux.svg            # Black Forest Labs FLUX
    ├── recraft.svg         # Recraft V3
    ├── pika.svg            # Pika 2.0
    ├── ideogram.svg        # Ideogram 2.0
    ├── zhipu.svg           # 智谱清言 (GLM) / CogVideoX
    ├── baichuan.svg        # 百川智能 (Baichuan)
    ├── stepfun.svg         # 阶跃星辰 (StepFun)
    ├── kimi.svg            # 月之暗面 Kimi
    ├── sensenova.svg       # 商汤日日新 (SenseNova)
    ├── hunyuan.svg         # 腾讯混元 (Hunyuan)
    ├── baidu.svg           # 百度文心 (ERNIE)
    ├── huggingface.svg     # HuggingFace
    ├── replicate.svg       # Replicate
    ├── stability.svg       # Stability AI (SD 3.5)
    ├── suno.svg            # Suno 音乐模型
    ├── viggle.svg          # Viggle 人物动作模型
    ├── tripo.svg           # Tripo 3D 建模
    ├── yi.svg              # 零一万物 (01.AI)
    ├── jimeng.svg          # 字节即梦 (JiMeng)
    ├── baai.svg            # 智源研究院 (BAAI)
    ├── grok.svg            # xAI Grok
    ├── meta.svg            # Meta Llama
    └── mistral.svg         # Mistral AI
```

---

## 🚀 消费方式
1. **纯静态 Web 引用**：可在页面或 `<img src="/icons/ui/canvas-video.svg" />` 中直接引用。
2. **React 组件透传**：通过 `@/shared/icons` 导出的一等公民 React SVG 组件直接消费，支持父级 `currentColor` 随主题动态变色。

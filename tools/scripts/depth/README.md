# 深度视频推理环境

将抽帧后的 PNG 序列转为深度可视化帧，供 API `depthVideoPipeline` 与 `depthImagePipeline` 调用。

以下命令均在仓库根目录执行。

## 安装

### 一键检查（推荐）

```bash
pnpm run setup:depth-env
pnpm run setup:depth-model
```

`setup:depth-model` 会安装 `torch` + `transformers` + `Depth Anything V2`，这是产出真实深度动作捕捉效果的**必需步骤**（约 400MB）。

### 手动安装

```bash
# 1) 项目内 FFmpeg（已随 @beike/api 依赖安装，无需 brew）
pnpm install

# 2) Python 基础依赖（OpenCV 可视化）
python3 -m pip install --user -r tools/scripts/depth/requirements.txt

# 3) 真实 Depth Anything 模型（体积较大，需 torch）
python3 -m pip install --user torch transformers accelerate
```

若系统已安装 Homebrew，也可使用系统 FFmpeg：

```bash
brew install ffmpeg
```

可选环境变量：

- `DEPTH_VIDEO_PYTHON`：Python 可执行文件路径（默认 `python3`）

## 本地测试

```bash
python3 tools/scripts/depth/infer_video_depth.py --check-env

# 视频帧序列
python3 tools/scripts/depth/infer_video_depth.py \
  --input-dir /tmp/depth-video-test/frames \
  --output-dir /tmp/depth-video-test/depth \
  --style mocap \
  --quality standard

# 单张图片（高清档，自动按设备选择推理分辨率）
python3 tools/scripts/depth/infer_video_depth.py \
  --input-image /tmp/photo.jpg \
  --output-image /tmp/depth.png \
  --style mocap \
  --quality high
```

脚本会在 stdout 输出 `{"type":"meta",...}`，包含实际使用的 `modelId`、`inferenceSizePx` 与 `device`。

## 模型与清晰度档位

前端可选择三档清晰度，API 通过 `--quality` 传入：

| 档位 | 模型 | 推理分辨率 | 视频最大宽度 | 编码 | mocap 后处理 |
|------|------|-----------|-------------|------|-------------|
| `fast` | Small | 518px | 960px | CRF 23 / medium | 标准双边滤波 + gamma 0.62 |
| `standard`（默认） | Base | 518px | 1280px | CRF 20 / medium | 标准双边滤波 + gamma 0.62 |
| `high` | Large | CUDA 1024 / MPS 768 / CPU 518 | 2560px | CRF 15 / slow | 跳过双边滤波 + gamma 0.78 + 强锐化 |

高清档与标准档的核心差异：

1. **更高推理分辨率**（官方推荐提升 input-size 以增加细节）
2. **轻量化 mocap 后处理**（减少平滑，保留边缘）
3. **视频**：更高抽帧上限与更低 CRF 编码

### A/B 验证建议

用同一张 2K 人像分别生成 `standard` 与 `high`，对比发梢/衣褶边缘。API 响应会返回 `inferenceSizePx` 与 `modelId`，可确认高清档确实使用了 Large + 768/1024。

- **stub 模式**（`--mode stub`）：快速伪深度，用于无 GPU / 无 torch 环境的本地调试。
- 视频时序平滑使用 3 帧**中值滤波**；高清档为减少运动模糊改为单帧（window=1）。

后续可替换为 [Video-Depth-Anything](https://github.com/DepthAnything/Video-Depth-Anything) 以进一步提升时序一致性。

---
model: "wan3.0-video"
capability: "video"
vendor: "alibaba"
source: "aggregator"
apifoxId: "515688928"
sourceUrl: "https://gpt-best.apifox.cn/api-515688928.md"
fetchedAt: "2026-09-19"
---
# wan3.0-video — wan3.0-video-unified

来源：https://gpt-best.apifox.cn/api-515688928.md

# wan3.0-video 统一格式 

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/videos:
    post:
      summary: 'wan3.0-video 统一格式 '
      deprecated: false
      description: |
        统一支持文生视频、图生视频（首帧 / 首尾帧）和参考生视频。
        prompt 与媒体素材至少提供其一。

        模式推断（未传 mode 且未传官方 media 时）：
        - 有视频 / 音频 / file / link：参考生视频
        - 正好 1 或 2 张图：图生视频（第 1 张为首帧，第 2 张为尾帧）
        - 其他：参考生视频

        reference_* / file / link 与 first_frame / last_frame 互斥，不能混用。
      operationId: createQwenWan3Video
      tags:
        - 123、未开放
        - qwen_wan3
      parameters:
        - name: Authorization
          in: header
          description: ''
          required: false
          example: Bearer {{YOUR_API_KEY}}
          schema:
            type: string
            default: Bearer {{YOUR_API_KEY}}
      requestBody:
        content:
          application/json:
            schema:
              type: object
              description: prompt 与媒体素材至少提供其一。也可直接传官方 input / parameters。
              properties:
                model:
                  type: string
                  examples:
                    - wan3.0-video
                  enum:
                    - wan3.0-video
                    - wan3.0-video-prime
                  x-apifox-enum:
                    - value: wan3.0-video
                      name: ''
                      description: ''
                    - value: wan3.0-video-prime
                      name: ''
                      description: 快速版
                prompt:
                  type: string
                  description: 文本提示词，中英文均可，最长 20000 字符。参考模式下可用「图1」「视频1」指代 media 顺序。
                mode:
                  type: string
                  description: 未传 media 时生效。自动推导用什么mode
                  enum:
                    - image-to-video
                    - reference-to-video
                  x-apifox-enum:
                    - value: image-to-video
                      name: ''
                      description: ''
                    - value: reference-to-video
                      name: ''
                      description: ''
                resolution:
                  type: string
                  description: 未识别时默认 1080P。
                  enum:
                    - 480P
                    - 720P
                    - 1080P
                  default: 1080P
                  x-apifox-enum:
                    - value: 480P
                      name: ''
                      description: ''
                    - value: 720P
                      name: ''
                      description: ''
                    - value: 1080P
                      name: ''
                      description: ''
                aspect_ratio:
                  type: string
                  description: 也可用从 size 推导。无法识别时为 adaptive。
                  enum:
                    - adaptive
                    - '16:9'
                    - '4:3'
                    - '1:1'
                    - '3:4'
                    - '9:16'
                  default: adaptive
                duration:
                  type: integer
                  description: 也支持字段名称 seconds。
                  examples:
                    - 5
                audio:
                  type: boolean
                  description: 输出是否含音轨，默认 true。
                  default: true
                prompt_extend:
                  type: boolean
                  description: 是否智能改写 prompt，默认 true。
                  default: true
                watermark:
                  type: boolean
                  description: 是否加水印，默认 false。
                  default: false
                seed:
                  type: integer
                  description: 随机种子，大于 0 时传给上游。范围 0 到 2147483647。
                image_urls:
                  type: array
                  items:
                    type: string
                  description: >-
                    图片列表。也可用
                    imageUrls、images、input_reference、first_frame_url、last_frame_url。
                  maxItems: 10
                video_urls:
                  type: array
                  items:
                    type: string
                  description: 参考视频。最多 5 段，总时长不超过 15 秒。也可用 videoUrls、input_video、video_url。
                  maxItems: 5
                audio_urls:
                  type: array
                  items:
                    type: string
                  description: 参考音频。最多 5 段。也可用 audioUrls、input_audio、audio_url。
                  maxItems: 5
                file:
                  type: string
                  description: 参考文件 URL。不可与 link 同时传。也可用 fileUrl。
                link:
                  type: string
                  description: 公开网页 URL。不可与 file 同时传。也可用 linkUrl。
                media:
                  type: array
                  description: >-
                    官方格式媒体数组。传入后不再按 image_urls 等字段推断。reference_* / file / link 与
                    first_frame / last_frame / video_urls/ audio_urls / file /
                    link 互斥。
                  items:
                    type: object
                    required:
                      - type
                      - url
                    properties:
                      type:
                        type: string
                        enum:
                          - first_frame
                          - last_frame
                          - reference_image
                          - reference_video
                          - reference_audio
                          - file
                          - link
                      url:
                        type: string
                        description: 公网 URL、OSS 临时 URL 或图像 Base64 data URI。
                    x-apifox-orders:
                      - type
                      - url
              x-apifox-orders:
                - model
                - prompt
                - mode
                - resolution
                - aspect_ratio
                - duration
                - audio
                - prompt_extend
                - watermark
                - seed
                - image_urls
                - video_urls
                - audio_urls
                - file
                - link
                - media
              required:
                - model
                - prompt
            examples:
              textToVideo:
                value:
                  model: wan3.0-video
                  prompt: 一只小猫在月光下的屋顶上奔跑，城市的霓虹灯在远处闪烁，电影级画质，流畅运镜。
                  resolution: 1080P
                  aspect_ratio: '16:9'
                  duration: '5'
                  prompt_extend: true
                  audio: true
                summary: 文生视频
              firstFrame:
                value:
                  model: wan3.0-video
                  prompt: 涂鸦少年从混凝土墙上活过来，在铁路桥下唱英文 rap。
                  image_url: https://example.com/first.png
                  resolution: 720P
                  seconds: '5'
                summary: 首帧生视频
              firstLastFrame:
                value:
                  model: wan3.0-video
                  prompt: 年轻女孩从微笑逐渐变为大笑，镜头缓缓推进。
                  mode: image-to-video
                  image_urls:
                    - https://example.com/first.png
                    - https://example.com/last.png
                  resolution: 1080P
                  duration: 5
                summary: 首尾帧生视频
              referenceToVideo:
                value:
                  model: wan3.0-video
                  prompt: 视频1抱着图3，在图4的椅子上弹奏乡村民谣。
                  image_urls:
                    - https://example.com/girl.jpg
                    - https://example.com/object.png
                    - https://example.com/chair.png
                    - https://example.com/bg.png
                  video_urls:
                    - https://example.com/role.mp4
                  resolution: 480P
                  ratio: adaptive
                  seconds: '5'
                summary: 参考生视频
              fileToVideo:
                value:
                  model: wan3.0-video
                  prompt: 一支高端智能眼镜产品广告，极简未来感。
                  file: https://example.com/glass.pptx
                  resolution: 1080P
                  duration: 10
                summary: 参考文件生视频
              officialMedia:
                value:
                  model: wan3.0-video
                  prompt: 图1中的人物走过视频1的场景。
                  media:
                    - type: reference_image
                      url: https://example.com/person.png
                    - type: reference_video
                      url: https://example.com/scene.mp4
                  parameters:
                    resolution: 1080P
                    ratio: adaptive
                    duration: 5
                    prompt_extend: true
                summary: 官方 media 数组
      responses:
        '200':
          description: 任务已提交
          content:
            application/json:
              schema:
                type: object
                required:
                  - id
                  - object
                  - status
                properties:
                  id:
                    type: string
                    description: 上游 task_id。
                  object:
                    type: string
                    examples:
                      - video
                  model:
                    type: string
                  status:
                    type: string
                    enum:
                      - queued
                      - in_progress
                      - completed
                      - failed
                  progress:
                    type: integer
                    format: int64
                    description: 成功时为 100。
                  created_at:
                    type: integer
                    format: int64
                    description: Unix 秒。
                  seconds:
                    type: string
                    description: 创建时回显时长；智能时长为 auto。
                  size:
                    type: string
                  video_url:
                    type: string
                    description: 仅 completed 时返回，有效期 24 小时。
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                      code:
                        type: string
                    x-apifox-orders:
                      - message
                      - code
                x-apifox-orders:
                  - id
                  - object
                  - model
                  - status
                  - progress
                  - created_at
                  - seconds
                  - size
                  - video_url
                  - error
              example:
                id: 0385dc79-5ff8-4d82-bcb6-xxxxxx
                object: video
                model: wan3.0-video
                status: queued
                progress: 0
                created_at: 1756000000
                seconds: '5'
                size: ''
          headers: {}
          x-apifox-name: ''
        '400':
          description: 请求错误
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                      type:
                        type: string
                      param:
                        type: string
                      code:
                        type: string
                    x-apifox-orders:
                      - message
                      - type
                      - param
                      - code
                x-apifox-orders:
                  - error
              example:
                error:
                  message: prompt or media is required
                  type: openai_error
                  param: ''
                  code: invalid_request
          headers: {}
          x-apifox-name: ''
        '401':
          description: 未授权
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                      type:
                        type: string
                      param:
                        type: string
                      code:
                        type: string
                    x-apifox-orders:
                      - message
                      - type
                      - param
                      - code
                x-apifox-orders:
                  - error
          headers: {}
          x-apifox-name: ''
      security: []
      x-apifox-folder: 123、未开放
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-515688928-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

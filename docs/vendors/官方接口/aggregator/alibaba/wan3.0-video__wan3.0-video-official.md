---
model: "wan3.0-video"
capability: "video"
vendor: "alibaba"
source: "aggregator"
apifoxId: "510825402"
sourceUrl: "https://gpt-best.apifox.cn/api-510825402.md"
fetchedAt: "2026-09-19"
---
# wan3.0-video — wan3.0-video-official

来源：https://gpt-best.apifox.cn/api-510825402.md

# wan3.0-video（官方格式）

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /qwen/api/v1/services/aigc/video-generation/video-synthesis:
    post:
      summary: wan3.0-video（官方格式）
      deprecated: false
      description: >-
        创建异步视频生成任务。`input.prompt` 和 `input.media` 至少填写一个。

        `reference_*`、`file`、`link` 类型不能与 `first_frame`、`last_frame` 类型混用。

        官方文档链接：

        https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference
      operationId: createVideoGenerationTask
      tags:
        - 123、未开放
        - VideoGeneration
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
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  description: 模型名称。
                  enum:
                    - wan3.0-video-prime
                    - wan3.0-video
                input:
                  type: object
                  description: 输入信息。prompt 和 media 至少填写一个。
                  minProperties: 1
                  properties:
                    prompt:
                      type: string
                      maxLength: 20000
                      description: |
                        描述期望生成的视频内容，支持中英文。全能参考模式下可使用“图1”、
                        “视频1”、“音频1”等称呼引用 media 中同类素材的出现顺序。
                    media:
                      type: array
                      minItems: 1
                      description: |
                        媒体素材列表。图片最多 10 张；视频最多 5 段且总时长不超过 15 秒；
                        音频最多 5 段且总时长不超过 15 秒；文件或网页链接最多 1 个且二者互斥；
                        首帧、尾帧各最多 1 张。各类素材的组合限制需由调用方遵守。
                      items:
                        type: object
                        required:
                          - type
                          - url
                        properties:
                          type:
                            type: string
                            description: 媒体素材类型。
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
                            description: |
                              公网 HTTP(S) URL、OSS 临时 URL；图片还可传入
                              `data:{MIME_type};base64,{base64_data}` 格式的数据。
                            examples:
                              - https://example.com/reference.png
                        x-apifox-orders:
                          - type
                          - url
                  anyOf:
                    - type: string
                    - type: string
                  x-apifox-orders:
                    - prompt
                    - media
                parameters:
                  type: object
                  description: 视频生成参数。
                  properties:
                    resolution:
                      type: string
                      description: 输出分辨率档位。
                      enum:
                        - 1080P
                        - 720P
                        - 480P
                      default: 1080P
                    ratio:
                      type: string
                      description: 输出视频宽高比。
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
                      description: |
                        输出时长（秒）。`-1` 表示智能时长；无视频输入时可取 2～30；
                        有视频输入时，输入视频总时长与输出视频时长之和不得超过 30 秒。
                      default: 5
                      oneOf:
                        - type: string
                        - type: string
                    audio:
                      type: boolean
                      description: 输出视频是否包含音轨。
                      default: true
                    seed:
                      type: integer
                      minimum: 0
                      maximum: 2147483647
                      description: 用于复现生成结果的随机种子。
                    prompt_extend:
                      type: boolean
                      description: 是否启用提示词智能改写。
                      default: true
                    watermark:
                      type: boolean
                      description: 是否添加水印标识。
                      default: false
                  x-apifox-orders:
                    - resolution
                    - ratio
                    - duration
                    - audio
                    - seed
                    - prompt_extend
                    - watermark
              x-apifox-orders:
                - model
                - input
                - parameters
            examples:
              textToVideo:
                value:
                  model: wan3.0-video
                  input:
                    prompt: 一只小猫在月光下的屋顶上奔跑，城市的霓虹灯在远处闪烁，电影级画质，流畅运镜。
                  parameters:
                    resolution: 480P
                    ratio: adaptive
                    duration: 5
                    prompt_extend: true
                summary: 文生视频
              firstAndLastFrame:
                value:
                  model: wan3.0-video
                  input:
                    prompt: 一个年轻女孩从微笑逐渐变为大笑，镜头缓缓推进，背景光线从冷色调渐变为暖色调。
                    media:
                      - type: first_frame
                        url: https://example.com/first.png
                      - type: last_frame
                        url: https://example.com/last.jpg
                  parameters:
                    resolution: 480P
                    ratio: adaptive
                    duration: 5
                    prompt_extend: true
                summary: 首尾帧生视频
      responses:
        '200':
          description: 任务创建成功。
          content:
            application/json:
              schema:
                type: object
                required:
                  - output
                  - request_id
                properties:
                  output:
                    type: object
                    required:
                      - task_id
                      - task_status
                    properties:
                      task_id:
                        type: string
                        description: 任务 ID，有效期为 24 小时。
                      task_status:
                        type: string
                        enum:
                          - PENDING
                          - RUNNING
                          - SUCCEEDED
                          - FAILED
                          - CANCELED
                          - UNKNOWN
                    x-apifox-orders:
                      - task_id
                      - task_status
                  request_id:
                    type: string
                    description: 请求唯一标识。
                x-apifox-orders:
                  - output
                  - request_id
              example:
                output:
                  task_status: PENDING
                  task_id: 0385dc79-5ff8-4d82-bcb6-xxxxxx
                request_id: 4909100c-7b5a-9f92-bfe5-xxxxxx
          headers: {}
          x-apifox-name: ''
        '400':
          description: 请求参数错误。
          content:
            application/json:
              schema:
                type: object
                required:
                  - code
                  - message
                  - request_id
                properties:
                  code:
                    type: string
                    description: 错误码。
                  message:
                    type: string
                    description: 错误详情。
                  request_id:
                    type: string
                    description: 请求唯一标识。
                x-apifox-orders:
                  - code
                  - message
                  - request_id
              example:
                code: InvalidParameter
                message: Invalid request parameter.
                request_id: 7438d53d-6eb8-4596-8835-xxxxxx
          headers: {}
          x-apifox-name: ''
        '401':
          description: API Key 缺失或无效。
          content:
            application/json:
              schema:
                type: object
                required:
                  - code
                  - message
                  - request_id
                properties:
                  code:
                    type: string
                  message:
                    type: string
                  request_id:
                    type: string
                x-apifox-orders:
                  - code
                  - message
                  - request_id
              example:
                code: InvalidApiKey
                message: No API-key provided.
                request_id: 7438d53d-6eb8-4596-8835-xxxxxx
          headers: {}
          x-apifox-name: ''
        default:
          description: 其他错误。
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: string
                  message:
                    type: string
                  request_id:
                    type: string
                x-apifox-orders:
                  - code
                  - message
                  - request_id
          headers: {}
          x-apifox-name: ''
      security: []
      x-apifox-folder: 123、未开放
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-510825402-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

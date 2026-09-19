---
model: "doubao-seedance-2-0-fast-260128"
capability: "video"
vendor: "volcengine"
source: "aggregator"
apifoxId: "510675713"
sourceUrl: "https://gpt-best.apifox.cn/api-510675713.md"
fetchedAt: "2026-09-19"
---
# doubao-seedance-2-0-fast-260128 — seedance-2-0-fast-unified

来源：https://gpt-best.apifox.cn/api-510675713.md

# doubao-seedance-2-0-fast-260128 统一格式

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v2/videos/generations:
    post:
      summary: doubao-seedance-2-0-fast-260128 统一格式
      deprecated: false
      description: 统一接口格式
      tags:
        - 123、未开放
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
              properties:
                prompt:
                  type: string
                  description: >-
                    文本提示词（必填）：支持中英文。建议不超过500字。字数过多信息容易分散，模型可能因此忽略细节，只关注重点，造成视频缺失部分元素
                  x-apifox-mock: cat dance
                  title: 白猫戴上墨镜，流畅跳舞过渡，画面风格统一
                model:
                  type: string
                  description: |+
                    型号名称。示例：sdols-2.0

                  x-apifox-mock: sdols-2.0
                  enum:
                    - doubao-seedance-2-0-260128
                    - doubao-seedance-2-0-fast-260128
                    - doubao-seedance-2.0-mini
                  x-apifox-enum:
                    - value: doubao-seedance-2-0-260128
                      name: ''
                      description: ''
                    - value: doubao-seedance-2-0-fast-260128
                      name: ''
                      description: ''
                    - value: doubao-seedance-2.0-mini
                      name: ''
                      description: ''
                  title: doubao-seedance-2-0-260128
                  nullable: true
                duration:
                  type: integer
                  description: 生成视频的持续时间（以秒为单位）。4-15s
                  x-apifox-mock: '5'
                  enum:
                    - 5
                    - 10
                  x-apifox-enum:
                    - value: 5
                      name: ''
                      description: ''
                    - value: 10
                      name: ''
                      description: ''
                  default: 5
                watermark:
                  type: boolean
                  description: |+
                    指定是否添加水印。水印位于视频的右下角，注明“由人工智能生成”。

                  default: false
                seed:
                  type: integer
                  description: |
                    一个随机数种子，用于控制模型生成的内容的随机性。该值必须在 [0， 2147483647] 的范围内。
                    如果不提供此参数，则算法会自动为种子生成一个随机数。如果希望生成的内容保持相对稳定，可以使用相同的种子值。
                resolution:
                  type: string
                  description: |
                    视频分辨率
                  enum:
                    - 480p
                    - 720p
                    - 1080p
                  x-apifox-enum:
                    - value: 480p
                      name: ''
                      description: ''
                    - value: 720p
                      name: ''
                      description: ''
                    - value: 1080p
                      name: ''
                      description: ''
                  default: 480p
                return_last_frame:
                  type: boolean
                  description: >-
                    true：返回生成视频的尾帧图像。尾帧图像的格式为
                    png，宽高像素值与生成的视频一致，无水印。您可通过查询视频生成任务接口获取视频的尾帧图像。

                    false：不返回生成视频的尾帧图像。
                  default: false
                ratio:
                  type: string
                  description: |-
                    生成视频的宽高比例
                    21:9
                    16:9 
                    4:3
                    1:1
                    3:4
                    9:16
                    9:21
                    adaptive：根据所上传图片的比例，自动选择最合适的宽高比。
                  default: '16:9'
                generate_audio:
                  type: boolean
                tools:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                        description: web_search
                        x-apifox-mock: web_search
                    x-apifox-orders:
                      - type
                    required:
                      - type
              required:
                - prompt
                - model
                - duration
              x-apifox-orders:
                - prompt
                - model
                - duration
                - resolution
                - ratio
                - watermark
                - seed
                - return_last_frame
                - generate_audio
                - tools
            examples:
              '1':
                value:
                  model: doubao-seedance-2-0-fast-260128
                  prompt: 一只戴着黑色墨镜的白猫正在开心地跳舞，动作自然流畅，镜头缓慢推进
                  duration: 5
                  ratio: '16:9'
                  resolution: 720p
                summary: 文生视频
              '2':
                value:
                  model: doubao-seedance-2-0-fast-260128
                  prompt: 白猫戴上墨镜跳舞
                  image: https://output.anyroutes.cn/demo/demo_glasses.png
                  duration: 5
                  ratio: '16:9'
                  resolution: 720p
                summary: 图生视频
              '3':
                value:
                  model: doubao-seedance-2-0-fast-260128
                  prompt: 白猫从普通状态逐渐戴上墨镜，动作自然连贯，最后定格为戴着墨镜的状态
                  first_frame: https://output.anyroutes.cn/demo/demo_cat.png
                  last_frame: https://output.anyroutes.cn/demo/demo_glasses.png
                  duration: 5
                  ratio: '16:9'
                  resolution: 720p
                  generate_audio: true
                summary: 首尾帧生视频
              '4':
                value:
                  model: doubao-seedance-2-0-fast-260128
                  prompt: 参考图片中的白猫戴墨镜造型，并参考视频中的跳舞动作和节奏，生成一段自然连贯的白猫戴墨镜跳舞视频
                  reference_images:
                    - https://output.anyroutes.cn/demo/demo_glasses.png
                  reference_video: https://output.anyroutes.cn/demo/demo_cat_glasses.mp4
                  duration: 5
                  ratio: '16:9'
                  resolution: 720p
                  generate_audio: true
                summary: 多模态参考生视频
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  task_id:
                    type: string
                required:
                  - task_id
                x-apifox-orders:
                  - task_id
              example:
                task_id: cgt-20250831141439-sqmgf
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 123、未开放
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-510675713-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

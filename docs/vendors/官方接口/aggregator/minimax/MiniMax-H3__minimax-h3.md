---
model: "MiniMax-H3"
capability: "video"
vendor: "minimax"
source: "aggregator"
apifoxId: "495802284"
sourceUrl: "https://gpt-best.apifox.cn/api-495802284.md"
fetchedAt: "2026-09-19"
---
# MiniMax-H3 — minimax-h3

来源：https://gpt-best.apifox.cn/api-495802284.md

# MiniMax-H3

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
      summary: MiniMax-H3
      deprecated: false
      description: ''
      tags:
        - 视频模型/MiniMax-H3
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
          multipart/form-data:
            schema:
              type: object
              properties:
                model:
                  example: MiniMax-H3
                  type: string
                prompt:
                  example: 基于这张图片生成视频
                  type: string
                mode:
                  type: string
                  enum:
                    - multimodal-to-video
                    - image-to-video
                    - text-to-video
                  x-apifox-enum:
                    - value: multimodal-to-video
                      name: 多模态参考生视频
                      description: ''
                    - value: image-to-video
                      name: 首尾帧生视频
                      description: ''
                    - value: text-to-video
                      name: 文生视频
                      description: ''
                  description: 指定参考模式，不传时自动判断模式
                  example: multimodal-to-video
                seconds:
                  description: 5~15
                  example: '5'
                  type: string
                resolution:
                  type: string
                  enum:
                    - 2k
                    - 768P
                  x-apifox-enum:
                    - value: 2k
                      name: ''
                      description: ''
                    - value: 768P
                      name: ''
                      description: ''
                  example: 2K、768P
                aspect_ratio:
                  type: string
                  enum:
                    - adaptive
                    - '21:9'
                    - '16:9'
                    - '4:3'
                    - '1:1'
                    - '3:4'
                    - '9:16'
                  x-apifox-enum:
                    - value: adaptive
                      name: ''
                      description: 图生视频固定是 adaptive
                    - value: '21:9'
                      name: ''
                      description: ''
                    - value: '16:9'
                      name: ''
                      description: ''
                    - value: '4:3'
                      name: ''
                      description: ''
                    - value: '1:1'
                      name: ''
                      description: ''
                    - value: '3:4'
                      name: ''
                      description: ''
                    - value: '9:16'
                      name: ''
                      description: ''
                  description: >-
                    生成视频的宽高比，默认 adaptive（自动，由输入自适应选择最合适的宽高比，实际比例可在查询接口的 ratio
                    字段获取）。可用值：adaptive、21:9、16:9、4:3、1:1、3:4、9:16。


                    文生视频（t2va，content 仅含 text）：ratio 必填，且不能为 adaptive；可用值
                    21:9、16:9、4:3、1:1、3:4、9:16。


                    图生视频（i2va，content 含 first_frame / last_frame
                    图片）：宽高比由输入图片决定，ratio 恒为 adaptive；传入其他合理值不会报错，但会被忽略并按
                    adaptive 处理。


                    多模态参考生视频（r2va，content 含 reference_image / reference_video /
                    reference_audio）：ratio 可选，默认 adaptive；也可显式指定上述任一具体比例。


                    可用选项: adaptive, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 
                  example: adaptive
                imageUrls:
                  type: array
                  items:
                    type: string
                  maxItems: 9
                  description: |-
                    最多支持 9 项图片，每张 30 MB
                    参考图（最多 9 张，<30MB/张）
                  example: ''
                videoUrls:
                  type: array
                  items:
                    type: string
                  description: |-
                    最多支持 3 项视频，每个 50 MB
                    参考视频（MP4/MOV，<50MB，2-15s）
                  example: ''
                audioUrls:
                  type: array
                  items:
                    type: string
                  description: |-
                    最多支持 3 项音频，每个 15 MB
                    参考音频（MP3/WAV，<15MB，2-15s）
                  example:
                    - ''
              required:
                - model
                - prompt
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
              example:
                id: '2083454570230865921'
                task_id: '2083454570230865921'
                object: video
                model: MiniMax-H3
                status: queued
                progress: 0
                created_at: 1785569253
                seconds: '5'
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/MiniMax-H3
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-495802284-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

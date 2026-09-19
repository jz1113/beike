---
model: "kling-video-v3"
capability: "video"
vendor: "kling"
source: "aggregator"
apifoxId: "216574020"
sourceUrl: "https://gpt-best.apifox.cn/api-216574020.md"
fetchedAt: "2026-09-19"
---
# kling-video-v3 — kling-image2video

来源：https://gpt-best.apifox.cn/api-216574020.md

# 图生视频

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /kling/v1/videos/image2video:
    post:
      summary: 图生视频
      deprecated: false
      description: >+
        本文档不实时更新，完整版请查看官方文档：https://docs.qingque.cn/d/home/eZQClW07IFEuX1csc-VejdY2M

      tags:
        - 快手可灵(官方格式)
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
                image:
                  type: string
                  description: >-
                    参考图像，必须，支持Base64编码或图片URL，支持.jpg / .jpeg /
                    .png格式，大小不能超过10MB，分辨率不小于300*300px
                image_tail:
                  type: string
                  description: >-
                    参考图像 - 尾帧控制，可选，支持Base64编码或图片URL，支持.jpg / .jpeg /
                    .png格式，大小不能超过10MB，分辨率不小于300*300px
                prompt:
                  type: string
                  description: 正向文本提示， 可选，不能超过500个字符
                  maxLength: 5000
                negative_prompt:
                  type: string
                  description: 负向文本提示，可选，不能超过200个字符
                  maxLength: 2000
                cfg_scale:
                  type: number
                  description: 生成视频的自由度，可选，值越大相关性越强，取值范围：[0, 1]
                  minimum: 0
                  maximum: 1
                mode:
                  type: string
                  description: 生成视频的模式，可选，枚举值：std（高性能）或 pro（高表现）
                  enum:
                    - std（高性能）
                    - pro（高表现）
                  x-apifox-enum:
                    - value: std（高性能）
                      name: ''
                      description: ''
                    - value: pro（高表现）
                      name: ''
                      description: ''
                duration:
                  type: string
                  description: 生成视频时长，单位秒，可选，枚举值：5，10（包含尾帧的请求仅支持5秒）
                  enum:
                    - '5'
                    - '10'
                  x-apifox-enum:
                    - value: '5'
                      name: ''
                      description: ''
                    - value: '10'
                      name: ''
                      description: ''
                callback_url:
                  type: string
                  description: 本次任务结果回调通知地址，可选
                model_name:
                  type: string
                  description: kling-v1、kling-v1-5、kling-v1-6
              x-apifox-orders:
                - model_name
                - image
                - image_tail
                - prompt
                - negative_prompt
                - cfg_scale
                - mode
                - duration
                - callback_url
              required:
                - image
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: 错误码；具体定义错误码
                  message:
                    type: string
                    description: 错误信息
                  request_id:
                    type: string
                    description: 请求ID，系统生成，用于跟踪请求、排查问题
                  data:
                    type: object
                    properties:
                      task_id:
                        type: string
                        description: 任务ID，系统生成
                      task_status:
                        type: string
                        description: >-
                          任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
                        enum:
                          - submitted（已提交）
                          - processing（处理中）
                          - succeed（成功）
                          - failed（失败）
                        x-apifox-enum:
                          - value: submitted（已提交）
                            name: ''
                            description: ''
                          - value: processing（处理中）
                            name: ''
                            description: ''
                          - value: succeed（成功）
                            name: ''
                            description: ''
                          - value: failed（失败）
                            name: ''
                            description: ''
                      created_at:
                        type: integer
                        description: 任务创建时间，Unix时间戳、单位ms
                      updated_at:
                        type: integer
                        description: 任务更新时间，Unix时间戳、单位ms
                    x-apifox-orders:
                      - task_id
                      - task_status
                      - created_at
                      - updated_at
                    required:
                      - task_id
                      - task_status
                      - created_at
                      - updated_at
                x-apifox-orders:
                  - code
                  - message
                  - request_id
                  - data
                required:
                  - code
                  - message
                  - request_id
                  - data
              example:
                code: 0
                message: string
                request_id: string
                data:
                  task_id: string
                  task_status: string
                  created_at: 0
                  updated_at: 0
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 快手可灵(官方格式)
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-216574020-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

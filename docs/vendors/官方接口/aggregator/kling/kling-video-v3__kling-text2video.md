---
model: "kling-video-v3"
capability: "video"
vendor: "kling"
source: "aggregator"
apifoxId: "216574019"
sourceUrl: "https://gpt-best.apifox.cn/api-216574019.md"
fetchedAt: "2026-09-19"
---
# kling-video-v3 — kling-text2video

来源：https://gpt-best.apifox.cn/api-216574019.md

# 文生视频

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /kling/v1/videos/text2video:
    post:
      summary: 文生视频
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
                prompt:
                  type: string
                  description: 正向文本提示，必须，不能超过500个字符
                  maxLength: 500
                negative_prompt:
                  type: string
                  description: 负向文本提示，可选，不能超过200个字符
                  maxLength: 200
                cfg_scale:
                  type: number
                  description: 生成视频的自由度，可选，值越大，相关性越强，取值范围：[0,1]
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
                camera_control:
                  type: object
                  properties:
                    type:
                      type: string
                    config:
                      type: object
                      properties:
                        horizontal:
                          type: integer
                          minimum: -10
                          maximum: 10
                          description: 水平运镜，可选，取值范围：[-10, 10]
                        vertical:
                          type: integer
                          minimum: -10
                          maximum: 10
                          description: 垂直运镜，可选，取值范围：[-10, 10]
                        pan:
                          type: integer
                          description: 水平摇镜，可选，取值范围：[-10, 10]
                          minimum: -10
                          maximum: 10
                        tilt:
                          type: integer
                          description: 垂直摇镜，可选，取值范围：[-10, 10]
                          minimum: -10
                          maximum: 10
                        roll:
                          type: integer
                          description: 旋转运镜，可选，取值范围：[-10, 10]
                          minimum: -10
                          maximum: 10
                        zoom:
                          type: integer
                          description: 变焦，可选，取值范围：[-10, 10]
                          minimum: -10
                          maximum: 10
                      x-apifox-orders:
                        - horizontal
                        - vertical
                        - pan
                        - tilt
                        - roll
                        - zoom
                      description: 包含六个字段，用于指定摄像机的运动或变化
                  x-apifox-orders:
                    - type
                    - config
                  description: 控制摄像机运动的协议，可选，未指定则智能匹配
                aspect_ratio:
                  type: string
                  description: 生成视频的画面纵横比，可选，枚举值：16:9, 9:16, 1:1
                  enum:
                    - '16:9'
                    - '9:16'
                    - '1:1'
                  x-apifox-enum:
                    - value: '16:9'
                      name: ''
                      description: ''
                    - value: '9:16'
                      name: ''
                      description: ''
                    - value: '1:1'
                      name: ''
                      description: ''
                duration:
                  type: string
                  description: 生成视频时长，单位秒，可选，枚举值：5，10
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
                - prompt
                - negative_prompt
                - cfg_scale
                - mode
                - camera_control
                - aspect_ratio
                - duration
                - callback_url
              required:
                - prompt
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
                        description: |
                          任务ID，系统生成
                      task_status:
                        type: string
                        description: >-
                          任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
                        enum:
                          - submitted（已提交
                          - processing（处理中）
                          - succeed（成功）
                          - failed（失败）
                        x-apifox-enum:
                          - value: submitted（已提交
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
                      - updated_at
                      - created_at
                      - task_status
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-216574019-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

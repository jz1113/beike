---
model: "grok-imagine-image-quality"
capability: "image"
vendor: "xai"
source: "aggregator"
apifoxId: "515605101"
sourceUrl: "https://gpt-best.apifox.cn/api-515605101.md"
fetchedAt: "2026-09-19"
---
# grok-imagine-image-quality — grok-imagine-image-quality-edits

来源：https://gpt-best.apifox.cn/api-515605101.md

# grok-imagine-image-quality （图像编辑）统一格式

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/edits:
    post:
      summary: grok-imagine-image-quality （图像编辑）统一格式
      deprecated: false
      description: ''
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
                model:
                  type: string
                  enum:
                    - grok-4.2-image
                    - grok-4.1-image
                  x-apifox-enum:
                    - value: grok-4.2-image
                      name: ''
                      description: ''
                    - value: grok-4.1-image
                      name: ''
                      description: ''
                prompt:
                  type: string
                aspect_ratio:
                  type: string
                  enum:
                    - '1:1'
                    - '2:3'
                    - '3:2'
                    - '9:16'
                    - '16:9'
                  x-apifox-enum:
                    - value: '1:1'
                      name: ''
                      description: ''
                    - value: '2:3'
                      name: ''
                      description: ''
                    - value: '3:2'
                      name: ''
                      description: ''
                    - value: '9:16'
                      name: ''
                      description: ''
                    - value: '16:9'
                      name: ''
                      description: ''
                  description: 如果加入参考图，按照参考图比例生成
                image:
                  type: array
                  items:
                    type: string
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - aspect_ratio
                - image
            examples:
              '1':
                value:
                  model: grok-imagine-image-quality
                  prompt: 白猫戴上墨镜，保持猫咪姿态、毛发和背景不变
                  image: https://output.anyroutes.cn/demo/demo_cat.png
                  aspect_ratio: '1:1'
                  resolution: 2k
                  response_format: url
                summary: 图像编辑
              '2':
                value:
                  model: grok-imagine-image-quality
                  prompt: 参考两张图片，让白猫保持原有外观并戴上墨镜
                  images:
                    - https://output.anyroutes.cn/demo/demo_cat.png
                    - https://output.anyroutes.cn/demo/demo_glasses.png
                  aspect_ratio: '1:1'
                  resolution: 2k
                  response_format: url
                summary: 多图参考生图
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 123、未开放
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-515605101-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "seedream-v5-pro"
capability: "image"
vendor: "volcengine"
source: "aggregator"
apifoxId: "514194485"
sourceUrl: "https://gpt-best.apifox.cn/api-514194485.md"
fetchedAt: "2026-09-19"
---
# seedream-v5-pro — seedream-v5-pro

来源：https://gpt-best.apifox.cn/api-514194485.md

# seedream-v5-pro 统一格式

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/generations:
    post:
      summary: seedream-v5-pro 统一格式
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
          text/plain:
            schema:
              type: string
            examples:
              '1':
                value:
                  model: seedream-v5-pro
                  prompt: 白猫改成黑猫，保持真实摄影风格和原有构图
                  size: 2K
                  response_format: url
                summary: 文生图
              '2':
                value:
                  model: seedream-v5-pro
                  prompt: 白猫戴上墨镜，保持猫咪姿态、毛发细节和背景不变
                  image: https://output.anyroutes.cn/demo/demo_cat.png
                  size: 2K
                  response_format: url
                summary: 图生图
              '3':
                value:
                  model: seedream-v5-pro
                  prompt: 参考两张图片，让白猫保持原有外观并戴上参考图中的墨镜
                  image:
                    - https://output.anyroutes.cn/demo/demo_cat.png
                    - https://output.anyroutes.cn/demo/demo_glasses.png
                  size: 2K
                  response_format: url
                summary: 多图参考
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-514194485-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

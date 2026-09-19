---
model: "grok-4.2-image"
capability: "image"
vendor: "xai"
source: "aggregator"
apifoxId: "509383421"
sourceUrl: "https://gpt-best.apifox.cn/api-509383421.md"
fetchedAt: "2026-09-19"
---
# grok-4.2-image — grok-4.2-image

来源：https://gpt-best.apifox.cn/api-509383421.md

# grok-4.2-image

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
      summary: grok-4.2-image
      deprecated: false
      description: ''
      tags:
        - 绘图模型/OpenAI Dall-e 格式
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
                prompt:
                  type: string
                aspect_ratio:
                  type: string
                  description: 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16, 9:21
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - aspect_ratio
            example:
              size: 1024x1024
              prompt: cat
              model: qwen-image
              'n': 1
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
      x-apifox-folder: 绘图模型/OpenAI Dall-e 格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-509383421-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

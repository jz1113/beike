---
model: "grok-imagine-image-quality"
capability: "image"
vendor: "xai"
source: "aggregator"
apifoxId: "515602253"
sourceUrl: "https://gpt-best.apifox.cn/api-515602253.md"
fetchedAt: "2026-09-19"
---
# grok-imagine-image-quality — grok-imagine-image-quality-generations

来源：https://gpt-best.apifox.cn/api-515602253.md

# grok-imagine-image-quality （文生图）统一格式

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
      summary: grok-imagine-image-quality （文生图）统一格式
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
            example:
              model: grok-imagine-image-quality
              prompt: 白猫改成黑猫，保持真实摄影风格和原有构图
              aspect_ratio: '1:1'
              resolution: 2k
              'n': 1
              response_format: url
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-515602253-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

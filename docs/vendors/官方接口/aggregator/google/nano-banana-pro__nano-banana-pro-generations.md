---
model: "nano-banana-pro"
capability: "image"
vendor: "google"
source: "aggregator"
apifoxId: "420361512"
sourceUrl: "https://gpt-best.apifox.cn/api-420361512.md"
fetchedAt: "2026-09-19"
---
# nano-banana-pro — nano-banana-pro-generations

来源：https://gpt-best.apifox.cn/api-420361512.md

# Nano-banana-2(Pro)(Generations，推荐对接)

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
      summary: Nano-banana-2(Pro)(Generations，推荐对接)
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
                  x-apifox-mock: nano-banana-2
                prompt:
                  type: string
                  x-apifox-mock: 一只猫
                response_format:
                  type: string
                  description: url 或 b64_json
                  x-apifox-mock: 'url '
                aspect_ratio:
                  type: string
                  x-apifox-mock: '4:3'
                  enum:
                    - '4:3'
                    - '3:4'
                    - '16:9'
                    - '9:16'
                    - '2:3'
                    - '3:2'
                    - '1:1'
                    - '4:5'
                    - '5:4'
                    - '21:9'
                  x-apifox-enum:
                    - value: '4:3'
                      name: ''
                      description: ''
                    - value: '3:4'
                      name: ''
                      description: ''
                    - value: '16:9'
                      name: ''
                      description: ''
                    - value: '9:16'
                      name: ''
                      description: ''
                    - value: '2:3'
                      name: ''
                      description: ''
                    - value: '3:2'
                      name: ''
                      description: ''
                    - value: '1:1'
                      name: ''
                      description: ''
                    - value: '4:5'
                      name: ''
                      description: ''
                    - value: '5:4'
                      name: ''
                      description: ''
                    - value: '21:9'
                      name: ''
                      description: ''
                image:
                  type: array
                  items:
                    type: string
                  description: 参考图数组，url 或 b64_json
                image_size:
                  type: string
                  x-apifox-mock: 4K
                  enum:
                    - 1K
                    - 2K
                    - 4K
                  x-apifox-enum:
                    - value: 1K
                      name: ''
                      description: ''
                    - value: 2K
                      name: ''
                      description: ''
                    - value: 4K
                      name: ''
                      description: ''
                  description: 仅 nano-banana-2 支持
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - aspect_ratio
                - response_format
                - image
                - image_size
            example:
              prompt: cat
              model: nano-banana
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-420361512-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

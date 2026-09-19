---
model: "flux"
capability: "image"
vendor: "bfl"
source: "aggregator"
apifoxId: "258068997"
sourceUrl: "https://gpt-best.apifox.cn/api-258068997.md"
fetchedAt: "2026-09-19"
---
# flux — flux-dalle

来源：https://gpt-best.apifox.cn/api-258068997.md

# Flux(Dall-e 格式)

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
      summary: Flux(Dall-e 格式)
      deprecated: false
      description: |+


      tags:
        - 绘图模型/Flux 系列/OpenAI Dalle 格式
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
              properties: {}
              x-apifox-orders: []
            example:
              prompt: cat
              model: flux-dev
              size: 512x1024
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
      x-apifox-folder: 绘图模型/Flux 系列/OpenAI Dalle 格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-258068997-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

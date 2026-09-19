---
model: "flux"
capability: "image"
vendor: "bfl"
source: "aggregator"
apifoxId: "303213093"
sourceUrl: "https://gpt-best.apifox.cn/api-303213093.md"
fetchedAt: "2026-09-19"
---
# flux — flux-edits

来源：https://gpt-best.apifox.cn/api-303213093.md

# Flux(Dalle3 Edits(图生图&文生图))

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
      summary: Flux(Dalle3 Edits(图生图&文生图))
      deprecated: false
      description: 仅支持 flux-kontext pro、max ，支持多图参考
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
          multipart/form-data:
            schema:
              type: object
              properties:
                prompt:
                  example: 带上眼镜
                  type: string
                model:
                  example: flux-kontext-pro
                  type: string
                size:
                  description: 最终会转换成比例，建议直接使用 aspect_ratio
                  example: 1024x1024
                  type: string
                aspect_ratio:
                  description: 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16, 9:21
                  example: '1:1'
                  type: string
                image:
                  format: binary
                  type: string
                  description: 参考图片，支持多个
                  example: ''
              required:
                - prompt
                - model
            examples: {}
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-303213093-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

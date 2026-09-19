---
model: "qwen-image-edit"
capability: "image"
vendor: "alibaba"
source: "aggregator"
apifoxId: "338005095"
sourceUrl: "https://gpt-best.apifox.cn/api-338005095.md"
fetchedAt: "2026-09-19"
---
# qwen-image-edit — qwen-image-edit

来源：https://gpt-best.apifox.cn/api-338005095.md

# qwen-image-edit (图生图)

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
      summary: qwen-image-edit (图生图)
      deprecated: false
      description: 仅支持一张参考图，支持放 prompt
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
          multipart/form-data:
            schema:
              type: object
              properties:
                model:
                  example: qwen-image-edit
                  type: string
                prompt:
                  example: xxx
                  type: string
                image:
                  example: file://E:\Downloads\1745936044575403500.png
                  type: string
                  format: binary
              required:
                - model
                - prompt
                - image
            example:
              model: string
              prompt: string
              size: string
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-338005095-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

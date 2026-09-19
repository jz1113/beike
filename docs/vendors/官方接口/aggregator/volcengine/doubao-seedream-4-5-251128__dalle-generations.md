---
model: "doubao-seedream-4-5-251128"
capability: "image"
vendor: "volcengine"
source: "aggregator"
apifoxId: "302915860"
sourceUrl: "https://gpt-best.apifox.cn/api-302915860.md"
fetchedAt: "2026-09-19"
---
# doubao-seedream-4-5-251128 — dalle-generations

来源：https://gpt-best.apifox.cn/api-302915860.md

# Generations 通用 (图生图&文生图)

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
      summary: Generations 通用 (图生图&文生图)
      deprecated: false
      description: 如果支持参考图，例如 flux-kontext ，参考图url 放 prompt 中空格隔开
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
                size:
                  type: string
                  description: 最终会转换成比例，建议直接使用 aspect_ratio
                aspect_ratio:
                  type: string
                  description: 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16, 9:21
                image:
                  type: array
                  items:
                    type: string
                  description: 部分模型支持
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - size
                - aspect_ratio
                - image
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
      x-apifox-folder: 绘图模型/OpenAI Dall-e 格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-302915860-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "multimodal-chat"
capability: "multimodal"
vendor: "chat"
source: "aggregator"
apifoxId: "321434971"
sourceUrl: "https://gpt-best.apifox.cn/api-321434971.md"
fetchedAt: "2026-09-19"
---
# multimodal-chat — responses-create

来源：https://gpt-best.apifox.cn/api-321434971.md

# 创建模型响应

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/responses:
    post:
      summary: 创建模型响应
      deprecated: false
      description: |
        https://platform.openai.com/docs/api-reference/responses/create

        部分OpenAI模型仅支持Response格式，例如o3-pro，codex-mini-latest
      tags:
        - 聊天(Responses)
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
                input:
                  type: array
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                      content:
                        type: string
                    x-apifox-orders:
                      - role
                      - content
              required:
                - model
                - input
              x-apifox-orders:
                - model
                - input
            example:
              model: gpt-4.1
              input:
                - role: user
                  content: Write a one-sentence bedtime story about a unicorn.
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 聊天(Responses)
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-321434971-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

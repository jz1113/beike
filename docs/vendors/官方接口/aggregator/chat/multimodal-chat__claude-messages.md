---
model: "multimodal-chat"
capability: "multimodal"
vendor: "chat"
source: "aggregator"
apifoxId: "228980408"
sourceUrl: "https://gpt-best.apifox.cn/api-228980408.md"
fetchedAt: "2026-09-19"
---
# multimodal-chat — claude-messages

来源：https://gpt-best.apifox.cn/api-228980408.md

# Messages(官方Anthropic格式)

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/messages:
    post:
      summary: Messages(官方Anthropic格式)
      deprecated: false
      description: ''
      tags:
        - 聊天(Chat)/Claude 官方格式
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
      x-apifox-folder: 聊天(Chat)/Claude 官方格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-228980408-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

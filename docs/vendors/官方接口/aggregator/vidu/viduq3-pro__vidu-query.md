---
model: "viduq3-pro"
capability: "video"
vendor: "vidu"
source: "aggregator"
apifoxId: "374481817"
sourceUrl: "https://gpt-best.apifox.cn/api-374481817.md"
fetchedAt: "2026-09-19"
---
# viduq3-pro — vidu-query

来源：https://gpt-best.apifox.cn/api-374481817.md

# 查询任务

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /vidu/v2/tasks/{task_id}/creations:
    get:
      summary: 查询任务
      deprecated: false
      description: ''
      tags:
        - 视频模型/vidu
      parameters:
        - name: task_id
          in: path
          description: ''
          required: true
          schema:
            type: string
        - name: Content-Type
          in: header
          description: ''
          required: true
          example: application/json
          schema:
            type: string
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
            examples: {}
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
      x-apifox-folder: 视频模型/vidu
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-374481817-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "omni_flash-10s"
capability: "video"
vendor: "google"
source: "aggregator"
apifoxId: "483608140"
sourceUrl: "https://gpt-best.apifox.cn/api-483608140.md"
fetchedAt: "2026-09-19"
---
# omni_flash-10s — veo-omini-query

来源：https://gpt-best.apifox.cn/api-483608140.md

# 查询视频进度

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/videos/{task_id}:
    get:
      summary: 查询视频进度
      deprecated: false
      description: |-
        https://platform.openai.com/docs/api-reference/videos/create

        status ：
        queued、in_progress、completed、failed
      tags:
        - 视频模型/Veo Omini
      parameters:
        - name: task_id
          in: path
          description: ''
          required: true
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
      x-apifox-folder: 视频模型/Veo Omini
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-483608140-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

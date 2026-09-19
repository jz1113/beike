---
model: "kling-video-v3-omni"
capability: "video"
vendor: "kling"
source: "aggregator"
apifoxId: "384982099"
sourceUrl: "https://gpt-best.apifox.cn/api-384982099.md"
fetchedAt: "2026-09-19"
---
# kling-video-v3-omni — kling-omni-query

来源：https://gpt-best.apifox.cn/api-384982099.md

# Omni-Video查询任务(免费

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /kling/v1/videos/omni-video/{task_id}:
    get:
      summary: Omni-Video查询任务(免费
      deprecated: false
      description: ''
      tags:
        - 快手可灵(官方格式)
      parameters:
        - name: task_id
          in: path
          description: |
            任务ID
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
                properties:
                  code:
                    type: string
                  message:
                    type: string
                  request_id:
                    type: string
                  data:
                    type: object
                    properties:
                      task_id:
                        type: string
                      task_status:
                        type: string
                      task_status_msg:
                        type: string
                      created_at:
                        type: string
                      updated_at:
                        type: string
                      task_result:
                        type: object
                        properties:
                          videos:
                            type: array
                            items:
                              type: object
                              properties:
                                id:
                                  type: string
                                url:
                                  type: string
                                duration:
                                  type: string
                              x-apifox-orders:
                                - id
                                - url
                                - duration
                        x-apifox-orders:
                          - videos
                    x-apifox-orders:
                      - task_id
                      - task_status
                      - task_status_msg
                      - created_at
                      - updated_at
                      - task_result
                x-apifox-orders:
                  - code
                  - message
                  - request_id
                  - data
                required:
                  - code
                  - message
                  - request_id
                  - data
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 快手可灵(官方格式)
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-384982099-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

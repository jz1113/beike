---
model: "sora-2"
capability: "video"
vendor: "openai"
source: "aggregator"
apifoxId: "362760648"
sourceUrl: "https://gpt-best.apifox.cn/api-362760648.md"
fetchedAt: "2026-09-19"
---
# sora-2 — sora-2-official-query

来源：https://gpt-best.apifox.cn/api-362760648.md

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
        - 视频模型/Sora2官方格式
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
              examples:
                '1':
                  summary: 进行中
                  value: "{\r\n    \"id\": \"video_b9d05dda-0f9d-48c2-944e-7c5b47c6a399\",\r\n    \"object\": \"video\",\r\n    \"model\": \"sora-2-pro\",\r\n    \"status\": \"queued\", \\\\queued、in_progress、completed、failed\r\n    \"progress\": 0,\r\n    \"created_at\": 1760679942,\r\n    \"seconds\": \"15\",\r\n    \"size\": \"1280x720\",\r\n    \"error\": null,\r\n    \"video_url\": \"\" // 成功时，会生成视频链接，也可以通过openai 格式接口获取视频\r\n}"
                '2':
                  summary: 失败
                  value:
                    id: sora-2:task_01k7rtn875f83t2f8ry0kb5ap1
                    status: failed
                    created_at: 1760696116136
                    model: sora-2
                    object: video
                    progress: 0
                    seconds: '10'
                    size: small
                    error:
                      code: generation_failed
                      message: >-
                        This content may violate our guardrails concerning
                        similarity to third-party content.
                '3':
                  summary: 完成
                  value:
                    id: sora-2:task_01k7rtjcjjf08b031wzan1kb5r
                    status: completed
                    created_at: 1760696021903
                    model: sora-2
                    object: video
                    progress: 100
                    seconds: '15'
                    size: small
                    url: >-
                      https://filesystem.site/cdn/20251017/78fd715fed4abc9b0bbdfe564e9d8b.mp4
                    video_url: >-
                      https://filesystem.site/cdn/20251017/78fd715fed4abc9b0bbdfe564e9d8b.mp4
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/Sora2官方格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-362760648-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "veo3.1"
capability: "video"
vendor: "google"
source: "aggregator"
apifoxId: "343593236"
sourceUrl: "https://gpt-best.apifox.cn/api-343593236.md"
fetchedAt: "2026-09-19"
---
# veo3.1 — veo-query

来源：https://gpt-best.apifox.cn/api-343593236.md

# Veo查询任务

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v2/videos/generations/{task_id}:
    get:
      summary: Veo查询任务
      deprecated: false
      description: |-
        统一接口格式
        status 枚举：
        NOT_START ： 未开始
        IN_PROGRESS ： 正在执行
        SUCCESS ： 执行完成
        FAILURE ： 失败
      tags:
        - 视频模型/统一格式接口/Google-Veo
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
              example:
                task_id: veo3:1756693796-YQVHH4A3Lg
                platform: google
                action: google-videos
                status: SUCCESS
                fail_reason: ''
                submit_time: 1756693797
                start_time: 1756693808
                finish_time: 1756693898
                progress: 100%
                data:
                  output: >-
                    https://filesystem.site/cdn/20250901/018eg2SgUpHMT6EEuQbfeRLWeUhE75.mp4
                search_item: ''
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/统一格式接口/Google-Veo
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-343593236-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

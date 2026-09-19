---
model: "sora-2"
capability: "video"
vendor: "openai"
source: "aggregator"
apifoxId: "358024353"
sourceUrl: "https://gpt-best.apifox.cn/api-358024353.md"
fetchedAt: "2026-09-19"
---
# sora-2 — sora-2-query

来源：https://gpt-best.apifox.cn/api-358024353.md

# Sora2查询任务

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
      summary: Sora2查询任务
      deprecated: false
      description: |-
        统一接口格式
        status 枚举：
        NOT_START ： 未开始
        IN_PROGRESS ： 正在执行
        SUCCESS ： 执行完成
        FAILURE ： 失败
      tags:
        - 视频模型/Sora2官方格式/统一格式
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
                  summary: 示例 1
                  value:
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
                '2':
                  summary: Failed
                  value:
                    task_id: 32daf195-f961-40b5-a08d-16fe6c3a0cac
                    platform: openai
                    action: sora-video
                    status: FAILURE
                    fail_reason: 输入的提示词或视频的输出内容违反了OpenAI的相关服务政策，请调整提示词后进行重试
                    submit_time: 1759674948
                    start_time: 1759674963
                    finish_time: 1759675403
                    progress: 100%
                    data: null
                    search_item: ''
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/Sora2官方格式/统一格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-358024353-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

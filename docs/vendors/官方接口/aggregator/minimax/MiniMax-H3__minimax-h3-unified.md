---
model: "MiniMax-H3"
capability: "video"
vendor: "minimax"
source: "aggregator"
apifoxId: "514901439"
sourceUrl: "https://gpt-best.apifox.cn/api-514901439.md"
fetchedAt: "2026-09-19"
---
# MiniMax-H3 — minimax-h3-unified

来源：https://gpt-best.apifox.cn/api-514901439.md

# MiniMax-H3 统一格式

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/videos:
    post:
      summary: MiniMax-H3 统一格式
      deprecated: false
      description: ''
      tags:
        - 123、未开放
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
            examples:
              '1':
                value:
                  model: minimax-h3
                  prompt: 一只白猫戴着黑色墨镜在海边跳舞，动作自然，电影级光影，镜头缓慢推进
                  seconds: 8
                  size: 1280x720
                summary: 文生视频
              '2':
                value:
                  model: minimax-h3
                  prompt: 白猫戴着墨镜跳舞，保持主体一致
                  image_url: https://output.anyroutes.cn/demo/demo_glasses.png
                  seconds: 8
                  size: 1280x720
                summary: 图生视频
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
      x-apifox-folder: 123、未开放
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-514901439-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

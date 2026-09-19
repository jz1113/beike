---
model: "omni_flash-10s"
capability: "video"
vendor: "google"
source: "aggregator"
apifoxId: "514127998"
sourceUrl: "https://gpt-best.apifox.cn/api-514127998.md"
fetchedAt: "2026-09-19"
---
# omni_flash-10s — omni_flash-10s

来源：https://gpt-best.apifox.cn/api-514127998.md

# omni_flash-10s

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
      summary: omni_flash-10s
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
                  model: omni_flash-10s
                  prompt: 白猫戴上墨镜跳舞
                  size: 1280x720
                summary: 文生视频
              '2':
                value:
                  model: omni_flash-10s
                  prompt: 白猫戴上墨镜跳舞
                  size: 1280x720
                  images:
                    - https://output.anyroutes.cn/demo/demo_glasses.png
                summary: 图生视频
              '3':
                value:
                  model: omni_flash-10s
                  prompt: 参考图片中的主体和风格，生成白猫戴着墨镜跳舞的视频
                  size: 1280x720
                  images:
                    - https://output.anyroutes.cn/demo/demo_cat.png
                    - https://output.anyroutes.cn/demo/demo_glasses.png
                summary: 多参考图生视频
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-514127998-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

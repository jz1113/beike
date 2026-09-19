---
model: "grok-imagine-video-1.5"
capability: "video"
vendor: "xai"
source: "aggregator"
apifoxId: "515382337"
sourceUrl: "https://gpt-best.apifox.cn/api-515382337.md"
fetchedAt: "2026-09-19"
---
# grok-imagine-video-1.5 — grok-imagine-video-1.5-unified

来源：https://gpt-best.apifox.cn/api-515382337.md

# grok-imagine-video-1.5 统一格式

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
      summary: grok-imagine-video-1.5 统一格式
      deprecated: false
      description: >-
        接口说明：https://docs.x.ai/developers/rest-api-reference/inference/videos#video-generation
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
                  model: grok-imagine-video-1.5
                  prompt: 一只白猫戴着黑色墨镜跳舞，动作自然流畅，电影感，镜头缓慢推进
                  duration: 8
                  resolution: 720p
                  aspect_ratio: '16:9'
                summary: 文生视频
              '2':
                value:
                  model: grok-imagine-video-1.5
                  prompt: 白猫戴着墨镜开始跳舞，保持主体和外观一致，动作自然流畅
                  first_frame: https://output.anyroutes.cn/demo/demo_glasses.png
                  duration: 8
                  resolution: 720p
                  aspect_ratio: '16:9'
                summary: 图生视频
              '3':
                value:
                  model: grok-imagine-video-1.5
                  prompt: 白猫逐渐戴上墨镜，动作自然，镜头平稳过渡
                  first_frame: https://output.anyroutes.cn/demo/demo_cat.png
                  last_frame: https://output.anyroutes.cn/demo/demo_glasses.png
                  duration: 8
                  aspect_ratio: '16:9'
                  resolution: 720p
                summary: 首尾帧生视频
              '4':
                value:
                  model: grok-imagine-video-1.5
                  prompt: 参考图片中的白猫和墨镜造型，生成白猫戴着墨镜开心跳舞的视频
                  reference_images:
                    - https://output.anyroutes.cn/demo/demo_cat.png
                    - https://output.anyroutes.cn/demo/demo_glasses.png
                  duration: 10
                  aspect_ratio: '16:9'
                  resolution: 720p
                summary: 参考图生视频
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-515382337-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "sora-2"
capability: "video"
vendor: "openai"
source: "aggregator"
apifoxId: "362481361"
sourceUrl: "https://gpt-best.apifox.cn/api-362481361.md"
fetchedAt: "2026-09-19"
---
# sora-2 — sora-2-official-create

来源：https://gpt-best.apifox.cn/api-362481361.md

# 创建视频

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
      summary: 创建视频
      deprecated: false
      description: |
        https://platform.openai.com/docs/api-reference/videos/create

        OpenAI Sora2 官方接口，推荐接入统一格式接口；
        逆向分组和官方分组计费方式、时长设置不同

        常见错误:
        Inpaint image must match the requested width and height
        使用官转分组时，图片分辨率需要与官方参数一致，例如 720x1280
      tags:
        - 视频模型/Sora2官方格式
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
          multipart/form-data:
            schema:
              type: object
              properties:
                model:
                  type: string
                  enum:
                    - sora-2
                    - sora-2-pro
                  x-apifox-enum:
                    - value: sora-2
                      name: ''
                      description: ''
                    - value: sora-2-pro
                      name: ''
                      description: ''
                  example: sora-2
                prompt:
                  example: 基于这张图片生成视频
                  type: string
                size:
                  type: string
                  enum:
                    - 1280x720
                    - 720x1280
                    - 1792x1024
                    - 1024x1792
                  x-apifox-enum:
                    - value: 1280x720
                      name: 720P横屏
                      description: ''
                    - value: 720x1280
                      name: 720P竖屏
                      description: ''
                    - value: 1792x1024
                      name: 1080P横屏
                      description: 仅 sora-2-pro 支持
                    - value: 1024x1792
                      name: 1080P竖屏
                      description: 仅 sora-2-pro 支持
                  description: >-
                    Output resolution formatted as width x height. Defaults to
                    720x1280.
                  example: 720x1280
                input_reference:
                  example: https://example.com/reference.jpg
                  type: string
                  format: binary
                seconds:
                  type: string
                  description: |-
                    Clip duration in seconds. Defaults to 4 seconds.
                    官方分组支持4秒以上，按秒计费
                    逆向分组仅支持 10、15、25(sora-2-pro支持) 
                  example: '4'
                watermark:
                  type: boolean
                  example: 'false'
              required:
                - model
                - prompt
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
      x-apifox-folder: 视频模型/Sora2官方格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-362481361-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

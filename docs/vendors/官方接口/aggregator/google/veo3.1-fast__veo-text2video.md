---
model: "veo3.1-fast"
capability: "video"
vendor: "google"
source: "aggregator"
apifoxId: "343590061"
sourceUrl: "https://gpt-best.apifox.cn/api-343590061.md"
fetchedAt: "2026-09-19"
---
# veo3.1-fast — veo-text2video

来源：https://gpt-best.apifox.cn/api-343590061.md

# Veo文生视频

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v2/videos/generations:
    post:
      summary: Veo文生视频
      deprecated: false
      description: ''
      tags:
        - 视频模型/统一格式接口/Google-Veo
      parameters:
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
          application/json:
            schema:
              type: object
              properties:
                prompt:
                  type: string
                  x-apifox-mock: make animate
                model:
                  type: string
                  x-apifox-mock: veo2
                  enum:
                    - veo3
                    - veo3-fast
                    - veo3-pro
                    - veo3-pro-frames
                    - veo2
                    - veo2-fast
                    - veo2-fast-frames
                    - veo2-fast-components
                    - veo2-pro
                    - veo3-fast-frames
                    - veo3.1
                    - veo3.1-pro
                  x-apifox-enum:
                    - value: veo3
                      name: ''
                      description: ''
                    - value: veo3-fast
                      name: ''
                      description: ''
                    - value: veo3-pro
                      name: ''
                      description: ''
                    - value: veo3-pro-frames
                      name: ''
                      description: 支持图生视频
                    - value: veo2
                      name: ''
                      description: ''
                    - value: veo2-fast
                      name: ''
                      description: ''
                    - value: veo2-fast-frames
                      name: ''
                      description: ''
                    - value: veo2-fast-components
                      name: ''
                      description: ''
                    - value: veo2-pro
                      name: ''
                      description: ''
                    - value: veo3-fast-frames
                      name: ''
                      description: ''
                    - value: veo3.1
                      name: ''
                      description: >-
                        Google最新的高级人工智能模型, veo3 快速
                        模式，支持视频自动配套音频生成，质量高价格很低，性价比最高的选择, 自适应首帧和文生视频
                    - value: veo3.1-pro
                      name: ''
                      description: >-
                        Google最新的高级人工智能模型, veo3 高质量
                        模式，支持视频自动配套音频生成，质量超高，价格也超高，使用需注意, 自适应首帧和文生视频
                enhance_prompt:
                  type: boolean
                  description: |
                    是否优化提示词，一般是false；由于 veo 只支持英文提示词，所以如果需要中文自动转成英文提示词，可以开启此开关
                enable_upsample:
                  type: boolean
                  description: 是否分辨率提升；返回 1080p 视频
                aspect_ratio:
                  type: string
                  enum:
                    - '16:9'
                    - '9:16'
                  x-apifox-enum:
                    - value: '16:9'
                      name: 横屏
                      description: ''
                    - value: '9:16'
                      name: 竖屏
                      description: ''
                  x-apifox-mock: '16:9'
              required:
                - prompt
                - model
              x-apifox-orders:
                - prompt
                - model
                - aspect_ratio
                - enhance_prompt
                - enable_upsample
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
              example:
                task_id: f0aa213c-c09e-4e19-a0e5-c698fe48acf1
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/统一格式接口/Google-Veo
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-343590061-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

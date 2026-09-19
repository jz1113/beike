---
model: "veo3.1"
capability: "video"
vendor: "google"
source: "aggregator"
apifoxId: "343632235"
sourceUrl: "https://gpt-best.apifox.cn/api-343632235.md"
fetchedAt: "2026-09-19"
---
# veo3.1 — veo-image2video

来源：https://gpt-best.apifox.cn/api-343632235.md

# Veo图生视频 

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
      summary: 'Veo图生视频 '
      deprecated: false
      description: |-
        当模型是带 veo2-fast-frames 最多支持两个，分别是首尾帧
        当模型是 veo3-pro-frames 最多支持一个首帧
        当模型是 veo2-fast-components 最多支持 3 个，此时图片为视频中的元素

        不传 aspect_ratio 参数时，会根据参考图自动匹配比例，如果无法判断默认生成横屏
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
                model:
                  type: string
                  enum:
                    - veo3-pro-frames
                    - veo3-fast-frames
                    - veo2-fast-frames
                    - veo2-fast-components
                    - veo3.1
                    - veo3.1-pro
                    - veo3.1-components
                  x-apifox-enum:
                    - value: veo3-pro-frames
                      name: ''
                      description: 支持图生视频
                    - value: veo3-fast-frames
                      name: ''
                      description: ''
                    - value: veo2-fast-frames
                      name: ''
                      description: ''
                    - value: veo2-fast-components
                      name: ''
                      description: ''
                    - value: veo3.1
                      name: ''
                      description: >-
                        支持首尾帧，Google最新的高级人工智能模型, veo3 快速
                        模式，支持视频自动配套音频生成，质量高价格很低，性价比最高的选择, 自适应首帧和文生视频
                    - value: veo3.1-pro
                      name: ''
                      description: >-
                        支持首尾帧，Google最新的高级人工智能模型, veo3 高质量
                        模式，支持视频自动配套音频生成，质量超高，价格也超高，使用需注意, 自适应首帧和文生视频
                    - value: veo3.1-components
                      name: ''
                      description: 多图参考（1-3）张图
                enhance_prompt:
                  type: boolean
                  description: |
                    是否优化提示词，一般是false；由于 veo 只支持英文提示词，所以如果需要中文自动转成英文提示词，可以开启此开关
                images:
                  type: array
                  items:
                    type: string
                  description: >-
                    url or base64；当模型是带 veo2-fast-frames 最多支持两个，分别是首尾帧，当模型是
                    veo3-pro-frames 最多支持一个首帧，当模型是 veo2-fast-components 最多支持 3
                    个，此时图片为视频中的元素
                aspect_ratio:
                  type: string
                  enum:
                    - '9:16'
                    - '16:9'
                  x-apifox-enum:
                    - value: '9:16'
                      name: ''
                      description: ''
                    - value: '16:9'
                      name: ''
                      description: ''
              required:
                - prompt
                - model
                - images
              x-apifox-orders:
                - prompt
                - model
                - enhance_prompt
                - images
                - aspect_ratio
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
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/统一格式接口/Google-Veo
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-343632235-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "nano-banana"
capability: "image"
vendor: "google"
source: "aggregator"
apifoxId: "341817449"
sourceUrl: "https://gpt-best.apifox.cn/api-341817449.md"
fetchedAt: "2026-09-19"
---
# nano-banana — nano-banana-edits

来源：https://gpt-best.apifox.cn/api-341817449.md

# Nano-banana(Edits兼容) 

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/edits:
    post:
      summary: 'Nano-banana(Edits兼容) '
      deprecated: false
      description: >-
        Nano-banana 和 gemini-2.5-flash-image-preview 的区别

        gemini-2.5-flash-image-preview 官方的api模型，没做任何处理，仅支持聊天接口，可能不会返回图片，返回的图片是
        base64

        nano-banana 我们基于 gemini-2.5-flash-image-preview 专门画图优化的api模型，支持 dalle
        格式、返回url，失败不扣费，优化了支持设置图片比例

        nano-banana-hd 是高清版4K画质
      tags:
        - 绘图模型/OpenAI Dall-e 格式
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
                  example: nano-banana
                  type: string
                prompt:
                  example: 一只猫
                  type: string
                image:
                  description: 支持多图或不带参考图
                  example:
                    - file://E:\Downloads\1745936044575403500.png
                    - file://E:\Downloads\微信图片_20250826114255_1785.jpg
                  type: string
                  format: binary
                response_format:
                  description: url 或 b64_json
                  example: url
                  type: string
                aspect_ratio:
                  type: string
                  enum:
                    - '1:1'
                    - '2:3'
                    - '3:2'
                    - '3:4'
                    - '4:3'
                    - '4:5'
                    - '5:4'
                    - '9:16'
                    - '16:9'
                    - '21:9'
                  x-apifox-enum:
                    - value: '1:1'
                      name: ''
                      description: ''
                    - value: '2:3'
                      name: ''
                      description: ''
                    - value: '3:2'
                      name: ''
                      description: ''
                    - value: '3:4'
                      name: ''
                      description: ''
                    - value: '4:3'
                      name: ''
                      description: ''
                    - value: '4:5'
                      name: ''
                      description: ''
                    - value: '5:4'
                      name: ''
                      description: ''
                    - value: '9:16'
                      name: ''
                      description: ''
                    - value: '16:9'
                      name: ''
                      description: ''
                    - value: '21:9'
                      name: ''
                      description: ''
                  example: ''
              required:
                - model
                - prompt
                - image
            example:
              model: string
              prompt: string
              size: string
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
      x-apifox-folder: 绘图模型/OpenAI Dall-e 格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-341817449-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

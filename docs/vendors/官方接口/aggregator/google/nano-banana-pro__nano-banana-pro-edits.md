---
model: "nano-banana-pro"
capability: "image"
vendor: "google"
source: "aggregator"
apifoxId: "420361517"
sourceUrl: "https://gpt-best.apifox.cn/api-420361517.md"
fetchedAt: "2026-09-19"
---
# nano-banana-pro — nano-banana-pro-edits

来源：https://gpt-best.apifox.cn/api-420361517.md

# Nano-banana-2(Pro)(Edits兼容) 

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
      summary: 'Nano-banana-2(Pro)(Edits兼容) '
      deprecated: false
      description: ''
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
                  example: nano-banana-2
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
                image_size:
                  type: string
                  enum:
                    - 1K
                    - 2K
                    - 4K
                  x-apifox-enum:
                    - value: 1K
                      name: ''
                      description: ''
                    - value: 2K
                      name: ''
                      description: ''
                    - value: 4K
                      name: ''
                      description: ''
                  description: 仅 nano-banana-2 支持
                  example: 4K
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-420361517-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

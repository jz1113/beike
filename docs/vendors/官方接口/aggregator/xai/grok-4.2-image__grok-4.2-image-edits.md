---
model: "grok-4.2-image"
capability: "image"
vendor: "xai"
source: "aggregator"
apifoxId: "512878064"
sourceUrl: "https://gpt-best.apifox.cn/api-512878064.md"
fetchedAt: "2026-09-19"
---
# grok-4.2-image — grok-4.2-image-edits

来源：https://gpt-best.apifox.cn/api-512878064.md

# grok-4.2-image 图像编辑 

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
      summary: 'grok-4.2-image 图像编辑 '
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
              properties:
                model:
                  type: string
                  title: grok-4.2-image
                prompt:
                  type: string
                  title: 给白猫戴上墨镜，保持猫咪姿态和背景不变
                aspect_ratio:
                  type: string
                  description: 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16, 9:21
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - aspect_ratio
            example:
              model: grok-4.2-image
              image: https://output.anyroutes.cn/demo/demo_cat.png
              prompt: 给白猫戴上墨镜，保持猫咪姿态和背景不变
              resolution: 2k
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
      x-apifox-folder: 123、未开放
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-512878064-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

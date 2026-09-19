---
model: "grok-4.2-image"
capability: "image"
vendor: "xai"
source: "aggregator"
apifoxId: "512857860"
sourceUrl: "https://gpt-best.apifox.cn/api-512857860.md"
fetchedAt: "2026-09-19"
---
# grok-4.2-image — grok-4.2-image-generations

来源：https://gpt-best.apifox.cn/api-512857860.md

# grok-4.2-image 文生图 

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/generations:
    post:
      summary: 'grok-4.2-image 文生图 '
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
                  title: >-
                    一只可爱的白猫戴着黑色墨镜，在霓虹舞台上开心地跳舞，身体有节奏感地摆动，前爪抬起，表情自信又搞笑。画面为高质量卡通插画风格，色彩鲜艳，舞台灯光柔和，背景有彩色光斑和轻微动态模糊，主体居中，构图饱满，细节清晰。
                aspect_ratio:
                  type: string
                  description: 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16, 9:21
                  title: 1：1
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - aspect_ratio
            example:
              model: grok-4.2-image
              prompt: 一只白猫改成黑猫，保持真实摄影风格，高清细节
              aspect_ratio: '1:1'
              resolution: 2k
              'n': 1
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-512857860-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

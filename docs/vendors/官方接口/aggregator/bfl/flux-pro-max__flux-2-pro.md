---
model: "flux-pro-max"
capability: "image"
vendor: "bfl"
source: "aggregator"
apifoxId: "382419079"
sourceUrl: "https://gpt-best.apifox.cn/api-382419079.md"
fetchedAt: "2026-09-19"
---
# flux-pro-max — flux-2-pro

来源：https://gpt-best.apifox.cn/api-382419079.md

# flux-2-pro

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /bfl/v1/flux-2-pro:
    post:
      summary: flux-2-pro
      deprecated: false
      description: >-
        此模型按量付费，不同分辨率不同价格

        官方文档：

        https://docs.bfl.ai/api-reference/tasks/generate-or-edit-an-image-with-flux2-[pro]


        价格计算器：

        https://bfl.ai/pricing
      tags:
        - 绘图模型/Flux 系列/Bfl 官方格式
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
                prompt_upsampling:
                  type: boolean
                prompt:
                  type: string
                seed:
                  type: integer
                width:
                  type: integer
                height:
                  type: integer
                safety_tolerance:
                  type: integer
                output_format:
                  type: string
              required:
                - prompt
              x-apifox-orders:
                - prompt_upsampling
                - prompt
                - seed
                - width
                - height
                - safety_tolerance
                - output_format
            example:
              prompt_upsampling: true
              prompt: 画只猫
              seed: 42
              width: 65
              height: 65
              safety_tolerance: 2
              output_format: jpeg
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  polling_url:
                    type: string
                  cost:
                    type: integer
                  input_mp:
                    type: integer
                  output_mp:
                    type: integer
                required:
                  - id
                  - polling_url
                  - cost
                  - input_mp
                  - output_mp
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 绘图模型/Flux 系列/Bfl 官方格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-382419079-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

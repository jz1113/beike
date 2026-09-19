---
model: "qwen-image-edit"
capability: "image"
vendor: "alibaba"
source: "aggregator"
apifoxId: "338005715"
sourceUrl: "https://gpt-best.apifox.cn/api-338005715.md"
fetchedAt: "2026-09-19"
---
# qwen-image-edit — qwen-image-edit-async

来源：https://gpt-best.apifox.cn/api-338005715.md

# 图像编辑(qwen-image-edit)

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
      summary: 图像编辑(qwen-image-edit)
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
                image:
                  description: 支持多图
                  example: E:\\Desktop\\gpt\\icon_samll2.png
                  type: string
                  format: binary
                prompt:
                  example: 带上眼镜
                  type: string
                model:
                  example: qwen-image-edit
                  type: string
                size:
                  example: 1024x1024
                  type: string
                seed:
                  example: ''
                  type: string
                guidance_scale:
                  example: ''
                  type: string
                'n':
                  example: ''
                  type: string
                'enable_safety_checker ':
                  example: ''
                  type: string
                output_format:
                  example: ''
                  type: string
                negative_prompt:
                  example: ''
                  type: string
              required:
                - image
                - prompt
                - model
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
                created: 1713833628
                data:
                  - url: ...
                usage:
                  total_tokens: 100
                  input_tokens: 50
                  output_tokens: 50
                  input_tokens_details:
                    text_tokens: 10
                    image_tokens: 40
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 绘图模型/OpenAI Dall-e 格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-338005715-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

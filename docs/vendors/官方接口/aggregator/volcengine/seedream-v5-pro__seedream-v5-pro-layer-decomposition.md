---
model: "seedream-v5-pro"
capability: "image"
vendor: "volcengine"
source: "aggregator"
apifoxId: "510779216"
sourceUrl: "https://gpt-best.apifox.cn/api-510779216.md"
fetchedAt: "2026-09-19"
---
# seedream-v5-pro — seedream-v5-pro-layer-decomposition

来源：https://gpt-best.apifox.cn/api-510779216.md

# seedream-v5-pro/layer-decomposition 统一格式

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
      summary: seedream-v5-pro/layer-decomposition 统一格式
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
                  x-apifox-mock: seedream-v5-pro
                prompt:
                  type: string
                size:
                  type: string
                  description: 1024~2048 1k 2k
                image:
                  type: array
                  items:
                    type: string
                response_format:
                  type: string
                  description: '"url" or "b64_json". 默认 b64_json'
                output_format:
                  type: string
                  description: png\jpg
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - size
                - response_format
                - output_format
                - image
            examples:
              '1':
                value:
                  model: seedream-v5-pro/layer-decomposition
                  image: https://output.anyroutes.cn/demo/demo_glasses.png
                  size: auto
                  output_format: png
                  response_format: url
                summary: 自动图层拆分
              '2':
                value:
                  model: seedream-v5-pro/layer-decomposition
                  image: https://output.anyroutes.cn/demo/demo_glasses.png
                  prompt: 分别拆出白猫主体、黑色墨镜和背景，每个元素作为独立可编辑图层
                  size: 2K
                  output_format: png
                  response_format: url
                summary: 定向图层拆分
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-510779216-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "gpt-image-2"
capability: "image"
vendor: "openai"
source: "aggregator"
apifoxId: "514117865"
sourceUrl: "https://gpt-best.apifox.cn/api-514117865.md"
fetchedAt: "2026-09-19"
---
# gpt-image-2 — gpt-image-2-generations

来源：https://gpt-best.apifox.cn/api-514117865.md

# gpt-image-2 文生图 

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
      summary: 'gpt-image-2 文生图 '
      deprecated: false
      description: "逆向分组仅支持 model、prompt、size、image、quality 参数\n\n官转组 \n兼容edits 接口所有参数透传\nhttps://developers.openai.com/api/reference/resources/images/methods/edit\n\nsize 介绍：\nhttps://developers.openai.com/api/docs/guides/image-generation#calculating-costs\nSize and quality options  尺寸和质量选项\n\ngpt-image-2 accepts any resolution in the size parameter when it satisfies the constraints below. Square images are typically fastest to generate.\ngpt-image-2 接受任何分辨率作为 size 参数，只要满足以下约束条件即可。通常情况下，正方形图像的生成速度最快。\n\nPopular sizes  常用尺码\t\n1024x1024 (square)\n1024x1024 （正方形）\n\n1536x1024 (landscape)\n1536x1024 （横向）\n\n1024x1536 (portrait)\n1024x1536 （竖屏）\n\n2048x2048 (2K square)\n2048x2048 （2K 正方形）\n\n2048x1152 (2K landscape)\n2048x1152 （2K 横向）\n\n3840x2160 (4K landscape)\n3840x2160 （4K 横向）\n\n2160x3840 (4K portrait)\n2160x3840 （4K 竖屏）\n\nauto (default)\nauto （默认）\n\nSize constraints  尺寸限制\t\nMaximum edge length must be less than or equal to 3840px\n最大边长必须小于或等于 3840px\n\nBoth edges must be multiples of 16px\n两个边长都必须是 16px 的倍数。\n\nLong edge to short edge ratio must not exceed 3:1\n长边与短边之比不得超过 3:1\n\nTotal pixels must be at least 655,360 and no more than 8,294,400\n总像素数必须至少为 655,360 ，且不得超过 8,294,400\n\nQuality options  优质选项\t\nlow  低的\nmedium  中间\nhigh  高的\nauto (default)\nauto （默认）\n"
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
                  x-apifox-mock: gpt-image-2-all
                  title: gpt-image-2
                prompt:
                  type: string
                  title: 一只白猫坐在窗边
                'n':
                  type: string
                  description: 要生成的图像数量。允许的值为[1, 10]
              required:
                - model
                - prompt
              x-apifox-orders:
                - model
                - prompt
                - 'n'
            example:
              model: gpt-image-2-all
              prompt: 一只白猫坐在窗边
              size: 1024x1024
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-514117865-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

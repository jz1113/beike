---
model: "omni_flash-10s"
capability: "video"
vendor: "google"
source: "aggregator"
apifoxId: "483608139"
sourceUrl: "https://gpt-best.apifox.cn/api-483608139.md"
fetchedAt: "2026-09-19"
---
# omni_flash-10s — veo-omini

来源：https://gpt-best.apifox.cn/api-483608139.md

# Veo Omini

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/videos:
    post:
      summary: Veo Omini
      deprecated: false
      description: ''
      tags:
        - 视频模型/Veo Omini
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
                  example: omni_flash-10s
                  type: string
                prompt:
                  example: 基于这张图片生成视频
                  type: string
                size:
                  description: 1280x720、720x1280
                  example: 1280x720
                  type: string
                input_reference:
                  format: binary
                  type: string
                  description: >-
                    图生视频或视频修改时传递，同一字段名可重复多次，每次对应一张图或一个视频文件，最多 7
                    项。文生视频不传本字段。传视频文件时，以本地文件方式提交视频，配合提示词对其进行修改。
                  example: E:\\Downloads\\9959c0e0-84a6-46c6-a2d4-5666adfe2bf8.jpg
              required:
                - model
                - prompt
                - size
                - input_reference
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/Veo Omini
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-483608139-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "viduq3-mix"
capability: "video"
vendor: "vidu"
source: "aggregator"
apifoxId: "374481802"
sourceUrl: "https://gpt-best.apifox.cn/api-374481802.md"
fetchedAt: "2026-09-19"
---
# viduq3-mix — vidu-text2video

来源：https://gpt-best.apifox.cn/api-374481802.md

# 文生视频

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /vidu/v2/text2video:
    post:
      summary: 文生视频
      deprecated: false
      description: |-
        具体参数请看官方文档： 
        https://platform.vidu.cn/docs/text-to-video
      tags:
        - 视频模型/vidu
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
                model:
                  type: string
                images:
                  type: array
                  items:
                    type: string
                prompt:
                  type: string
                duration:
                  type: integer
                seed:
                  type: integer
                resolution:
                  type: string
                movement_amplitude:
                  type: string
                off_peak:
                  type: boolean
              required:
                - model
                - images
                - prompt
                - duration
                - seed
                - resolution
                - movement_amplitude
                - off_peak
            example:
              model: viduq2-pro
              images:
                - >-
                  https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png
              prompt: The astronaut waved and the camera moved up.
              duration: 5
              seed: 0
              resolution: 720p
              movement_amplitude: auto
              off_peak: false
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
      x-apifox-folder: 视频模型/vidu
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-374481802-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

---
model: "sora-2"
capability: "video"
vendor: "openai"
source: "aggregator"
apifoxId: "358024500"
sourceUrl: "https://gpt-best.apifox.cn/api-358024500.md"
fetchedAt: "2026-09-19"
---
# sora-2 — sora-2-image2video

来源：https://gpt-best.apifox.cn/api-358024500.md

# Sora2图生视频

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v2/videos/generations:
    post:
      summary: Sora2图生视频
      deprecated: false
      description: |-
        视频大概耗时
        10s 预计生成时间 1-3 分钟
        15s +2分钟
        hd +8分钟
        图片访问速度慢也会影响耗时，请尽量使用美国访问速度 较快的图片地址

        关于审查，官方审查会涉及至少3个阶段/方向：
        1、提交的图片中是否涉及真人（非常像真人的也不行）
        2、提示词内容是否违规（暴力、色情、版权、活着的名人）
        3、生成结果审查是否合格（这也是大家经常看到的生成了90%多后失败的原因）

        常见错误:
        Inpaint image must match the requested width and height
        使用官转分组时，图片分辨率需要与官方参数一致，例如 720x1280
      tags:
        - 视频模型/Sora2官方格式/统一格式
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
                prompt:
                  type: string
                  x-apifox-mock: make animate
                model:
                  type: string
                  x-apifox-mock: sora-2
                  enum:
                    - sora-2
                    - sora-2-pro
                  x-apifox-enum:
                    - value: sora-2
                      name: ''
                      description: ''
                    - value: sora-2-pro
                      name: ''
                      description: 支持hd、15s
                aspect_ratio:
                  type: string
                  enum:
                    - '16:9'
                    - '9:16'
                  x-apifox-enum:
                    - value: '16:9'
                      name: 横屏
                      description: ''
                    - value: '9:16'
                      name: 竖屏
                      description: ''
                  x-apifox-mock: '16:9'
                  description: 输出比例
                hd:
                  type: boolean
                  x-apifox-mock: 'false'
                  description: 是否生成高清，默认false；高清会导致生成速度更慢; 仅 sora-2-pro 支持
                duration:
                  type: string
                  description: 视频时长；仅 sora-2-pro 支持25s
                  x-apifox-mock: '10'
                  enum:
                    - '10'
                    - '15'
                    - '25'
                    - '4'
                    - '8'
                    - '12'
                  x-apifox-enum:
                    - value: '10'
                      name: ''
                      description: ''
                    - value: '15'
                      name: ''
                      description: ''
                    - value: '25'
                      name: ''
                      description: 仅 sora-2-pro 支持25s
                    - value: '4'
                      name: ''
                      description: ''
                    - value: '8'
                      name: ''
                      description: ''
                    - value: '12'
                      name: ''
                      description: ''
                images:
                  type: array
                  items:
                    type: string
                  description: 图片列表，支持url、base64
                notify_hook:
                  type: string
                watermark:
                  type: boolean
                  x-apifox-mock: 'false'
                private:
                  type: boolean
              required:
                - prompt
                - model
                - images
              x-apifox-orders:
                - prompt
                - model
                - images
                - aspect_ratio
                - hd
                - duration
                - notify_hook
                - watermark
                - private
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
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/Sora2官方格式/统一格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-358024500-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

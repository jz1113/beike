---
model: "doubao-seedance-2.0-mini"
capability: "video"
vendor: "volcengine"
source: "aggregator"
apifoxId: "513301405"
sourceUrl: "https://gpt-best.apifox.cn/api-513301405.md"
fetchedAt: "2026-09-19"
---
# doubao-seedance-2.0-mini — seedance-2.0-mini-official

来源：https://gpt-best.apifox.cn/api-513301405.md

# doubao-seedance-2.0-mini 官方格式

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /seedance/v3/contents/generations/tasks:
    post:
      summary: doubao-seedance-2.0-mini 官方格式
      deprecated: false
      description: |
        仅需将官方 API 地址，更换为我们的地址
        参数可参考官方文档 ： https://www.volcengine.com/docs/82379/1520757?lang=zh
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
                  enum:
                    - doubao-seedance-2.5
                    - doubao-seedance-2-0-260128
                    - doubao-seedance-2-0-fast-260128
                    - doubao-seedance-2.0-mini
                    - doubao-seedance-1-0-pro-250528
                    - doubao-seedance-1-0-lite-t2v-250428
                    - doubao-seedance-1-0-lite-i2v-250428
                    - doubao-seedance-1-0-pro-fast-251015
                    - doubao-seedance-1-5-pro-251215
                  x-apifox-enum:
                    - value: doubao-seedance-2.5
                      name: ''
                      description: ''
                    - value: doubao-seedance-2-0-260128
                      name: ''
                      description: ''
                    - value: doubao-seedance-2-0-fast-260128
                      name: ''
                      description: ''
                    - value: doubao-seedance-2.0-mini
                      name: ''
                      description: ''
                    - value: doubao-seedance-1-0-pro-250528
                      name: ''
                      description: ''
                    - value: doubao-seedance-1-0-lite-t2v-250428
                      name: ''
                      description: ''
                    - value: doubao-seedance-1-0-lite-i2v-250428
                      name: ''
                      description: ''
                    - value: doubao-seedance-1-0-pro-fast-251015
                      name: ''
                      description: ''
                    - value: doubao-seedance-1-5-pro-251215
                      name: ''
                      description: ''
                content:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                      text:
                        type: string
                      image_url:
                        type: object
                        properties:
                          url:
                            type: string
                        required:
                          - url
                        x-apifox-orders:
                          - url
                      role:
                        type: string
                      video_url:
                        type: object
                        properties:
                          url:
                            type: string
                        required:
                          - url
                        x-apifox-orders:
                          - url
                      audio_url:
                        type: object
                        properties:
                          url:
                            type: string
                        required:
                          - url
                        x-apifox-orders:
                          - url
                    required:
                      - type
                    x-apifox-orders:
                      - type
                      - text
                      - image_url
                      - role
                      - video_url
                      - audio_url
                generate_audio:
                  type: boolean
                ratio:
                  type: string
                duration:
                  type: integer
                watermark:
                  type: boolean
              required:
                - model
                - content
              x-apifox-orders:
                - model
                - content
                - generate_audio
                - ratio
                - duration
                - watermark
            examples:
              '1':
                value:
                  model: doubao-seedance-2.0-mini
                  content:
                    - type: text
                      text: >-
                        全程使用视频1的第一视角构图，全程使用音频1作为背景音乐。第一人称视角果茶宣传广告，seedance牌「苹苹安安」苹果果茶限定款；首帧为图片1，你的手摘下一颗带晨露的阿克苏红苹果，轻脆的苹果碰撞声；2-4
                        秒：快速切镜，你的手将苹果块投入雪克杯，加入冰块与茶底，用力摇晃，冰块碰撞声与摇晃声卡点轻快鼓点，背景音：「鲜切现摇」；4-6
                        秒：第一人称成品特写，分层果茶倒入透明杯，你的手轻挤奶盖在顶部铺展，在杯身贴上粉红包标，镜头拉近看奶盖与果茶的分层纹理；6-8
                        秒：第一人称手持举杯，你将图片2中的果茶举到镜头前（模拟递到观众面前的视角），杯身标签清晰可见，背景音「来一口鲜爽」，尾帧定格为图片2。背景声音统一为女生音色。
                    - type: image_url
                      image_url:
                        url: >-
                          https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg
                      role: reference_image
                    - type: image_url
                      image_url:
                        url: >-
                          https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic2.jpg
                      role: reference_image
                    - type: video_url
                      video_url:
                        url: >-
                          https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_tea_video1.mp4
                      role: reference_video
                    - type: audio_url
                      audio_url:
                        url: >-
                          https://ark-project.tos-cn-beijing.volces.com/doc_audio/r2v_tea_audio1.mp3
                      role: reference_audio
                  generate_audio: true
                  ratio: '16:9'
                  duration: 11
                  watermark: false
                summary: 多模态生视频
              '2':
                value:
                  model: doubao-seedance-2-0-mini
                  content:
                    - type: text
                      text: 一只戴着黑色墨镜的白猫正在开心地跳舞，动作自然流畅，镜头缓慢推进
                  resolution: 720p
                  ratio: '16:9'
                  duration: 5
                  watermark: false
                summary: 文生视频
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
                required:
                  - id
                x-apifox-orders:
                  - id
              example:
                id: cgt-20250629201507-n6k56
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 123、未开放
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-513301405-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

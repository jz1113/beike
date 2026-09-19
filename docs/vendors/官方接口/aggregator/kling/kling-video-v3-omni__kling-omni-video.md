---
model: "kling-video-v3-omni"
capability: "video"
vendor: "kling"
source: "aggregator"
apifoxId: "384889432"
sourceUrl: "https://gpt-best.apifox.cn/api-384889432.md"
fetchedAt: "2026-09-19"
---
# kling-video-v3-omni — kling-omni-video

来源：https://gpt-best.apifox.cn/api-384889432.md

# Omni-Video

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /kling/v1/videos/omni-video:
    post:
      summary: Omni-Video
      deprecated: false
      description: >
        本文档不实时更新，完整版请查看官方文档：https://docs.qingque.cn/d/home/eZQCRUy_LWt70n5Wz2sTiLV6J?identityId=1oEFzU43FYK#section=h.hhdxwtuxzvyf


        【可灵视频O1模型亮点】

        · 输入任何内容，支持多模态视频生成

        · 多模态输入，统一创作与修改

        · 解决视频一致性问题

        · 强大组合，创意更多

        · 可控生成时间，3-10秒自由叙事
      tags:
        - 快手可灵(官方格式)
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
                prompt:
                  type: string
                  description: >-
                    文本提示词，可包含正向描述和负向描述

                    ● 可将提示词模板化来满足不同的视频生成需求

                    ● 不能超过2500个字符

                    Omni模型可通过Prompt与主体、图片、视频等内容实现多种能力

                    1. 能力范围详见使用手册：可灵 O1 - 视频 O1 使用指南（内测版）

                    2.
                    通过<<<>>>的格式来指定某个主体、图片或视频，如：<<<element_1>>>、<<<image_1>>>、<<<video_1>>>
                  maxLength: 5000
                mode:
                  type: string
                  description: |-
                    生成视频的模式
                    ● 枚举值：pro
                    ● 其中pro：专家模式（高品质），高表现模式，生成视频质量更佳
                    不同模型版本、视频模式支持范围不同，详见当前文档3-0能力地图
                  enum:
                    - std（高性能）
                    - pro（高表现）
                  x-apifox-enum:
                    - value: std（高性能）
                      name: ''
                      description: ''
                    - value: pro（高表现）
                      name: ''
                      description: ''
                  x-apifox-mock: pro
                duration:
                  type: string
                  description: "生成视频时长，单位s\n● 枚举值：3，4，5，6，7，8，9，10，其中：\n\t○ 使用文生视频、首帧图生视频、首尾帧生视频时，仅支持5和10s\n\t○ 使用视频编辑功能（\"refer_type\":\"base\"）时，输出结果与传入视频时长相同，此时当前参数无效；此时，按输入视频时长四舍五入取整计量计费"
                  enum:
                    - '5'
                    - '10'
                  x-apifox-enum:
                    - value: '5'
                      name: ''
                      description: ''
                    - value: '10'
                      name: ''
                      description: ''
                callback_url:
                  type: string
                  description: 本次任务结果回调通知地址，可选
                model_name:
                  type: string
                  description: kling-video-o1
                  x-apifox-mock: kling-video-o1
                image_list:
                  type: array
                  items:
                    type: string
                  description: "参考图列表\n● 包括主体、场景、风格等参考图片，也可作为首帧或尾帧生成视频；当作为首帧或尾帧生成视频时：\n\t○ 通过type参数来定义图片是否为首尾帧：first_frame为首帧，end_frame为尾帧\n\t○ 暂时不支持仅尾帧，即有尾帧图时必须有首帧图\n\t○ 首帧或首尾帧生视频时，不能使用视频编辑功能\n● 用key:value承载，如下：\n\"image_list\":[\n\t{\n  \t\"image_url\":\"image_url\",\n    \"type\":\"first_frame\"\n  },\n  {\n  \t\"image_url\":\"image_url\",\n    \"type\":\"end_frame\"\n  }\n]\n● 支持传入图片Base64编码或图片URL（确保可访问）\n● 图片格式支持.jpg / .jpeg / .png\n● 图片文件大小不能超过10MB，图片宽高尺寸不小于300px，图片宽高比要在1:2.5 ~ 2.5:1之间\n● 有参考视频时，参考图片数量不得超过4；无参考视频时，参考图片数量不得超过7\n● 数组中超过2张图片时，不支持设置尾帧"
                element_list:
                  type: array
                  items:
                    type: string
                  description: "主体参考列表\n● 基于主体库中主体的ID配置，用key:value承载，如下：\n\"element_list\":[\n\t{\n   \t\"element_id\":long\n  }\n]\n● 参考主体数量与有无参考视频、参考图片数量有关，其中：\n\t○ 有参考视频时，参考图片数量和参考主体数量之和不得超过4；\n\t○ 无参考视频时，参考图片数量和参考主体数量之和不得超过7"
                video_list:
                  type: array
                  items:
                    type: string
                  description: "参考视频，通过URL方式获取\n● 可作为特征参考视频，也可作为待编辑视频，默认为待编辑视频；可选择性保留视频原声\n\t○ 通过refer_type参数区分参考视频类型：feature为特征参考视频，base为待编辑视频\n\t○ 参考视频为待编辑视频时，不能定义视频首尾帧\n\t○ 通过keep_original_sound参数选择是否保留视频原声，yes为保留，no为不保留；当前参数对特征参考视频（feature）也生效\n● 用key:value承载，如下：\n\"video_list\":[\n\t{\n  \t\"video_url\":\"video_url\",\n    \"refer_type\":\"base\",\n    \"keep_original_sound\":\"yes\"\n  }\n]\n● 视频格式仅支持MP4/MOV\n● 仅支持时长≥3秒且≤10秒的视频\n● 视频宽高尺寸需介于720px（含）和2160px（含）之间\n● 视频帧率基于24fps～60fps，生成视频时会输出为24fps\n● 至多仅支持上传1段视频，视频大小不超过200MB"
                aspect_ratio:
                  type: string
                  description: |-
                    成视频的画面纵横比（宽:高）
                    ● 枚举值：16:9, 9:16, 1:1
                    ● 未使用首帧参考或视频编辑功能时，当前参数必填
              x-apifox-orders:
                - model_name
                - prompt
                - aspect_ratio
                - image_list
                - element_list
                - video_list
                - mode
                - duration
                - callback_url
              required:
                - model_name
                - prompt
                - aspect_ratio
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: 错误码；具体定义错误码
                  message:
                    type: string
                    description: 错误信息
                  request_id:
                    type: string
                    description: 请求ID，系统生成，用于跟踪请求、排查问题
                  data:
                    type: object
                    properties:
                      task_id:
                        type: string
                        description: 任务ID，系统生成
                      task_status:
                        type: string
                        description: >-
                          任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
                        enum:
                          - submitted（已提交）
                          - processing（处理中）
                          - succeed（成功）
                          - failed（失败）
                        x-apifox-enum:
                          - value: submitted（已提交）
                            name: ''
                            description: ''
                          - value: processing（处理中）
                            name: ''
                            description: ''
                          - value: succeed（成功）
                            name: ''
                            description: ''
                          - value: failed（失败）
                            name: ''
                            description: ''
                      created_at:
                        type: integer
                        description: 任务创建时间，Unix时间戳、单位ms
                      updated_at:
                        type: integer
                        description: 任务更新时间，Unix时间戳、单位ms
                    x-apifox-orders:
                      - task_id
                      - task_status
                      - created_at
                      - updated_at
                    required:
                      - task_id
                      - task_status
                      - created_at
                      - updated_at
                x-apifox-orders:
                  - code
                  - message
                  - request_id
                  - data
                required:
                  - code
                  - message
                  - request_id
                  - data
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 快手可灵(官方格式)
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-384889432-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

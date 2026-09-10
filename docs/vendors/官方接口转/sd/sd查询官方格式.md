# 查询-官方格式

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /seedance/v3/contents/generations/tasks/{task_id}:
    get:
      summary: 查询-官方格式
      deprecated: false
      description: ''
      tags:
        - 视频模型/Seedance(即梦视频/官方格式
      parameters:
        - name: task_id
          in: path
          description: ''
          required: true
          example: cgt-20250613160030-2dvd7
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
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
              example:
                content:
                  - type: video_url
                    video_url:
                      url: >-
                        https://aaasssbbb.oss-cn-beijing.aliyuncs.com/videos/20260408/cgt-20260408182454-5dqsn_1775644036.mp4
                created_at: 1775643901
                duration: 5
                execution_expires_after: 172800
                framespersecond: 24
                generate_audio: true
                id: cgt-20260408182454-5dqsn
                ratio: '16:9'
                resolution: 720p
                seed: 58354
                service_tier: default
                status: succeeded
                usage:
                  completion_tokens: 108900
                  total_tokens: 108900
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 视频模型/Seedance(即梦视频/官方格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-440251337-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```
---
model: "mjv8.2"
capability: "image"
vendor: "midjourney"
source: "aggregator"
apifoxId: "139393509"
sourceUrl: "https://gpt-best.apifox.cn/api-139393509.md"
fetchedAt: "2026-09-19"
---
# mjv8.2 — mj-fetch

来源：https://gpt-best.apifox.cn/api-139393509.md

# 指定ID获取任务(免费

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /mj/task/{id}/fetch:
    get:
      summary: 指定ID获取任务(免费
      deprecated: false
      description: ''
      operationId: fetchUsingGET_1
      tags:
        - 绘图模型/Mid journey/任务查询(免费
        - 任务查询
      parameters:
        - name: id
          in: path
          description: 任务ID
          required: true
          example: ''
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
                x-apifox-refs:
                  01HY5PKTHY68GVVV7BFHP0XRNA:
                    $ref: '#/components/schemas/%E4%BB%BB%E5%8A%A1'
                    x-apifox-overrides: {}
                properties:
                  action:
                    type: string
                    description: 任务类型
                    enum:
                      - IMAGINE
                      - UPSCALE
                      - VARIATION
                      - REROLL
                      - DESCRIBE
                      - BLEND
                  description:
                    type: string
                    description: 任务描述
                  failReason:
                    type: string
                    description: 失败原因
                  finishTime:
                    type: integer
                    format: int64
                    description: 结束时间
                  id:
                    type: string
                    description: ID
                  imageUrl:
                    type: string
                    description: 图片url
                  progress:
                    type: string
                    description: 任务进度
                  prompt:
                    type: string
                    description: 提示词
                  promptEn:
                    type: string
                    description: 提示词-英文
                  properties:
                    type: object
                    x-apifox-orders: []
                    properties: {}
                    x-apifox-ignore-properties: []
                  startTime:
                    type: integer
                    format: int64
                    description: 开始执行时间
                  state:
                    type: string
                    description: 自定义参数
                  status:
                    type: string
                    description: 任务状态
                    enum:
                      - NOT_START
                      - SUBMITTED
                      - IN_PROGRESS
                      - FAILURE
                      - SUCCESS
                  submitTime:
                    type: integer
                    format: int64
                    description: 提交时间
                  buttons:
                    type: array
                    items:
                      type: object
                      properties:
                        customId:
                          type: string
                          description: action 提交用
                        label:
                          type: string
                          description: MJ 显示的图标
                        type:
                          type: string
                        style:
                          type: string
                        emoji:
                          type: string
                      x-apifox-orders:
                        - customId
                        - label
                        - type
                        - style
                        - emoji
                      required:
                        - customId
                        - label
                        - type
                        - style
                        - emoji
                      x-apifox-ignore-properties: []
                x-apifox-orders:
                  - 01HY5PKTHY68GVVV7BFHP0XRNA
                  - buttons
                x-apifox-ignore-properties:
                  - action
                  - description
                  - failReason
                  - finishTime
                  - id
                  - imageUrl
                  - progress
                  - prompt
                  - promptEn
                  - properties
                  - startTime
                  - state
                  - status
                  - submitTime
          headers: {}
          x-apifox-name: OK
        '401':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
          headers: {}
          x-apifox-name: Unauthorized
        '403':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
          headers: {}
          x-apifox-name: Forbidden
        '404':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
          headers: {}
          x-apifox-name: Not Found
      security: []
      x-apifox-folder: 绘图模型/Mid journey/任务查询(免费
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-139393509-run
components:
  schemas:
    任务:
      type: object
      properties:
        action:
          type: string
          description: 任务类型
          enum:
            - IMAGINE
            - UPSCALE
            - VARIATION
            - REROLL
            - DESCRIBE
            - BLEND
        description:
          type: string
          description: 任务描述
        failReason:
          type: string
          description: 失败原因
        finishTime:
          type: integer
          format: int64
          description: 结束时间
        id:
          type: string
          description: ID
        imageUrl:
          type: string
          description: 图片url
        progress:
          type: string
          description: 任务进度
        prompt:
          type: string
          description: 提示词
        promptEn:
          type: string
          description: 提示词-英文
        properties:
          type: object
          x-apifox-orders: []
          properties: {}
          x-apifox-ignore-properties: []
        startTime:
          type: integer
          format: int64
          description: 开始执行时间
        state:
          type: string
          description: 自定义参数
        status:
          type: string
          description: 任务状态
          enum:
            - NOT_START
            - SUBMITTED
            - IN_PROGRESS
            - FAILURE
            - SUCCESS
        submitTime:
          type: integer
          format: int64
          description: 提交时间
      title: 任务
      x-apifox-orders:
        - action
        - description
        - failReason
        - finishTime
        - id
        - imageUrl
        - progress
        - prompt
        - promptEn
        - properties
        - startTime
        - state
        - status
        - submitTime
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
  securitySchemes: {}
servers: []
security: []

```

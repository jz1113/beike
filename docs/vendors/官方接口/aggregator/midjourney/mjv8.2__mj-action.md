---
model: "mjv8.2"
capability: "image"
vendor: "midjourney"
source: "aggregator"
apifoxId: "139393501"
sourceUrl: "https://gpt-best.apifox.cn/api-139393501.md"
fetchedAt: "2026-09-19"
---
# mjv8.2 — mj-action

来源：https://gpt-best.apifox.cn/api-139393501.md

# 执行动作(所有的关联按钮动作UPSCALE; VARIATION; REROLL; ZOOM等)

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /mj/submit/action:
    post:
      summary: 执行动作(所有的关联按钮动作UPSCALE; VARIATION; REROLL; ZOOM等)
      deprecated: false
      description: ''
      operationId: actionUsingPOST_1
      tags:
        - 绘图模型/Mid journey/任务提交
        - 任务提交
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
              x-apifox-refs:
                01JF0BHZY2TYXF5RMMAS1MEY0A:
                  $ref: >-
                    #/components/schemas/%E6%89%A7%E8%A1%8C%E5%8A%A8%E4%BD%9C%E5%8F%82%E6%95%B0
                  x-apifox-overrides:
                    state: null
              x-apifox-orders:
                - 01JF0BHZY2TYXF5RMMAS1MEY0A
              properties:
                customId:
                  type: string
                  description: 动作标识
                  examples:
                    - MJ::JOB::upsample::2::3dbbd469-36af-4a0f-8f02-df6c579e7011
                taskId:
                  type: string
                  description: 任务ID
                  examples:
                    - '14001934816969359'
                notifyHook:
                  type: string
                  description: 回调地址, 为空时使用全局notifyHook
              required:
                - customId
                - taskId
              x-apifox-ignore-properties:
                - customId
                - taskId
                - notifyHook
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/%E6%8F%90%E4%BA%A4%E7%BB%93%E6%9E%9C'
          headers: {}
          x-apifox-name: OK
        '201':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
          headers: {}
          x-apifox-name: Created
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
      x-apifox-folder: 绘图模型/Mid journey/任务提交
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-139393501-run
components:
  schemas:
    执行动作参数:
      type: object
      required:
        - customId
        - taskId
      properties:
        customId:
          type: string
          description: 动作标识
          examples:
            - MJ::JOB::upsample::2::3dbbd469-36af-4a0f-8f02-df6c579e7011
        taskId:
          type: string
          description: 任务ID
          examples:
            - '14001934816969359'
        notifyHook:
          type: string
          description: 回调地址, 为空时使用全局notifyHook
        state:
          type: string
          description: 自定义参数
      title: 执行动作参数
      x-apifox-orders:
        - customId
        - taskId
        - notifyHook
        - state
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    提交结果:
      type: object
      required:
        - code
        - description
      properties:
        code:
          type: integer
          format: int32
          description: '状态码: 1(提交成功), 21(已存在), 22(排队中), other(错误)'
          examples:
            - 1
        description:
          type: string
          description: 描述
          examples:
            - 提交成功
        properties:
          type: object
          description: 扩展字段
          x-apifox-orders: []
          properties: {}
          x-apifox-ignore-properties: []
        result:
          type: string
          description: 任务ID
          examples:
            - 1320098173412546
      title: 提交结果
      x-apifox-orders:
        - code
        - description
        - properties
        - result
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
  securitySchemes: {}
servers: []
security: []

```

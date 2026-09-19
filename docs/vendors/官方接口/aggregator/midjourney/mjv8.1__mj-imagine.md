---
model: "mjv8.1"
capability: "image"
vendor: "midjourney"
source: "aggregator"
apifoxId: "139393505"
sourceUrl: "https://gpt-best.apifox.cn/api-139393505.md"
fetchedAt: "2026-09-19"
---
# mjv8.1 — mj-imagine

来源：https://gpt-best.apifox.cn/api-139393505.md

# 提交Imagine任务(文生图、文图生图)

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /mj/submit/imagine:
    post:
      summary: 提交Imagine任务(文生图、文图生图)
      deprecated: false
      description: ''
      operationId: imagineUsingPOST
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
                01HH19J7W6JHM4D24XF33Y53TX:
                  $ref: >-
                    #/components/schemas/Imagine%E6%8F%90%E4%BA%A4%E5%8F%82%E6%95%B0
                  x-apifox-overrides:
                    accountFilter: null
                    state: null
                    notifyHook: null
              x-apifox-orders:
                - 01HH19J7W6JHM4D24XF33Y53TX
              properties:
                base64Array:
                  type: array
                  description: 垫图base64数组
                  items:
                    type: string
                  refType: string
                prompt:
                  type: string
                  description: 提示词
                  examples:
                    - Cat
              required:
                - prompt
              x-apifox-ignore-properties:
                - base64Array
                - prompt
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
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-139393505-run
components:
  schemas:
    Imagine提交参数:
      type: object
      required:
        - prompt
      properties:
        base64Array:
          type: array
          description: 垫图base64数组
          items:
            type: string
          refType: string
        notifyHook:
          type: string
          description: 回调地址, 为空时使用全局notifyHook
        prompt:
          type: string
          description: 提示词
          examples:
            - Cat
        state:
          type: string
          description: 自定义参数
      title: Imagine提交参数
      x-apifox-orders:
        - base64Array
        - notifyHook
        - prompt
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

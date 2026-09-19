---
model: "multimodal-chat"
capability: "multimodal"
vendor: "chat"
source: "aggregator"
apifoxId: "350079690"
sourceUrl: "https://gpt-best.apifox.cn/api-350079690.md"
fetchedAt: "2026-09-19"
---
# multimodal-chat — gemini-official

来源：https://gpt-best.apifox.cn/api-350079690.md

# Gemini 官方格式

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1beta/models/gemini-2.5-pro:generateContent:
    post:
      summary: Gemini 官方格式
      deprecated: false
      description: |-
        支持 Gemini 官方格式；
        所有模型均支持使用 Gemini 格式
      tags:
        - 聊天(Chat)/Gemini 官方格式
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
                contents:
                  type: array
                  items:
                    type: object
                    properties:
                      parts:
                        type: array
                        items:
                          type: object
                          properties:
                            text:
                              type: string
                generationConfig:
                  type: object
                  properties:
                    thinkingConfig:
                      type: object
                      properties:
                        thinkingBudget:
                          type: integer
                        includeThoughts:
                          type: boolean
                      required:
                        - thinkingBudget
                        - includeThoughts
                  required:
                    - thinkingConfig
              required:
                - contents
                - generationConfig
            example:
              contents:
                - parts:
                    - text: Explain how AI works in a few words
              generationConfig:
                thinkingConfig:
                  thinkingBudget: 128
                  includeThoughts: true
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
      x-apifox-folder: 聊天(Chat)/Gemini 官方格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-350079690-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```

export const generationBatchTool = {
  type: 'function' as const,
  function: {
    name: 'trigger_generate_batch',
    description: '仅在用户明确要求生成图片或视频时，请求客户端批量提交本轮 clientContext.generationBatches 清单中的条目。sourceId 和 entryIds 必须来自同一清单，不能从模型正文或任意提示词创建条目；写提示词、整理方案不代表生成授权。每次 1–30 条，重复 ID 将去重。只返回提交请求，客户端校验后执行；不得声称已经提交成功或生成成功。仍须遵守当前技能工具权限。',
    parameters: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', minLength: 1, maxLength: 255, description: '本轮客户端清单中的来源 ID' },
        entryIds: {
          type: 'array', minItems: 1, maxItems: 30,
          items: { type: 'string', minLength: 1, maxLength: 255 },
          description: '同一来源内的条目 ID，按提交顺序排列，重复项去重',
        },
      },
      required: ['sourceId', 'entryIds'],
      additionalProperties: false,
    },
  },
};

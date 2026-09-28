/** A short, user-facing task checklist, never private reasoning. */
export const planTool = {
  type: 'function' as const,
  function: {
    name: 'update_plan',
    description: '为复杂、多步骤任务维护简短执行清单。首次规划及步骤状态变化时更新；简单问答无需调用。completed 必须附已验证结果，blocked 必须说明阻碍。计划不是执行成功的证明。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        steps: { type: 'array', minItems: 1, maxItems: 8, items: {
          type: 'object', additionalProperties: false,
          properties: { title: { type: 'string', maxLength: 160 }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'] }, evidence: { type: 'string', maxLength: 600 } },
          required: ['title', 'status'],
        } },
      }, required: ['steps'],
    },
  },
};

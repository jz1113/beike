type OpenAITool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const readSkillTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'read_skill',
    description: '读取本轮技能目录中的一份技能正文和资料路径。用户点名技能，或任务与目录用途明显匹配时，必须先读完再行动。已在系统提示中展开的点选技能视为已读。不要一次读取无关技能，也不要把阅读交给子任务。',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: '技能目录中的 id' },
      },
      required: ['skill_id'],
      additionalProperties: false,
    },
  },
};

export const searchMcpToolsTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'search_mcp_tools',
    description: '按名称或描述检索本轮已连接的外部 MCP 工具。只返回名称和短描述，不执行工具。外部工具较多或未出现在函数列表中时先检索。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '名称或用途关键词，可留空以查看一批工具' },
        limit: { type: 'number', description: '返回条数，默认 8，最大 20' },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

export const loadMcpTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'load_mcp_tool',
    description: '把一个尚未直接暴露的 MCP 工具 schema 加入后续轮次。先用 search_mcp_tools 确认名称。加载后从下一轮才能调用。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'search_mcp_tools 返回的工具名' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
};

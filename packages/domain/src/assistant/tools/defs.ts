import type { ClientContext, ToolApprovalPolicy, ToolScope } from '../types';

export type AssistantDocAttachment = {
  name?: string;
  extractedText?: string;
};

export type ToolExecContext = {
  origin: string;
  signal?: AbortSignal;
  documents: AssistantDocAttachment[];
  clientContext?: ClientContext;
};

export interface ToolDefinition {
  name: string;
  scope: ToolScope;
  approval: ToolApprovalPolicy;
  openaiTool: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
}

export const OPENAI_TOOLS: ToolDefinition['openaiTool'][] = [
  {
    type: 'function',
    function: {
      name: 'execute_code',
      description: '在本地隔离 JavaScript 沙箱执行数据整理、计算和批量工具编排，无需额外模型请求。支持 await tools.工具名({...})、Promise.all 和 text(value) 输出摘要。input.documents 为当前文档，input.workspace 为工作台快照。没有文件系统、process、require、fetch 或任意网络权限。工具调用仍受当前技能权限和审批约束。代码应 await 所有调用，纯对话直接回答，不调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript 代码。使用 text() 返回必要结果，不输出完整原始数据。' },
          title: { type: 'string', description: '简短中文操作说明，例如“汇总参考图编号”' },
        },
        required: ['code', 'title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'parse_product_or_social_url',
      description:
        '解析电商商品链接/SKU 或小红书/抖音/快手等社媒作品链接，返回标题、封面、图片列表与视频地址（如有）。当用户消息中出现商品或社媒 URL、或明确要求采集/解析链接时调用。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '完整的 http(s) 商品或社媒作品链接，或纯数字京东 SKU' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_attached_document',
      description:
        '读取本轮用户已上传文档的文本片段。可按关键词搜索，或按字符偏移截取。当需要引用文档细节、核对规格或长文未完整展示时调用。',
      parameters: {
        type: 'object',
        properties: {
          document_name: { type: 'string', description: '文档文件名（可部分匹配）。不传则使用第一份文档。' },
          query: { type: 'string', description: '可选关键词，返回匹配附近的上下文片段。' },
          offset: { type: 'number', description: '可选字符起始偏移，默认 0。' },
          length: { type: 'number', description: '截取长度，默认 4000，最大 8000。' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_user_products',
      description:
        '列出用户本地商品库中最近采集/保存的商品摘要（标题、平台、封面）。当用户询问「我有哪些商品」「商品库」「历史采集」时调用。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '返回条数，默认 10，最大 30。' },
          keyword: { type: 'string', description: '可选标题关键词过滤。' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_asset_library',
      description:
        '搜索提示词资产库（场景/穿搭/动作/人设/完整提示词），返回摘要列表（id、code、title）。查看某条资产的完整提示词正文须再调用 get_prompt_asset_detail。',
      parameters: {
        type: 'object',
        properties: {
          asset_type: {
            type: 'string',
            enum: ['scene', 'outfit', 'action', 'persona', 'full_prompt', 'all'],
            description: '资产类型',
          },
          keyword: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回条数，默认 10，最大 30' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prompt_asset_detail',
      description:
        '读取提示词资产库中单条资产的完整详情（含 reversePromptZh 九段式全文、九维分析、四维摘要）。当用户要查看某条资产的具体提示词内容、或已通过 query_asset_library 获得 id 后需要全文时调用。',
      parameters: {
        type: 'object',
        properties: {
          asset_type: {
            type: 'string',
            enum: ['scene', 'outfit', 'action', 'persona', 'full_prompt'],
            description: '资产类型，默认 full_prompt',
          },
          asset_id: { type: 'string', description: '资产数据库 id（非 code）；可先 query_asset_library 搜索获得' },
        },
        required: ['asset_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deconstruct_image',
      description: '对图片 URL 进行视觉反推，提取可复用的生图提示词。当用户要求反推/拆解参考图时调用。',
      parameters: {
        type: 'object',
        properties: {
          image_url: { type: 'string', description: '要反推的图片 URL' },
        },
        required: ['image_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workshop_state',
      description:
        '获取用户当前工作台状态（所在视图、工坊步骤、已载入商品、拍摄架构）。当需要感知用户当前工作环境时调用。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'workspace_navigate',
      description:
        '工作台视图调度导航。当用户明确要求「去种草工坊」「去极速生图」「查看资产中心」「返回首页」或需要跨模块执行任务时调用。',
      parameters: {
        type: 'object',
        properties: {
          target_view: {
            type: 'string',
            enum: ['workshop', 'generate', 'assets', 'home'],
            description: '目标工作台视图',
          },
          reason: { type: 'string', description: '跳转或调度原因' },
        },
        required: ['target_view'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'workspace_load_workshop_product',
      description: '将指定商品一键装载进入「种草工坊五步流程」开始全流程买家秀图文制作。',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: '商品 itemId 或 SKU' },
          title: { type: 'string', description: '商品标题' },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trigger_generate',
      description: '将优化后的提示词发送到极速生图工作区并准备生图。当用户明确要求开始生图时调用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '生图提示词正文' },
          model: { type: 'string', description: '可选生图模型 ID' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_workshop_arch',
      description: '切换种草工坊的拍摄架构偏好。当用户要求更换拍摄方案/架构时调用。',
      parameters: {
        type: 'object',
        properties: {
          arch_id: { type: 'string', description: '拍摄架构 ID' },
          reason: { type: 'string', description: '切换原因' },
        },
        required: ['arch_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_view_capabilities',
      description:
        '查询当前所在工作台视图可执行的子动作清单（可加载的商品、可切换的架构、可触发的生图模式等）。当 agent 即将执行跨视图操作前、或需要根据工作台当前能力调整下一步动作时调用。',
      parameters: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            enum: ['home', 'workshop', 'generate', 'assets', 'collect', 'settings'],
            description: '要查询的视图；留空则使用当前视图',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_video_media',
      description:
        '分析视频物理参数（精确时长、分辨率、帧率、长宽比、大小）。当用户要求拆解视频、短片基调、拍摄参数推测或实拍复刻时，必须在任何深入分析的第一步调用。',
      parameters: {
        type: 'object',
        properties: {
          video_url: { type: 'string', description: '视频文件路径、名称或 URL' },
        },
        required: ['video_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_video_storyboard',
      description:
        '对视频进行全片等距/关键帧抽样，并自动拼合成一张全景故事板联系表（Contact Sheet 九宫格大图）。调用后系统会将故事板大图动态提供给视觉模型，用于鸟瞰全片结构、固定机位与转场节奏变化。',
      parameters: {
        type: 'object',
        properties: {
          video_url: { type: 'string', description: '视频路径、文件名或 URL' },
          sample_count: { type: 'number', description: '抽样帧数，默认 12，推荐 8-16' },
        },
        required: ['video_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_video_detailed_frames',
      description:
        '针对视频特定时间段（如前3秒开头、特写镜头、换装转场瞬间）深度截取多张高清连续帧。调用后系统会将抽出的高清图片呈递给视觉模型，用于像素级细看人物服装纹理、妆容细节、道具、字幕文字或微表情。',
      parameters: {
        type: 'object',
        properties: {
          video_url: { type: 'string', description: '视频路径、文件名或 URL' },
          start_time: { type: 'number', description: '起始秒数，例如 0' },
          end_time: { type: 'number', description: '结束秒数，例如 3' },
          frame_count: { type: 'number', description: '截取张数，默认 4' },
        },
        required: ['video_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description:
        '启动一个子智能体执行复杂子任务。当主智能体需要并行处理多个独立子任务、或需要借助特定技能（如数据分析、文案写作、提示词优化等）完成子目标时调用此工具。子智能体将在独立上下文中执行，结果回传后合并入主智能体回复。',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string', description: '子智能体使用的技能 ID（如 "prompt-engineer", "data-analyst"）' },
          prompt: { type: 'string', description: '给子智能体的具体任务指令' },
        },
        required: ['skill_id', 'prompt'],
      },
    },
  },
];

export const TOOL_META: Record<string, { scope: ToolScope; approval: ToolApprovalPolicy }> = {
  parse_product_or_social_url: { scope: 'server', approval: 'none' },
  read_attached_document: { scope: 'server', approval: 'none' },
  list_user_products: { scope: 'server', approval: 'none' },
  query_asset_library: { scope: 'server', approval: 'none' },
  get_prompt_asset_detail: { scope: 'server', approval: 'none' },
  deconstruct_image: { scope: 'server', approval: 'none' },
  inspect_video_media: { scope: 'server', approval: 'none' },
  extract_video_storyboard: { scope: 'server', approval: 'none' },
  extract_video_detailed_frames: { scope: 'server', approval: 'none' },
  spawn_subagent: { scope: 'server', approval: 'none' },
  get_workshop_state: { scope: 'client', approval: 'none' },
  get_view_capabilities: { scope: 'client', approval: 'none' },
  workspace_navigate: { scope: 'client', approval: 'per_turn' },
  workspace_load_workshop_product: { scope: 'client', approval: 'per_turn' },
  trigger_generate: { scope: 'client', approval: 'per_turn' },
  set_workshop_arch: { scope: 'client', approval: 'per_turn' },
};

export const TOOL_DEFINITIONS: ToolDefinition[] = OPENAI_TOOLS.map((t) => {
  const name = t.function.name;
  const meta = TOOL_META[name] || { scope: 'server' as const, approval: 'none' as const };
  return { name, ...meta, openaiTool: t };
});

/** @deprecated use getOpenAITools() */
export const ASSISTANT_TOOLS = TOOL_DEFINITIONS.map((d) => d.openaiTool);

export function getOpenAITools(
  extraMcpTools: ToolDefinition['openaiTool'][] = [],
  allowedToolNames?: string[],
) {
  const baseTools = TOOL_DEFINITIONS.map((d) => d.openaiTool);
  const filtered =
    allowedToolNames !== undefined
      ? baseTools.filter((t) => t.function.name === 'execute_code' || allowedToolNames.includes(t.function.name))
      : baseTools;
  const mcpTools = allowedToolNames !== undefined ? extraMcpTools.filter((tool) => allowedToolNames.includes(tool.function.name)) : extraMcpTools;
  return [...filtered, ...mcpTools];
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((d) => d.name === name);
}

export function toolDisplayName(name: string): string {
  switch (name) {
    case 'execute_code':
      return '运行代码';
    case 'parse_product_or_social_url':
      return '解析商品/社媒链接';
    case 'read_attached_document':
      return '阅读附件文档';
    case 'list_user_products':
      return '查询商品库';
    case 'query_asset_library':
      return '搜索资产库';
    case 'get_prompt_asset_detail':
      return '读取提示词资产详情';
    case 'deconstruct_image':
      return '反推图片提示词';
    case 'get_workshop_state':
      return '读取工作台状态';
    case 'workspace_navigate':
      return '调度工作台视图';
    case 'workspace_load_workshop_product':
      return '载入种草工坊';
    case 'trigger_generate':
      return '触发生图';
    case 'set_workshop_arch':
      return '切换拍摄架构';
    case 'inspect_video_media':
      return '探查视频物理规格';
    case 'extract_video_storyboard':
      return '提取全片故事板九宫格';
    case 'extract_video_detailed_frames':
      return '提取关键镜头特写画面';
    default:
      return name;
  }
}

export function summarizeToolResult(raw: string): string {
  try {
    const j = JSON.parse(raw);
    if (j.success === false) return j.error || '失败';
    if (j.sandbox === 'quickjs-wasm') return j.output?.join('\n').slice(0, 1200) || '代码执行完成';
    if (j.kind === 'social') return `社媒「${j.title || ''}」图${j.imageCount || 0}张`;
    if (j.kind === 'ecommerce') return `商品「${j.title || ''}」`;
    if (j.products) return `商品库 ${j.count || j.products.length} 条`;
    if (j.assets) return `资产库 ${j.count || j.assets.length} 条`;
    if (j.excerpt) return `文档片段 ${String(j.excerpt).length} 字`;
    if (j.action === 'navigate') return `导航至 ${j.target_view}`;
    if (j.action === 'load_workshop_product') return `载入商品 ${j.itemId}`;
    if (j.action === 'trigger_generate') return '准备生图';
    if (j.action === 'set_workshop_arch') return `切换架构 ${j.arch_id}`;
    if (j.workshopState) return '已读取工作台状态';
    return '完成';
  } catch {
    return raw.slice(0, 80);
  }
}

export function parseToolAction(raw: string): Record<string, unknown> | undefined {
  try {
    const j = JSON.parse(raw);
    if (j?.action) return j as Record<string, unknown>;
    return undefined;
  } catch {
    return undefined;
  }
}

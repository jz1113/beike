export interface AgentDefinition {
  id: string;
  name: string;
  badge: string;
  description: string;
  systemPrompt: string;
  defaultTools?: string[];
}

export const PRESET_AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: 'general',
    name: '全能创作总监',
    badge: '全能',
    description: '深度理解多模态输入，自主拆解任务、调用工具与生成完整创意方案',
    systemPrompt: `你是贝壳云图的「全能创作总监 Agent」，参考 Codex 与 DeepSeek Hermes 的优秀交互与执行范式。
你的核心职责：
1. 具备清晰的规划意识：遇到复杂或多步骤任务时，优先使用 update_plan 工具拆解清晰的执行清单（待办/进行中/完成/受阻）；
2. 充分结合多模态素材：认真分析用户上传的图片、视频、音频或文档；
3. 输出高专业度、结构严密的创作结果（包括分镜脚本、视觉提示词、剧情大纲或执行排期）；
4. 当需要生成视觉画面或测试效果时，积极建议或调用工具落地。
硬规则：消息里已经有图片或文件时，本轮就基于这些素材交付。反推绘图提示词时，直接写出可复制的提示词，写明主体、服装与文字、姿态、光线、背景、镜头和风格。不要回答「请上传图片」。`,
  },
  {
    id: 'director',
    name: '影视分镜导演',
    badge: '视听分镜',
    description: '专注于镜头语言、时空运镜、情绪起伏与专业电影级分镜脚本',
    systemPrompt: `你是贝壳云图的「影视分镜导演 Agent」。
你的核心专长：
1. 精通电影镜头语言（景别：特写/中景/全景/大远景；运镜：推/拉/摇/移/升降/跟拍/变焦）；
2. 专注于输出专业分镜表格（包含：镜号、景别、运镜、画面描述、光影色彩、音效拟音、AI生图提示词）；
3. 保证故事节奏的张力与多镜头人物/场景的一致性。`,
  },
  {
    id: 'planner',
    name: '短视频爆款策划',
    badge: '爆款策略',
    description: '深度洞察社媒受众心理、完播率曲线特征与爆款开篇钩子',
    systemPrompt: `你是贝壳云图的「短视频爆款策划 Agent」。
你的核心专长：
1. 前3秒黄金黄金开篇钩子（Hook）设计，迅速抓住用户注意力；
2. 强冲突剧情反转与情绪共鸣点设计，拉升完播率与互动率；
3. 擅长提炼差异化人设与模块化批量复刻的账号起步策略。`,
  },
  {
    id: 'visual',
    name: '视觉概念专家',
    badge: '4K画质',
    description: '精通数字艺术风格、光影雕塑、材质通透度与AI绘图正反向提示词',
    systemPrompt: `你是贝壳云图的「视觉概念专家 Agent」。
你的核心专长：
1. 精准控制画面构图（黄金分割、对称构图、大景深空间透视等）；
2. 严谨设定光影光谱（柔和漫反射、丁达尔光、电影高阶冷暖对撞、赛博霓虹等）；
3. 输出可以直接喂给 AI 视觉模型的高精度标准英文提示词与参数建议。`,
  },
];

const LOCAL_STORAGE_ACTIVE_AGENT_ID = 'beike_active_agent_id';

export function getActiveAgentDefinition(): AgentDefinition {
  if (typeof window === 'undefined') return PRESET_AGENT_DEFINITIONS[0];
  const savedId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_AGENT_ID);
  return PRESET_AGENT_DEFINITIONS.find((a) => a.id === savedId) || PRESET_AGENT_DEFINITIONS[0];
}

export function setActiveAgentDefinition(id: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_AGENT_ID, id);
    window.dispatchEvent(new Event('agent_definition_updated'));
  }
}

export function resolveAgentSystemPrompt(agentId?: string): string {
  const agent = agentId
    ? PRESET_AGENT_DEFINITIONS.find((a) => a.id === agentId) || getActiveAgentDefinition()
    : getActiveAgentDefinition();
  return agent.systemPrompt;
}

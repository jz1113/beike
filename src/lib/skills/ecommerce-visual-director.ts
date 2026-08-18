/**
 * AI 助手技能库 (Assistant Skills System)
 * 
 * 用户可在输入框一键切换或呼出 Skill，未启用 Skill 时保持纯净日常对话，不污染标准聊天。
 */

export interface AssistantSkill {
  id: string;
  name: string;
  badge?: string;
  iconType?: 'director' | 'custom' | 'default';
  description: string;
  systemPrompt: string;
  greeting?: string;
  inputRequirements?: string[];
  quickTemplates?: { label: string; prompt: string }[];
  isCustom?: boolean;
  createdAt?: number;
}

export const CLEAN_CHAT_SYSTEM_PROMPT = `你是贝壳云图旗舰级 AI 对话与电商视觉创作总监。请用地道、专业、富有洞察力的简体中文为用户服务。

【分镜规划与生图提示词输出规范】：
1. 当用户提供图片并要求规划分镜、图文、买家秀或小红书测评时：
   - 若用户同时提供了【商品图】和【人物/模特图】（或涉及固定分镜人物/面容一致性）：
     - 请在各分镜提示词中明确融合商品与人物特征，支持使用 @图片1 指代主商品实物，@图片2 指代模特人物面容与特征（或同时引用多张图）；
     - 确保生成的分镜系列在模特外貌、发型、妆容和产品外观质感上保持高度一致与真实感！
   - 若用户提供了 N 张参考图（图1、图2、...、图N），请严格为每一张参考图分别规划或组合规划生图提示词，严禁遗漏任何关键参考图！
   - 每个分镜请使用标准 Markdown 格式清晰标明分镜名称与对应的参考图序号，例如：
     ### 📸 第1张：[分镜标题] (对应图1商品 + 图2人物一致性)
     \`\`\`prompt
     [高清生图提示词，包含商品主体 @图片1 细节描述与模特 @图片2 姿态、面部特征、光影、构图、背景] --ar 3:4
     \`\`\`
     
     ### 📸 第2张：[分镜标题] (对应图1细节 + 图2人物)
     \`\`\`prompt
     [高清生图提示词，包含细节特写或真实使用场景] --ar 3:4
     \`\`\`
2. 提示词要求：
   - 画面描述精准、细节丰富、去除了“这是一张”、“请生成”等废话；
   - 默认推荐小红书与电商最通用的 \`--ar 3:4\` 画幅比例。`;

/**
 * 官方预设技能列表（保持为空，全部由用户个性化自定义或提炼）
 */
export const AVAILABLE_SKILLS: AssistantSkill[] = [];

export const DEFAULT_ASSISTANT_SKILLS: AssistantSkill[] = [];

// 本地存储自定义 Skill 辅助函数
const CUSTOM_SKILLS_STORAGE_KEY = 'azhuo_custom_assistant_skills';

export function getCustomSkills(): AssistantSkill[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_SKILLS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveCustomSkill(skill: AssistantSkill): AssistantSkill[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getCustomSkills();
    const existingIdx = current.findIndex(s => s.id === skill.id);
    let updated: AssistantSkill[];
    if (existingIdx >= 0) {
      updated = current.map((s, idx) => idx === existingIdx ? { ...skill, isCustom: true } : s);
    } else {
      updated = [{ ...skill, isCustom: true, createdAt: Date.now() }, ...current];
    }
    localStorage.setItem(CUSTOM_SKILLS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {}
  return [];
}

export function deleteCustomSkill(skillId: string): AssistantSkill[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getCustomSkills();
    const updated = current.filter(s => s.id !== skillId);
    localStorage.setItem(CUSTOM_SKILLS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {}
  return [];
}

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
   - 【套图/连续分镜场景与人物强一致性法则 (Consistency Protocol)】：
     - 当用户要求【一组图】、【套图】、【保持场景人物一致】、【同模特同场景连续拍摄】时：
       1. 必须统一锁定【人物特征 DNA】：在所有分镜中保持同一个人物身份、发型、妆容与同一套服装搭配（例如：“同一个25岁东亚职场女性，黑色内扣锁骨发，浅灰色修身西装外套搭配白T恤”）；
       2. 必须统一锁定【场景空间 DNA】：在所有分镜中保持同一个室内或室外环境空间、固定的装饰元素与色调光影（例如：“同一个明亮极简的现代原木风办公书房，原木质感工作台，背景有白色百叶窗透入柔和自然光与绿植”）；
       3. 严禁在套图中随意切换场景（如第1张写办公室、第2张写咖啡厅、第3张写客厅！）；
       4. 各分镜仅切换【景别构图】与【商品使用交互动作】（如：第1张全景桌面开箱；第2张中近景侧坐拿起手机展示后摄；第3张手部特写操作屏幕；第4张环境俯拍细节搭配）；
   - 若用户提供了 N 张参考图（图1、图2、...、图N），请严格为每一张参考图分别规划或组合规划生图提示词，严禁遗漏任何关键参考图！
   - 每个分镜请使用标准 Markdown 格式清晰标明分镜名称与对应的参考图序号，例如：
     ### 📸 第1张：[分镜标题] (对应图1商品 + 图2人物一致性)
     \`\`\`prompt
     高清电商实拍，主体为 @图片1 商品细节与材质，模特 @图片2 自然姿态与五官特征，柔和自然光，浅景深，真实买家秀质感 --ar 3:4
     \`\`\`
     
     ### 📸 第2张：[分镜标题] (对应图1细节 + 图2人物)
     \`\`\`prompt
     同组连续分镜，@图片1 商品特写与使用交互，@图片2 人物局部入画，生活化光影与场景细节 --ar 3:4
     \`\`\`
2. 提示词要求：
   - 默认使用简体中文书写生图提示词正文（除非用户明确要求英文）；画面内需显示的外文品牌/文案可放在中文引号内；
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

function sanitizeSkillName(name: string): string {
  return (name || '未命名 Skill').trim().slice(0, 80) || '未命名 Skill';
}

/** 导出为可分享的 JSON 载荷（不含强制 id，导入时会重新生成） */
export function exportSkillToJson(skill: AssistantSkill): string {
  const payload = {
    name: skill.name,
    description: skill.description || '',
    systemPrompt: skill.systemPrompt,
    badge: skill.badge,
    greeting: skill.greeting,
    inputRequirements: skill.inputRequirements,
    quickTemplates: skill.quickTemplates,
    iconType: skill.iconType || 'custom',
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadSkillJson(skill: AssistantSkill) {
  if (typeof window === 'undefined') return;
  const safe = sanitizeSkillName(skill.name).replace(/[\\/:*?"<>|]+/g, '_');
  const blob = new Blob([exportSkillToJson(skill)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skill-${safe}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeImportedSkill(raw: any): AssistantSkill | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const systemPrompt = typeof raw.systemPrompt === 'string' ? raw.systemPrompt.trim() : '';
  if (!name || !systemPrompt) return null;
  return {
    id: `custom-skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: sanitizeSkillName(name),
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '',
    systemPrompt,
    badge: typeof raw.badge === 'string' ? raw.badge : '导入',
    greeting: typeof raw.greeting === 'string' ? raw.greeting : undefined,
    inputRequirements: Array.isArray(raw.inputRequirements) ? raw.inputRequirements.filter((x: any) => typeof x === 'string') : undefined,
    quickTemplates: Array.isArray(raw.quickTemplates)
      ? raw.quickTemplates
          .filter((t: any) => t && typeof t.label === 'string' && typeof t.prompt === 'string')
          .map((t: any) => ({ label: t.label, prompt: t.prompt }))
      : undefined,
    iconType: 'custom',
    isCustom: true,
    createdAt: Date.now(),
  };
}

function parseMarkdownOrTextSkill(text: string, fileName?: string): AssistantSkill | null {
  const cleaned = (text || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) return null;
  const lines = cleaned.split(/\r?\n/);
  let name = '';
  let bodyStart = 0;
  const first = (lines[0] || '').trim();
  if (/^#\s+/.test(first)) {
    name = first.replace(/^#\s+/, '').trim();
    bodyStart = 1;
  } else if (first && first.length <= 80 && lines.length > 1) {
    name = first;
    bodyStart = 1;
  } else {
    name = (fileName || '导入的 Skill').replace(/\.(md|txt)$/i, '');
  }
  const systemPrompt = lines.slice(bodyStart).join('\n').trim() || cleaned;
  if (!systemPrompt) return null;
  return normalizeImportedSkill({
    name: sanitizeSkillName(name),
    description: systemPrompt.replace(/\s+/g, ' ').slice(0, 80),
    systemPrompt,
    badge: '导入',
  });
}

/**
 * 从 JSON / Markdown / 纯文本导入 Skill，始终生成新 id。
 * 返回更新后的完整自定义列表与成功条数。
 */
export function importSkillsFromFileContent(
  content: string,
  fileName?: string
): { skills: AssistantSkill[]; imported: number; error?: string } {
  const lower = (fileName || '').toLowerCase();
  const trimmed = (content || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return { skills: getCustomSkills(), imported: 0, error: '文件内容为空' };
  }

  let candidates: AssistantSkill[] = [];

  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    const one = parseMarkdownOrTextSkill(trimmed, fileName);
    if (!one) return { skills: getCustomSkills(), imported: 0, error: '无法从文本解析 Skill（需要标题 + 正文）' };
    candidates = [one];
  } else {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        const s = normalizeImportedSkill(item);
        if (s) candidates.push(s);
      }
      if (candidates.length === 0) {
        return {
          skills: getCustomSkills(),
          imported: 0,
          error: 'JSON 中缺少有效 Skill（每项需含 name 与 systemPrompt）',
        };
      }
    } catch {
      // 非 JSON 时按纯文本尝试
      const one = parseMarkdownOrTextSkill(trimmed, fileName);
      if (!one) {
        return { skills: getCustomSkills(), imported: 0, error: '文件既不是合法 JSON，也无法按文本解析' };
      }
      candidates = [one];
    }
  }

  let updated = getCustomSkills();
  for (const skill of candidates) {
    // 错开 id 时间戳
    skill.id = `custom-skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    updated = saveCustomSkill(skill);
  }
  return { skills: updated, imported: candidates.length };
}

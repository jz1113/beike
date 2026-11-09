import packages from './compiledSkillPackages.json';
import type { AssistantSkill } from './types';

/** Generated only by skills:build; SKILL.md is the maintained instruction source. */
const byId = new Map((packages as unknown as AssistantSkill[]).map(skill => [skill.id, skill]));

function getBuiltinPackages(ids: readonly string[]): AssistantSkill[] {
  return ids.map(id => {
    const skill = byId.get(id);
    if (!skill) throw new Error(`Missing builtin skill package: ${id}`);
    return skill;
  });
}

const BUILTIN_VIDEO_ASSISTANT_SKILLS = getBuiltinPackages([
  'h3-prompt-writing',
  'sd2-pe',
  'sd25-pe',
  'wan3-pe',
  'kling-3-prompting',
  'scenario-kling',
  'scenario-veo',
  'scenario-vidu',
  'scenario-grok-imagine-video',
  'gemini-omni-flash-api',
  'ai-video-prompt-writer',
]);

export const ASSISTANT_SKILL_CATEGORIES = [
  '官方视频提示词', '社区视频提示词', '模型提示词规范',
  '素材分析', '专业影视', '人物设定', '营销广告',
] as const;

export const BUILTIN_AGENT_RUNTIME_SKILLS: AssistantSkill[] = [
  ...BUILTIN_VIDEO_ASSISTANT_SKILLS,
];

/** 可被用户选择的全部助手兼容技能；自动运行目录仅包含运行技能。 */
export const BUILTIN_ASSISTANT_SKILLS: AssistantSkill[] = [
  ...BUILTIN_AGENT_RUNTIME_SKILLS,
  ...getBuiltinPackages([
    'beike-prompt-extraction',
    'beike-cinematic-storyboard',
    'beike-character-three-view',
    'beike-ugc-product-sales',
  ]),
];

export function getBuiltinAssistantSkill(id: string): AssistantSkill | undefined {
  return BUILTIN_ASSISTANT_SKILLS.find((s) => s.id === id || s.name === id);
}

export function resolveSkillCategory(skill: AssistantSkill): string {
  if (skill.category?.trim()) return skill.category.trim();
  const tag = skill.meta?.tags?.[0]?.trim();
  if (tag) return tag;
  return skill.isBuiltin ? '视觉反推与图像生成' : '个人自定义技能';
}

export function groupAssistantSkillsByCategory(
  skills: AssistantSkill[],
): Array<{ category: string; skills: AssistantSkill[] }> {
  const buckets = new Map<string, AssistantSkill[]>();
  for (const cat of ASSISTANT_SKILL_CATEGORIES) {
    buckets.set(cat, []);
  }
  for (const skill of skills) {
    const cat = resolveSkillCategory(skill);
    const list = buckets.get(cat);
    if (list) list.push(skill);
    else buckets.set(cat, [skill]);
  }
  return Array.from(buckets.entries())
    .filter(([, list]) => list.length > 0)
    .map(([category, list]) => ({ category, skills: list }));
}

export function resolveSkillAllowedTools(
  skillId: string | undefined,
  clientAllowedTools?: string[],
): string[] | undefined {
  const builtin = skillId ? getBuiltinAssistantSkill(skillId) : undefined;
  const builtinTools = builtin?.runtimeTools ?? builtin?.tools;
  if (Array.isArray(clientAllowedTools)) {
    return builtinTools ? clientAllowedTools.filter(name => builtinTools.includes(name)) : [...clientAllowedTools];
  }
  return builtinTools ? [...builtinTools] : undefined;
}

import { BUILTIN_CREATION_SKILLS } from './builtinCreationSkills';
import { BUILTIN_DOMAIN_ASSISTANT_SKILLS } from './builtinDomainSkills';
import { BUILTIN_IMAGE_ASSISTANT_SKILLS, PROMPT_REVERSE_ENGINEER_SKILL_ID } from './builtinImageSkills';
import { BUILTIN_VIDEO_ASSISTANT_SKILLS } from './builtinVideoSkills';
import type { AssistantSkill } from './types';

export { PROMPT_REVERSE_ENGINEER_SKILL_ID };

export const ASSISTANT_SKILL_CATEGORIES = [
  '模型提示词规范', '视觉理解与素材分析', '内容生产流程',
  '内容采集与资料读取', '数据审核', '技能维护与扩展',
] as const;

export const BUILTIN_AGENT_RUNTIME_SKILLS: AssistantSkill[] = [
  ...BUILTIN_IMAGE_ASSISTANT_SKILLS,
  ...BUILTIN_VIDEO_ASSISTANT_SKILLS,
  ...BUILTIN_DOMAIN_ASSISTANT_SKILLS,
];

/** 可被用户选择的全部助手兼容技能；自动运行目录仅包含运行技能。 */
export const BUILTIN_ASSISTANT_SKILLS: AssistantSkill[] = [
  ...BUILTIN_AGENT_RUNTIME_SKILLS,
  ...BUILTIN_CREATION_SKILLS,
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
  const builtinTools = skillId ? getBuiltinAssistantSkill(skillId)?.tools : undefined;
  if (Array.isArray(clientAllowedTools)) {
    return builtinTools ? clientAllowedTools.filter(name => builtinTools.includes(name)) : [...clientAllowedTools];
  }
  return builtinTools ? [...builtinTools] : undefined;
}

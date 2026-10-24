import type { AssistantSkill } from './types';

export type SkillPurpose = 'agent' | 'creation';

export const SKILL_PURPOSES = {
  agent: {
    label: 'Agent 运行技能',
    description: 'Agent 的任务执行规范，定义判断方法、工具流程与输出要求。',
    invocation: '任务匹配时自动按需读取，也可为本次消息指定一项。',
    content: '执行步骤、工具范围、模型提示词规范、参考资料。',
  },
  creation: {
    label: '创作技能',
    description: '可复用的具体创作模板，定义要生成的作品与需要替换的内容。',
    invocation: '由你选择后应用到当前创作；工坊模板应用到换品流程。',
    content: '完整脚本、分镜、风格约束、创作提示词与参考作品。',
  },
} as const;

/** 用途与提供方、体裁无关；旧包保留兼容识别，声明了工具流程的旧包优先归入运行技能。 */
export function resolveSkillKind(skill: AssistantSkill): SkillPurpose {
  if (skill.meta?.kind === 'agent' || skill.meta?.kind === 'creation') return skill.meta.kind;
  if (skill.isBuiltin || skill.tools !== undefined || skill.steps?.length || skill.references?.length) return 'agent';
  return skill.meta && (skill.meta.coverUrl || skill.meta.showcaseUrls?.length || skill.meta.genres?.length)
    ? 'creation' : 'agent';
}

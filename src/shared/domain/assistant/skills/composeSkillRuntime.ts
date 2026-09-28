import type { AssistantSkill, AssistantSkillRuntime } from './types';
import { resolveSkillReferenceContent } from './references';

function buildReferencesBlock(skill: AssistantSkill): string {
  const refs = skill.references;
  if (!refs?.length) return '';

  const sections: string[] = [];
  for (const ref of refs) {
    const content = resolveSkillReferenceContent(ref.path);
    if (!content?.trim()) continue;
    const label = ref.label?.trim() || ref.path;
    sections.push(`## 参考：${label}\n\n${content.trim()}`);
  }
  return sections.join('\n\n');
}

/**
 * 将技能 manifest 组装为可注入 systemPrompt 的正文与运行时元数据。
 */
export function composeSkillRuntime(skill: AssistantSkill | null | undefined): AssistantSkillRuntime | null {
  if (!skill?.id || !skill.prompt?.trim()) return null;

  const referencesBlock = buildReferencesBlock(skill);
  const parts = [
    `【当前激活技能：${skill.name}】`,
    skill.prompt.trim(),
    referencesBlock,
  ].filter(Boolean);

  const allowedTools = skill.tools ? [...skill.tools] : undefined;

  return {
    skillId: skill.id,
    systemPrompt: parts.join('\n\n'),
    allowedTools,
  };
}

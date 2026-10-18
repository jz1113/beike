import type { AssistantSkill, AssistantSkillRuntime } from './types';
import { resolveSkillReferenceContent } from './references';

/** 注入模型的技能正文上限，避免附属文件把请求撑得过大 */
const MAX_SKILL_RUNTIME_CHARS = 24_000;

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

function buildFilesBlock(skill: AssistantSkill): string {
  const files = skill.files;
  if (!files?.length) return '';
  const sections: string[] = [];
  for (const file of files) {
    const content = file.content?.trim();
    const path = file.path?.trim();
    if (!path || !content) continue;
    sections.push(`## 附属文件：${path}\n\n${content}`);
  }
  return sections.join('\n\n');
}

/**
 * 将技能 manifest 组装为可注入 systemPrompt 的正文与运行时元数据。
 * 主指令之后附上参考规范和附属文件，超长时从末尾截断。
 */
export function composeSkillRuntime(skill: AssistantSkill | null | undefined): AssistantSkillRuntime | null {
  if (!skill?.id || !skill.prompt?.trim()) return null;

  const parts = [
    `【当前激活技能：${skill.name}】`,
    skill.prompt.trim(),
    buildReferencesBlock(skill),
    buildFilesBlock(skill),
  ].filter(Boolean);

  let systemPrompt = parts.join('\n\n');
  if (systemPrompt.length > MAX_SKILL_RUNTIME_CHARS) {
    systemPrompt = `${systemPrompt.slice(0, MAX_SKILL_RUNTIME_CHARS).trimEnd()}\n\n…（技能内容已截断）`;
  }

  const allowedTools = skill.tools ? [...skill.tools] : undefined;

  return {
    skillId: skill.id,
    systemPrompt,
    allowedTools,
  };
}

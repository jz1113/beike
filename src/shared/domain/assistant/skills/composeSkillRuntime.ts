import type { AssistantSkill, AssistantSkillRuntime, SkillResourceFile } from './types';
import { resolveSkillReferenceContent } from './references';

/** 注入模型的技能正文上限。附属文件不在这里展开。 */
const MAX_SKILL_RUNTIME_CHARS = 12_000;
const MAX_RESOURCE_CHARS = 40_000;
const MAX_RESOURCES = 24;

function clipResource(content: string): string {
  const text = content.trim();
  const note = '\n\n…（文件剩余部分未随技能包发送）';
  if (text.length <= MAX_RESOURCE_CHARS) return text;
  return `${text.slice(0, MAX_RESOURCE_CHARS - note.length).trimEnd()}${note}`;
}

function pushResource(resources: SkillResourceFile[], path: string, content: string) {
  const key = path.trim();
  const body = content.trim();
  if (!key || !body || resources.some((item) => item.path === key) || resources.length >= MAX_RESOURCES) return;
  resources.push({ path: key, content: clipResource(body) });
}

/** 参考规范和附属文件只登记路径，正文留给 read_skill_file。 */
export function collectSkillResources(skill: AssistantSkill): SkillResourceFile[] {
  const resources: SkillResourceFile[] = [];
  for (const ref of skill.references || []) {
    const content = resolveSkillReferenceContent(ref.path);
    if (!content) continue;
    pushResource(resources, ref.path, content);
  }
  for (const file of skill.files || []) {
    pushResource(resources, file.path || '', file.content || '');
  }
  return resources;
}

function resourceIndex(skill: AssistantSkill, resources: SkillResourceFile[]): string {
  if (!resources.length) return '';
  const labels = new Map((skill.references || []).map((ref) => [ref.path.trim(), ref.label?.trim() || '']));
  const lines = resources.map((resource) => {
    const label = labels.get(resource.path);
    return label ? `- ${resource.path}（${label}）` : `- ${resource.path}`;
  });
  return [
    '【技能资料按需读取】',
    '主指令已经在上面。下列文件没有展开。需要样例、规范或细则时调用 read_skill_file，path 必须与列表中的路径一致。不要猜测未读取的文件内容。',
    ...lines,
  ].join('\n');
}

/**
 * 已选技能只注入主指令和资料目录。
 * 附属文件与参考规范留在 resources，由 read_skill_file 按需读取。
 */
export function withSkillFileTool(tools: string[] | undefined, resources?: Array<{ path: string }>): string[] | undefined {
  if (!resources?.length || !tools || tools.includes('read_skill_file')) return tools;
  return [...tools, 'read_skill_file'];
}

export function composeSkillRuntime(skill: AssistantSkill | null | undefined): AssistantSkillRuntime | null {
  if (!skill?.id || !skill.prompt?.trim()) return null;

  const resources = collectSkillResources(skill);
  const parts = [
    `【当前激活技能：${skill.name}】`,
    skill.description?.trim() ? `用途：${skill.description.trim()}` : '',
    skill.prompt.trim(),
    resourceIndex(skill, resources),
  ].filter(Boolean);

  let systemPrompt = parts.join('\n\n');
  if (systemPrompt.length > MAX_SKILL_RUNTIME_CHARS) {
    systemPrompt = `${systemPrompt.slice(0, MAX_SKILL_RUNTIME_CHARS).trimEnd()}\n\n…（技能主指令已截断，请按资料目录读取所需文件）`;
  }

  const allowedTools = skill.tools ? [...skill.tools] : undefined;
  if (resources.length && allowedTools && !allowedTools.includes('read_skill_file')) {
    allowedTools.push('read_skill_file');
  }

  return {
    skillId: skill.id,
    systemPrompt,
    allowedTools,
    resources,
  };
}

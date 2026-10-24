import { resolveSkillKind } from './skillPurpose';
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
  if (!key || key.length > 240 || !body || resources.some((item) => item.path === key) || resources.length >= MAX_RESOURCES) return;
  resources.push({ path: key, content: clipResource(body) });
}

/** 参考规范和附属文件只登记路径，正文留给 read_skill_file。 */
export function collectSkillResources(skill: AssistantSkill): SkillResourceFile[] {
  const resources: SkillResourceFile[] = [];
  if (skill.prompt.length > 9_000) pushResource(resources, 'SKILL.md', skill.prompt);
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

/** Long entrypoints stay readable through the file tool instead of losing their ending. */
export function skillRuntimeInstructions(skill: AssistantSkill): string {
  return skill.prompt.trim().length > 9_000
    ? '完整主指令在 SKILL.md。执行任务前必须用 read_skill_file 读取该文件，skill_id 使用当前技能 id；如有 hasMore，按 nextOffset 继续，直到读完主指令。'
    : skill.prompt.trim();
}

function resourceIndex(skill: AssistantSkill, resources: SkillResourceFile[]): string {
  if (!resources.length) return '';
  const labels = new Map((skill.references || []).map((ref) => [ref.path.trim(), ref.label?.trim() || '']));
  const lines = resources.map((resource) => {
    const label = labels.get(resource.path)?.slice(0, 80);
    return label ? `- ${resource.path}（${label}）` : `- ${resource.path}`;
  });
  return [
    '【技能资料按需读取】',
    `资料未展开。需要细则时调用 read_skill_file，skill_id 为 ${skill.id}，path 与下列目录一致。长文件按 nextOffset 继续读取；不要猜测未读内容。`,
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
    resolveSkillKind(skill) === 'creation' ? `【本次选用的创作模板：${skill.displayName || skill.name}】` : `【本次指定的 Agent 运行技能：${skill.displayName || skill.name}】`,
    resolveSkillKind(skill) === 'creation' ? '将以下内容作为当前创作的脚本与风格约束，根据用户要求替换主体和细节（若用户在提示词中给出了【强指令】修改姓名、角色、朝代服饰或提供了参考垫图，必须最高优先级严格覆盖模板中的默认设定）；它不属于全局执行规范。' : '',
    skill.description?.trim() ? `用途：${skill.description.trim()}` : '',
    skillRuntimeInstructions(skill),
    resourceIndex(skill, resources),
  ].filter(Boolean);

  let systemPrompt = parts.join('\n\n');
  if (systemPrompt.length > MAX_SKILL_RUNTIME_CHARS) {
    if (!resources.some(file => file.path === 'SKILL.md')) {
      if (resources.length >= MAX_RESOURCES) resources.pop();
      pushResource(resources, 'SKILL.md', skill.prompt);
    }
    systemPrompt = [`【本次技能：${skill.displayName || skill.name}】`,
      '完整主指令在 SKILL.md。执行前用 read_skill_file 读完，按 nextOffset 续读。', resourceIndex(skill, resources)].join('\n\n');
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

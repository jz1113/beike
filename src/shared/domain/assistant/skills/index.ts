import { collectSkillResources, composeSkillRuntime, resolveSkillReferenceContent, skillRuntimeInstructions, withSkillFileTool } from './composeSkillRuntime';
import {
  resolveSkillKind,
  SKILL_PURPOSES,
  type AssistantSkill,
  type AssistantSkillFile,
  type AssistantSkillInputRequirement,
  type AssistantSkillMeta,
  type AssistantSkillOutputFormat,
  type AssistantSkillReference,
  type AssistantSkillRuntime,
  type AssistantSkillStep,
  type ParsedSkillFile,
  type SkillCatalogEntry,
  type SkillPurpose,
  type SkillResourceFile,
} from './types';

export type {
  AssistantSkill,
  AssistantSkillFile,
  AssistantSkillInputRequirement,
  AssistantSkillMeta,
  AssistantSkillOutputFormat,
  AssistantSkillReference,
  AssistantSkillRuntime,
  AssistantSkillStep,
  ParsedSkillFile,
  SkillCatalogEntry,
  SkillPurpose,
};
export {
  ASSISTANT_SKILL_CATEGORIES,
  BUILTIN_ASSISTANT_SKILLS,
  BUILTIN_AGENT_RUNTIME_SKILLS,
  getBuiltinAssistantSkill,
  groupAssistantSkillsByCategory,
  resolveSkillAllowedTools,
  resolveSkillCategory,
} from './builtin';
export { composeSkillRuntime, collectSkillResources, resolveSkillReferenceContent, withSkillFileTool };
export { parseSkillFileContent, mergeAssistantSkills } from './parseSkillFile';
export { resolveSkillKind, SKILL_PURPOSES };
export { skillDisplayDescription } from './skillDisplay';

/** 目录最多列出的技能数。超出的技能本轮不可发现。 */
export const SKILL_CATALOG_ENTRY_LIMIT = 16;

/** 正文与资料的总字符预算。超出后只保留名称和用途。 */
export const SKILL_CATALOG_PAYLOAD_LIMIT = 120_000;

const MAX_PROMPT_CHARS = 12_000;
const MAX_DESCRIPTION_CHARS = 400;

function clip(value: string, limit: number): string {
  const text = value.trim();
  return text.length <= limit ? text : text.slice(0, limit);
}

function payloadCost(prompt: string, resources: SkillResourceFile[]): number {
  return prompt.length + resources.reduce((total, resource) => total + resource.content.length, 0);
}

/** 仅组装 Agent 运行技能目录，创作模板只在用户选用后单独注入。系统提示只使用名称和用途，正文留给 read_skill。 */
export function composeSkillCatalog(skills: AssistantSkill[]): SkillCatalogEntry[] {
  const entries: SkillCatalogEntry[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const skill of skills) {
    if (resolveSkillKind(skill) !== 'agent') continue;
    if (entries.length >= SKILL_CATALOG_ENTRY_LIMIT) break;
    const id = skill?.id?.trim() || '';
    const name = (skill?.displayName || skill?.name || '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const entry: SkillCatalogEntry = {
      id,
      name: clip(name, 200),
      description: clip(skill.description || '', MAX_DESCRIPTION_CHARS),
    };
    // Builtins are bundled with the API; discovery need not resend every file in every turn.
    if (skill.isBuiltin && skill.source?.revision) {
      entry.builtinRevision = skill.source.revision;
      entries.push(entry);
      continue;
    }
    const prompt = clip(skillRuntimeInstructions(skill), MAX_PROMPT_CHARS);
    const resources = prompt ? collectSkillResources(skill) : [];
    const tools = skill.tools?.map((tool) => tool.trim()).filter(Boolean).slice(0, 50);
    const cost = payloadCost(prompt, resources);
    if (prompt && used + cost <= SKILL_CATALOG_PAYLOAD_LIMIT) {
      entry.prompt = prompt;
      if (tools?.length) entry.tools = tools;
      if (resources.length) entry.resources = resources;
      used += cost;
    }
    entries.push(entry);
  }
  return entries;
}

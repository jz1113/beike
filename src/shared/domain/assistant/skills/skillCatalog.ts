import { collectSkillResources } from './composeSkillRuntime';
import type { AssistantSkill, SkillCatalogEntry, SkillResourceFile } from './types';

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

/** 组装本轮技能目录。系统提示只使用名称和用途，正文留给 read_skill。 */
export function composeSkillCatalog(skills: AssistantSkill[]): SkillCatalogEntry[] {
  const entries: SkillCatalogEntry[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const skill of skills) {
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
    const prompt = clip(skill.prompt || '', MAX_PROMPT_CHARS);
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

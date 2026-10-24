import packages from './compiledSkillPackages.json';
import type { AssistantSkill } from './types';

/** Generated only by skills:build; SKILL.md is the maintained instruction source. */
const byId = new Map((packages as AssistantSkill[]).map(skill => [skill.id, skill]));

export function getBuiltinPackages(ids: readonly string[]): AssistantSkill[] {
  return ids.map(id => {
    const skill = byId.get(id);
    if (!skill) throw new Error(`Missing builtin skill package: ${id}`);
    return skill;
  });
}

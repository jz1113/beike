import type { AssistantSkill } from './types';

export function skillDisplayDescription(skill: Pick<AssistantSkill, 'description' | 'displayDescription'>): string {
  return skill.displayDescription?.trim() || skill.description;
}

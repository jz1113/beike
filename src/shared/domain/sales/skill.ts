import compiled from './compiledSalesSkill.json';

export const SALES_SKILL_ID = 'fashion-video-sales' as const;
export const SALES_SKILL_REVISION = compiled.revision;
export const salesImageReferenceRoles = compiled.imageRoles;
export const salesSkillSpeechLimits = compiled.speechLimits;

export function salesSkillBinding(): { skillId: typeof SALES_SKILL_ID; skillRevision: string } {
  return { skillId: SALES_SKILL_ID, skillRevision: SALES_SKILL_REVISION };
}

/** These rules are compiled from the installed skill, shared with the Go API. */
export function salesSkillStage(stage: keyof typeof compiled.stages): string {
  return compiled.stages[stage];
}

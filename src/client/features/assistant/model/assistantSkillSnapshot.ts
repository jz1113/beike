import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { composeSkillRuntime } from '@shared/domain/assistant/skills';
import type { AssistantMessage } from '@client/store/appStoreTypes';

/** The message owns its resource snapshot; retries must not reread an edited package. */
export function snapshotAssistantSkill(skill: AssistantSkill | null): AssistantMessage['usedSkill'] {
  const runtime = composeSkillRuntime(skill);
  if (!skill || !runtime) return undefined;
  return { ...runtime, name: skill.displayName || skill.name, libraryVersion: skill.libraryVersion };
}

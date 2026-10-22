import type { AssistantSkill } from '../assistant/skills/types';

/** Execution compatibility is explicit; image/text tags are display metadata. */
export type SkillRuntime = 'assistant' | 'workshop';

export interface WorkshopSkill {
  id: string;
  name: string;
  category: string;
  promptSnippet: string;
  desc?: string | null;
  tag?: string | null;
  coverUrl?: string | null;
  sampleImages?: string | string[] | null;
  sourceUrl?: string | null;
  isFavorite?: boolean;
  isOfficial?: boolean;
  createdAt?: string;
  updatedAt?: string;
  libraryVersion?: string;
}

export type SkillLibraryEntry =
  | { kind: 'assistant'; content: AssistantSkill }
  | { kind: 'workshop'; content: WorkshopSkill };

export interface SkillLibrary {
  skills: SkillLibraryEntry[];
  hiddenOfficialRecipes: Array<{ id: string; name: string }>;
}

export function skillEntryKey(entry: SkillLibraryEntry): string {
  return `${entry.kind}:${entry.content.id}`;
}

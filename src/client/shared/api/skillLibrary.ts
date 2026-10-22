import { apiFetch } from './apiClient';
import { getWorkspaceSecret } from './workspaceClient';
import { invalidateCatalogCache } from './catalogCache';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import type { SkillLibrary, SkillLibraryEntry } from '@shared/domain/skills/library';
import { skillLibraryResponseSchema, savedSkillResponseSchema } from '@shared/contracts/skills';

const imports = new Map<string, Promise<void>>();

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || data.success !== true) throw new Error(data.error || '技能库请求失败，请重试');
  return data as T;
}

export function announceSkillLibraryChange() {
  invalidateCatalogCache('recipes');
  window.dispatchEvent(new Event('skill-library-changed'));
  window.dispatchEvent(new Event('workshop-recipes-changed'));
}

/** The legacy vault is an import source only; never overwrite or remove it. */
export async function loadSkillLibrary(legacySkills: AssistantSkill[]): Promise<SkillLibrary> {
  const workspace = getWorkspaceSecret();
  let pending = imports.get(workspace);
  if (!pending) {
    pending = (async () => {
      // Individual packages can be large. Import separately to preserve all
      // records without exceeding the API body limit; source keys are idempotent.
      for (const skill of legacySkills) {
        await readResponse(await apiFetch('/api/catalog/skills?action=import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skills: [skill] }),
        }));
      }
    })();
    imports.set(workspace, pending);
  }
  try { await pending; } catch (error) { imports.delete(workspace); throw error; }
  const result = skillLibraryResponseSchema.safeParse(await readResponse<unknown>(await apiFetch('/api/catalog/skills')));
  if (!result.success) throw new Error('技能库数据不完整，请刷新或更新后台服务后重试');
  return result.data;
}

export async function saveSkillDocument(skill: AssistantSkill, create: boolean): Promise<AssistantSkill> {
  const { libraryVersion, ...content } = skill;
  const data = savedSkillResponseSchema.parse(await readResponse<unknown>(await apiFetch('/api/catalog/skills', {
    method: create ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill: content, expectedVersion: libraryVersion }),
  })));
  return data.skill;
}

export async function deleteSkillDocument(skill: AssistantSkill): Promise<void> {
  const search = new URLSearchParams({ id: skill.id, version: skill.libraryVersion || '' });
  await readResponse(await apiFetch(`/api/catalog/skills?${search}`, { method: 'DELETE' }));
}

export async function setLibrarySkillFavorite(entry: SkillLibraryEntry, favorite: boolean): Promise<void> {
  await readResponse(await apiFetch('/api/catalog/skills?action=favorite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: entry.kind, id: entry.content.id, isFavorite: favorite }),
  }));
  announceSkillLibraryChange();
}

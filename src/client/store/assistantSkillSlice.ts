import { migrateTravelCopySkill } from './migrateTravelCopySkill';
import { StateCreator } from 'zustand';
import { announceSkillLibraryChange, loadSkillLibrary, saveSkillDocument, deleteSkillDocument } from '@client/shared/api/skillLibrary';
import { loadSkillFavorites } from '@client/shared/skills/model/skillTypes';
import type { AppState, AssistantSkillSlice } from '@client/store/types';
import type { AssistantSkill, AssistantSkillFile, AssistantSkillMeta } from '@shared/domain/assistant/skills/types';
import {
  BUILTIN_ASSISTANT_SKILLS,
  mergeAssistantSkills,
  parseSkillFileContent,
} from '@shared/domain/assistant/skills';

const SKILLS_STORAGE_KEY = 'azhuo_assistant_skills_vault';
const builtinIds = new Set(BUILTIN_ASSISTANT_SKILLS.map((skill) => skill.id));
const SKILL_GENRES = new Set(['视频', '图片', '音频', '文本']);
const MAX_SKILL_FILE_CHARS = 256 * 1024;
const MAX_SKILL_FILES_CHARS = 1024 * 1024;
const MAX_SKILL_FILES = 40;

function isSafeSkillPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  const parts = path.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..');
}

function sanitizeSkillFiles(raw: unknown): AssistantSkillFile[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const files: AssistantSkillFile[] = [];
  let total = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const path = typeof record.path === 'string' ? record.path.trim() : '';
    const content = typeof record.content === 'string' ? record.content : '';
    if (!isSafeSkillPath(path) || path.toLowerCase() === 'skill.md') continue;
    if (content.length > MAX_SKILL_FILE_CHARS || total + content.length > MAX_SKILL_FILES_CHARS) continue;
    total += content.length;
    files.push({ path, content });
    if (files.length >= MAX_SKILL_FILES) break;
  }
  return files.length > 0 ? files : undefined;
}

function sanitizeSkillMeta(raw: unknown): AssistantSkillMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const genres = Array.isArray(record.genres)
    ? record.genres.map((item) => String(item)).filter((item) => SKILL_GENRES.has(item))
    : [];
  const tags = Array.isArray(record.tags)
    ? record.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
    : [];
  const showcaseUrls = Array.isArray(record.showcaseUrls)
    ? record.showcaseUrls.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
    : [];
  const meta: AssistantSkillMeta = {
    genres,
    tags,
    defaultVideoModel: typeof record.defaultVideoModel === 'string' ? record.defaultVideoModel : '',
    defaultImageModel: typeof record.defaultImageModel === 'string' ? record.defaultImageModel : '',
    coverUrl: typeof record.coverUrl === 'string' ? record.coverUrl : '',
    showcaseUrls,
    promptGuide: typeof record.promptGuide === 'string' ? record.promptGuide.slice(0, 50) : '',
    assetGuide: typeof record.assetGuide === 'string' ? record.assetGuide.slice(0, 12) : '',
    isPublic: record.isPublic === true,
  };
  const filled = meta.genres.length > 0 || meta.tags.length > 0 || (meta.showcaseUrls?.length ?? 0) > 0
    || meta.coverUrl || meta.promptGuide || meta.assetGuide || meta.isPublic
    || meta.defaultVideoModel || meta.defaultImageModel;
  return filled ? meta : undefined;
}

function normalizeCustomSkill(skill: AssistantSkill): AssistantSkill {
  const parsed = parseSkillFileContent(JSON.stringify(skill), 'skill.json').skill;
  return {
    ...skill,
    ...parsed,
    id: builtinIds.has(parsed.id) ? `custom-${parsed.id}` : parsed.id,
    icon: typeof skill.icon === 'string' ? skill.icon : undefined,
    displayName: typeof skill.displayName === 'string' ? skill.displayName : undefined,
    author: typeof skill.author === 'string' ? skill.author : undefined,
    colorTheme: typeof skill.colorTheme === 'string' ? skill.colorTheme : undefined,
    markdownDoc: typeof skill.markdownDoc === 'string' ? skill.markdownDoc : undefined,
    version: typeof skill.version === 'string' ? skill.version : undefined,
    outputFormat: skill.outputFormat && ['markdown', 'code_blocks', 'structured_json'].includes(skill.outputFormat)
      ? skill.outputFormat : undefined,
    updatedAt: skill.updatedAt || parsed.updatedAt,
    files: sanitizeSkillFiles(skill.files),
    meta: sanitizeSkillMeta(skill.meta),
  };
}

function loadStoredSkills(): AssistantSkill[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: AssistantSkill[] = [];
    const favorites = loadSkillFavorites();
    for (const skill of parsed) {
      if (!skill || typeof skill.id !== 'string' || skill.isBuiltin
        || typeof skill.name !== 'string' || typeof skill.prompt !== 'string') continue;
      try {
        const migrated = migrateTravelCopySkill(normalizeCustomSkill({ ...skill, isFavorite: skill.isFavorite || favorites.has(skill.id) }));
        valid.push({ ...migrated, createdAt: skill.createdAt || 1, updatedAt: skill.updatedAt || skill.createdAt || 1 });
      } catch {}
    }
    return valid;
  } catch {
    return [];
  }
}

export type { AssistantSkillSlice } from '@client/store/types';

export const createAssistantSkillSlice: StateCreator<AppState, [], [], AssistantSkillSlice> = (set, get) => {
  let refreshEpoch = 0;

  return {
    assistantCustomSkills: [],
    assistantSkillsError: null,
    activeAssistantSkillId: null,
    activeAssistantSkillSnapshot: null,

    refreshAssistantSkills: async () => {
      const epoch = ++refreshEpoch;
      try {
        const library = await loadSkillLibrary(loadStoredSkills());
        if (epoch === refreshEpoch) {
          const skills = library.skills.flatMap(entry => entry.kind === 'assistant' ? [entry.content] : []);
          const activeId = get().activeAssistantSkillId;
          set({ assistantCustomSkills: skills, assistantSkillsError: null,
            activeAssistantSkillId: activeId && !skills.some(skill => skill.id === activeId) && !builtinIds.has(activeId) ? null : activeId });
        }
        return library;
      } catch (error) {
        if (epoch === refreshEpoch) set({ assistantSkillsError: error instanceof Error ? error.message : '技能库加载失败' });
        throw error;
      }
    },

    setActiveAssistantSkillId: (id) => {
      const all = mergeAssistantSkills(get().assistantCustomSkills, BUILTIN_ASSISTANT_SKILLS);
      const nextId = id && all.some((s) => s.id === id) ? id : null;
      set({ activeAssistantSkillId: nextId, activeAssistantSkillSnapshot: all.find(skill => skill.id === nextId) || null });
    },

    addAssistantSkill: async (skill) => {
      await loadSkillLibrary(loadStoredSkills());
      const now = Date.now();
      const normalized: AssistantSkill = {
        ...normalizeCustomSkill(skill),
        isBuiltin: false,
        createdAt: skill.createdAt || now,
        updatedAt: now,
      };
      const saved = await saveSkillDocument(normalized, true);
      ++refreshEpoch;
      set({ assistantCustomSkills: [saved, ...get().assistantCustomSkills.filter(s => s.id !== saved.id)] });
      announceSkillLibraryChange();
    },

    updateAssistantSkill: async (id, updates) => {
      const target = get().assistantCustomSkills.find((s) => s.id === id);
      if (!target || target.isBuiltin) return;
      const saved = await saveSkillDocument(normalizeCustomSkill({ ...target, ...updates, id, isBuiltin: false, updatedAt: Date.now() }), false);
      ++refreshEpoch;
      set({ assistantCustomSkills: get().assistantCustomSkills.map(s => s.id === id ? saved : s) });
      announceSkillLibraryChange();
    },

    deleteAssistantSkill: async (id) => {
      const target = [...get().assistantCustomSkills, ...BUILTIN_ASSISTANT_SKILLS].find((s) => s.id === id);
      if (!target || target.isBuiltin) return;
      await deleteSkillDocument(target);
      ++refreshEpoch;
      const updated = get().assistantCustomSkills.filter((s) => s.id !== id);
      const nextActive = get().activeAssistantSkillId === id ? null : get().activeAssistantSkillId;
      set({ assistantCustomSkills: updated, activeAssistantSkillId: nextActive,
        activeAssistantSkillSnapshot: nextActive ? get().activeAssistantSkillSnapshot : null });
      announceSkillLibraryChange();
    },

    getAllAssistantSkills: () =>
      mergeAssistantSkills(get().assistantCustomSkills, BUILTIN_ASSISTANT_SKILLS),

    getActiveAssistantSkill: () => {
      const activeId = get().activeAssistantSkillId;
      if (!activeId) return null;
      if (get().activeAssistantSkillSnapshot?.id === activeId) return get().activeAssistantSkillSnapshot;
      return get().getAllAssistantSkills().find((s) => s.id === activeId) || null;
    },

    importAssistantSkillFromFile: async (file: File) => {
      if (file.size > 1024 * 1024) throw new Error('技能文件过大，请使用 1 MB 以内的文本文件');
      const content = await file.text();
      const { skill } = parseSkillFileContent(content, file.name);
      const normalized = normalizeCustomSkill(skill);
      await get().addAssistantSkill(normalized);
      return normalized;
    },
  };
};

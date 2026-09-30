import { migrateTravelCopySkill } from './migrateTravelCopySkill';
import { StateCreator } from 'zustand';
import type { AppState, AssistantSkillSlice } from '@client/store/types';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import {
  BUILTIN_ASSISTANT_SKILLS,
  mergeAssistantSkills,
  parseSkillFileContent,
} from '@shared/domain/assistant/skills';

const SKILLS_STORAGE_KEY = 'azhuo_assistant_skills_vault';
const ACTIVE_SKILL_STORAGE_KEY = 'azhuo_active_assistant_skill_id';
const builtinIds = new Set(BUILTIN_ASSISTANT_SKILLS.map((skill) => skill.id));

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
    for (const skill of parsed) {
      if (!skill || typeof skill.id !== 'string' || skill.isBuiltin
        || typeof skill.name !== 'string' || typeof skill.prompt !== 'string') continue;
      try {
        valid.push(migrateTravelCopySkill(normalizeCustomSkill(skill)));
      } catch {}
    }
    return valid;
  } catch {
    return [];
  }
}

function persistSkills(customSkills: AssistantSkill[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(customSkills));
    // 技能库持久保存；待发送消息的选择不跨应用启动恢复。
    localStorage.removeItem(ACTIVE_SKILL_STORAGE_KEY);
  } catch {}
}

export type { AssistantSkillSlice } from '@client/store/types';

export const createAssistantSkillSlice: StateCreator<AppState, [], [], AssistantSkillSlice> = (set, get) => {
  const initialCustom = loadStoredSkills();
  persistSkills(initialCustom);

  return {
    assistantCustomSkills: initialCustom,
    activeAssistantSkillId: null,

    setActiveAssistantSkillId: (id) => {
      const all = mergeAssistantSkills(get().assistantCustomSkills, BUILTIN_ASSISTANT_SKILLS);
      const nextId = id && all.some((s) => s.id === id) ? id : null;
      set({ activeAssistantSkillId: nextId });
      persistSkills(get().assistantCustomSkills);
    },

    addAssistantSkill: (skill) => {
      const now = Date.now();
      const normalized: AssistantSkill = {
        ...normalizeCustomSkill(skill),
        isBuiltin: false,
        createdAt: skill.createdAt || now,
        updatedAt: now,
      };
      const updated = [
        normalized,
        ...get().assistantCustomSkills.filter((s) => s.id !== normalized.id),
      ];
      set({ assistantCustomSkills: updated, activeAssistantSkillId: normalized.id });
      persistSkills(updated);
    },

    updateAssistantSkill: (id, updates) => {
      const target = get().assistantCustomSkills.find((s) => s.id === id);
      if (!target || target.isBuiltin) return;
      const updated = get().assistantCustomSkills.map((s) =>
        s.id === id ? normalizeCustomSkill({ ...s, ...updates, id: s.id, isBuiltin: false, updatedAt: Date.now() }) : s,
      );
      set({ assistantCustomSkills: updated });
      persistSkills(updated);
    },

    deleteAssistantSkill: (id) => {
      const target = [...get().assistantCustomSkills, ...BUILTIN_ASSISTANT_SKILLS].find((s) => s.id === id);
      if (!target || target.isBuiltin) return;
      const updated = get().assistantCustomSkills.filter((s) => s.id !== id);
      const nextActive = get().activeAssistantSkillId === id ? null : get().activeAssistantSkillId;
      set({ assistantCustomSkills: updated, activeAssistantSkillId: nextActive });
      persistSkills(updated);
    },

    getAllAssistantSkills: () =>
      mergeAssistantSkills(get().assistantCustomSkills, BUILTIN_ASSISTANT_SKILLS),

    getActiveAssistantSkill: () => {
      const activeId = get().activeAssistantSkillId;
      if (!activeId) return null;
      return get().getAllAssistantSkills().find((s) => s.id === activeId) || null;
    },

    importAssistantSkillFromFile: async (file: File) => {
      if (file.size > 1024 * 1024) throw new Error('技能文件过大，请使用 1 MB 以内的文本文件');
      const content = await file.text();
      const { skill } = parseSkillFileContent(content, file.name);
      const normalized = normalizeCustomSkill(skill);
      get().addAssistantSkill(normalized);
      return normalized;
    },
  };
};

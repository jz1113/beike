import { migrateTravelCopySkill } from './migrateTravelCopySkill';
import { StateCreator } from 'zustand';
import { AppState } from '@/types/store';
import type { AssistantSkill } from '@beike/shared/assistant/skills/types';
import {
  BUILTIN_ASSISTANT_SKILLS,
  mergeAssistantSkills,
  parseSkillFileContent,
} from '@beike/shared/assistant/skills';

const SKILLS_STORAGE_KEY = 'azhuo_assistant_skills_vault';
const ACTIVE_SKILL_STORAGE_KEY = 'azhuo_active_assistant_skill_id';

function loadStoredSkills(): AssistantSkill[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === 'string' && !s.isBuiltin).map(migrateTravelCopySkill);
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

export interface AssistantSkillSlice {
  assistantCustomSkills: AssistantSkill[];
  activeAssistantSkillId: string | null;
  setActiveAssistantSkillId: (id: string | null) => void;
  addAssistantSkill: (skill: AssistantSkill) => void;
  updateAssistantSkill: (id: string, updates: Partial<AssistantSkill>) => void;
  deleteAssistantSkill: (id: string) => void;
  getAllAssistantSkills: () => AssistantSkill[];
  getActiveAssistantSkill: () => AssistantSkill | null;
  importAssistantSkillFromFile: (file: File) => Promise<AssistantSkill>;
}

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
        ...skill,
        id: skill.id || `skill-${now}`,
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
        s.id === id ? { ...s, ...updates, isBuiltin: false, updatedAt: Date.now() } : s,
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
      const content = await file.text();
      const { skill } = parseSkillFileContent(content, file.name);
      get().addAssistantSkill(skill);
      return skill;
    },
  };
};

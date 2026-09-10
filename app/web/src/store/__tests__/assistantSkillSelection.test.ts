import { beforeEach, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createAssistantSkillSlice } from '../assistantSkillSlice';
import type { AppState } from '@/types/store';

const makeStore = () => createStore<AppState>()((set, get, api) =>
  createAssistantSkillSlice(set, get, api) as AppState);

beforeEach(() => localStorage.clear());

it('保留技能库，但不恢复旧版本持续选中的技能', () => {
  localStorage.setItem('azhuo_assistant_skills_vault', JSON.stringify([
    { id: 'custom', name: '旅行文案', prompt: '生成旅行文案', isBuiltin: false },
  ]));
  localStorage.setItem('azhuo_active_assistant_skill_id', 'custom');
  const store = makeStore();
  expect(store.getState().assistantCustomSkills).toHaveLength(1);
  expect(store.getState().getActiveAssistantSkill()).toBeNull();
  expect(localStorage.getItem('azhuo_active_assistant_skill_id')).toBeNull();
  store.getState().setActiveAssistantSkillId('custom');
  expect(store.getState().getActiveAssistantSkill()?.id).toBe('custom');
  expect(makeStore().getState().getActiveAssistantSkill()).toBeNull();
});

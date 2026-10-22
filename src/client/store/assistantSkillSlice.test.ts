import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createAssistantSkillSlice } from './assistantSkillSlice';
import type { AppState } from './types';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import type { SkillLibrary } from '@shared/domain/skills/library';
import { loadSkillLibrary, saveSkillDocument, deleteSkillDocument } from '@client/shared/api/skillLibrary';

vi.mock('@client/shared/api/skillLibrary', () => ({
  loadSkillLibrary: vi.fn(), saveSkillDocument: vi.fn(), deleteSkillDocument: vi.fn(), announceSkillLibraryChange: vi.fn(),
}));

const vaultKey = 'azhuo_assistant_skills_vault';
const oldSkill: AssistantSkill = { id: 'old', name: '旧技能', description: '用途', prompt: '旧规则' };
const storedSkill: AssistantSkill = { ...oldSkill, libraryVersion: 'version-one' };
const library = (skill = storedSkill): SkillLibrary => ({ skills: [{ kind: 'assistant', content: skill }], hiddenOfficialRecipes: [] });
const store = () => createStore<AppState>()((...args) => ({ ...createAssistantSkillSlice(...args) } as AppState));
let storage: Map<string, string>;

beforeEach(() => {
  vi.resetAllMocks();
  storage = new Map([[vaultKey, JSON.stringify([oldSkill])], ['beike.skills.favorites', '{broken']]);
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.mocked(loadSkillLibrary).mockResolvedValue(library());
});
afterEach(() => vi.unstubAllGlobals());

describe('server skill library state', () => {
  it('imports the legacy source deterministically without changing its original or activating a skill', async () => {
    const state = store();
    const original = storage.get(vaultKey);
    await state.getState().refreshAssistantSkills();
    await state.getState().refreshAssistantSkills();
    const calls = vi.mocked(loadSkillLibrary).mock.calls;
    expect(calls[0][0]).toHaveLength(1);
    expect(calls[0][0]).toEqual(calls[1][0]);
    expect(storage.get(vaultKey)).toBe(original);
    expect(state.getState().assistantCustomSkills).toEqual([storedSkill]);
    expect(state.getState().activeAssistantSkillId).toBeNull();
  });

  it('keeps the current record and selection on failed writes and uses the editor version for updates', async () => {
    const state = store();
    await state.getState().refreshAssistantSkills();
    state.getState().setActiveAssistantSkillId('old');
    vi.mocked(saveSkillDocument).mockRejectedValue(new Error('版本冲突'));
    await expect(state.getState().updateAssistantSkill('old', { prompt: '待保存', libraryVersion: 'editor-version' })).rejects.toThrow('版本冲突');
    expect(vi.mocked(saveSkillDocument).mock.calls[0][0].libraryVersion).toBe('editor-version');
    expect(state.getState().assistantCustomSkills).toEqual([storedSkill]);
    expect(state.getState().activeAssistantSkillId).toBe('old');
    vi.mocked(deleteSkillDocument).mockRejectedValue(new Error('网络失败'));
    await expect(state.getState().deleteAssistantSkill('old')).rejects.toThrow('网络失败');
    expect(state.getState().assistantCustomSkills).toEqual([storedSkill]);
  });

  it('saves a new skill only after server success and leaves the current selection unchanged', async () => {
    const state = store();
    await state.getState().refreshAssistantSkills();
    state.getState().setActiveAssistantSkillId('old');
    const next = { ...storedSkill, id: 'new', name: '新技能', libraryVersion: 'new-version' };
    vi.mocked(saveSkillDocument).mockResolvedValue(next);
    await state.getState().addAssistantSkill(next);
    expect(state.getState().assistantCustomSkills[0]).toEqual(next);
    expect(state.getState().activeAssistantSkillId).toBe('old');
    expect(JSON.parse(storage.get(vaultKey)!)).toEqual([oldSkill]);
  });

  it('ignores a slow refresh that completed after a successful save', async () => {
    const state = store();
    await state.getState().refreshAssistantSkills();
    let resolve: (value: SkillLibrary) => void = () => {};
    vi.mocked(loadSkillLibrary).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const slowRefresh = state.getState().refreshAssistantSkills();
    const next = { ...storedSkill, prompt: '新规则', libraryVersion: 'version-two' };
    vi.mocked(saveSkillDocument).mockResolvedValue(next);
    await state.getState().updateAssistantSkill('old', next);
    state.getState().setActiveAssistantSkillId('old');
    vi.mocked(saveSkillDocument).mockResolvedValue({ ...next, prompt: '再次修订' });
    await state.getState().updateAssistantSkill('old', { prompt: '再次修订' });
    expect(state.getState().getActiveAssistantSkill()?.prompt).toBe('新规则');
    resolve(library());
    await slowRefresh;
    expect(state.getState().assistantCustomSkills[0].prompt).toBe('再次修订');
  });
});

import { BUILTIN_COVER_STYLES, DEFAULT_STYLE_ID } from './coverStylePresets';
import type { CoverCorrection, CoverMemoryCase, CoverStyleSkill } from './coverSkillTypes';

const STORAGE_KEY_STYLES = 'beike:headline-poster:custom-styles:v1';
const STORAGE_KEY_CASES = 'beike:headline-poster:memory-cases:v1';
const STORAGE_KEY_CORRECTIONS = 'beike:headline-poster:corrections:v1';
const STORAGE_KEY_ACTIVE_STYLE = 'beike:headline-poster:active-style:v1';

export function getAllCoverStyles(): CoverStyleSkill[] {
  if (typeof window === 'undefined') return BUILTIN_COVER_STYLES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STYLES);
    const custom: CoverStyleSkill[] = raw ? JSON.parse(raw) : [];
    return [...BUILTIN_COVER_STYLES, ...custom];
  } catch {
    return BUILTIN_COVER_STYLES;
  }
}

export function saveCustomCoverStyle(skill: CoverStyleSkill): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STYLES);
    const custom: CoverStyleSkill[] = raw ? JSON.parse(raw) : [];
    const index = custom.findIndex((s) => s.id === skill.id);
    if (index >= 0) {
      custom[index] = skill;
    } else {
      custom.unshift(skill);
    }
    localStorage.setItem(STORAGE_KEY_STYLES, JSON.stringify(custom));
  } catch (err) {
    console.error('Failed to save custom cover style', err);
  }
}

export function deleteCustomCoverStyle(skillId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STYLES);
    if (!raw) return;
    const custom: CoverStyleSkill[] = JSON.parse(raw);
    const filtered = custom.filter((s) => s.id !== skillId);
    localStorage.setItem(STORAGE_KEY_STYLES, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete custom cover style', err);
  }
}

export function getMemoryCases(): CoverMemoryCase[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CASES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMemoryCase(item: CoverMemoryCase): void {
  if (typeof window === 'undefined') return;
  try {
    const cases = getMemoryCases();
    cases.unshift(item);
    // 保留最近 100 条样张案例
    localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(cases.slice(0, 100)));
  } catch (err) {
    console.error('Failed to save memory case', err);
  }
}

export function deleteMemoryCase(caseId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cases = getMemoryCases().filter((c) => c.id !== caseId);
    localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(cases));
  } catch (err) {
    console.error('Failed to delete memory case', err);
  }
}

export function getStyleCorrections(styleId?: string): CoverCorrection[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CORRECTIONS);
    const list: CoverCorrection[] = raw ? JSON.parse(raw) : [];
    return styleId ? list.filter((c) => c.styleId === styleId) : list;
  } catch {
    return [];
  }
}

export function addStyleCorrection(correction: CoverCorrection): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getStyleCorrections();
    list.unshift(correction);
    localStorage.setItem(STORAGE_KEY_CORRECTIONS, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to add style correction', err);
  }
}

export function deleteStyleCorrection(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getStyleCorrections().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY_CORRECTIONS, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to delete style correction', err);
  }
}

export function getActiveCoverStyleId(): string {
  if (typeof window === 'undefined') return DEFAULT_STYLE_ID;
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_STYLE) || DEFAULT_STYLE_ID;
  } catch {
    return DEFAULT_STYLE_ID;
  }
}

export function setActiveCoverStyleId(styleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_STYLE, styleId);
  } catch (err) {
    console.error('Failed to set active cover style id', err);
  }
}

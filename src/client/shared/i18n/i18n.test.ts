import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUPPORTED_LOCALES,
  useI18nStore,
  translate,
  t,
  TRANSLATIONS,
  LOCALE_STORAGE_KEY,
} from './index';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  });
  useI18nStore.setState({ locale: 'zh-CN' });
});

describe('i18n language packages', () => {
  it('supports four specific locales', () => {
    const localeIds = SUPPORTED_LOCALES.map((l) => l.id);
    expect(localeIds).toEqual(['zh-CN', 'en-US', 'ja-JP', 'ko-KR']);
  });

  it('provides complete settings and common dictionary for all four languages', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dict = TRANSLATIONS[locale.id];
      expect(dict).toBeDefined();
      expect(dict.settings.title).toBeTruthy();
      expect(dict.settings.interfaceLanguage).toBeTruthy();
      expect(dict.settings.interfaceLanguageDesc).toBeTruthy();
      expect(dict.settings.unmodifiedNotice).toBeTruthy();
      expect(dict.settings.nav.language).toBeTruthy();
      expect(dict.sidebar.create).toBeTruthy();
      expect(dict.promptBar.generate).toBeTruthy();
      expect(dict.canvas.doubleClickToCreate).toBeTruthy();
      expect(dict.assets.all).toBeTruthy();
    }
  });

  it('translates nested paths correctly for different locales', () => {
    expect(translate('zh-CN', 'settings.title')).toBe('语言');
    expect(translate('en-US', 'settings.title')).toBe('Language');
    expect(translate('ja-JP', 'settings.title')).toBe('言語');
    expect(translate('ko-KR', 'settings.title')).toBe('언어');

    expect(translate('zh-CN', 'sidebar.create')).toBe('创作');
    expect(translate('en-US', 'sidebar.create')).toBe('Create');
    expect(translate('ja-JP', 'sidebar.create')).toBe('作成');
    expect(translate('ko-KR', 'sidebar.create')).toBe('창작');
  });

  it('updates store locale and persists to localStorage', () => {
    const { setLocale } = useI18nStore.getState();
    setLocale('ja-JP');

    expect(useI18nStore.getState().locale).toBe('ja-JP');
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe('ja-JP');
    expect(t('settings.title')).toBe('言語');

    setLocale('ko-KR');
    expect(useI18nStore.getState().locale).toBe('ko-KR');
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe('ko-KR');
    expect(t('settings.title')).toBe('언어');
  });

  it('falls back to zh-CN when key is missing in another locale, or returns path if unknown', () => {
    expect(translate('en-US', 'nonexistent.key')).toBe('nonexistent.key');
  });
});

import { create } from 'zustand';
import type { SupportedLocale, TranslationSchema } from './types';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';
import { jaJP } from './locales/ja-JP';
import { koKR } from './locales/ko-KR';

export const LOCALE_STORAGE_KEY = 'beike.locale';

export const TRANSLATIONS: Record<SupportedLocale, TranslationSchema> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
};

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

function readStoredLocale(): SupportedLocale {
  try {
    const storage = getStorage();
    const stored = storage?.getItem(LOCALE_STORAGE_KEY);
    if (stored && stored in TRANSLATIONS) {
      return stored as SupportedLocale;
    }
  } catch {}
  return 'zh-CN';
}

function applyDocumentLang(locale: SupportedLocale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

interface I18nState {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

export const useI18nStore = create<I18nState>((set) => {
  const initialLocale = readStoredLocale();
  applyDocumentLang(initialLocale);

  return {
    locale: initialLocale,
    setLocale: (locale: SupportedLocale) => {
      try {
        const storage = getStorage();
        storage?.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {}
      applyDocumentLang(locale);
      set({ locale });
    },
  };
});

/**
 * 递归或根据点号路径查找翻译文案
 */
export function translate(
  locale: SupportedLocale,
  path: string,
  params?: Record<string, string | number>
): string {
  const dictionary = TRANSLATIONS[locale] || TRANSLATIONS['zh-CN'];
  const keys = path.split('.');

  let current: unknown = dictionary;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      current = undefined;
      break;
    }
  }

  // 兜底退回 zh-CN
  if (typeof current !== 'string' && locale !== 'zh-CN') {
    let fallback: unknown = TRANSLATIONS['zh-CN'];
    for (const key of keys) {
      if (fallback && typeof fallback === 'object' && key in fallback) {
        fallback = (fallback as Record<string, unknown>)[key];
      } else {
        fallback = undefined;
        break;
      }
    }
    if (typeof fallback === 'string') {
      current = fallback;
    }
  }

  if (typeof current !== 'string') {
    return path;
  }

  let text = current;
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    }
  }

  return text;
}

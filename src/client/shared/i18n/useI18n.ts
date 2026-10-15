import { useCallback } from 'react';
import { useI18nStore, translate } from './i18nStore';
import { SUPPORTED_LOCALES, type SupportedLocale } from './types';

export function useI18n() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  const t = useCallback(
    (path: string, params?: Record<string, string | number>) => {
      return translate(locale, path, params);
    },
    [locale]
  );

  return {
    locale,
    setLocale,
    t,
    locales: SUPPORTED_LOCALES,
  };
}

/**
 * 非 Hook 环境下获取当前 locale
 */
export function getCurrentLocale(): SupportedLocale {
  return useI18nStore.getState().locale;
}

/**
 * 非 Hook 环境下直接翻译
 */
export function t(path: string, params?: Record<string, string | number>): string {
  return translate(getCurrentLocale(), path, params);
}

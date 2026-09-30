import { useEffect, useState } from 'react';

type OutputLanguage = '中文' | 'English' | '双语';
const isOutputLanguage = (value: unknown): value is OutputLanguage => value === '中文' || value === 'English' || value === '双语';

export function useAssistantOutputLanguage() {
  const [language, setLanguage] = useState<OutputLanguage>(() => {
    try {
      const saved = localStorage.getItem('beike_assistant_output_lang');
      if (isOutputLanguage(saved)) return saved;
    } catch { /* Storage can be unavailable in restricted browser sessions. */ }
    return '中文';
  });
  useEffect(() => {
    const onChange = (event: Event) => {
      const value = (event as CustomEvent<{ lang?: unknown }>).detail?.lang;
      if (isOutputLanguage(value)) setLanguage(value);
    };
    window.addEventListener('assistant_lang_changed', onChange);
    return () => window.removeEventListener('assistant_lang_changed', onChange);
  }, []);
  return language;
}

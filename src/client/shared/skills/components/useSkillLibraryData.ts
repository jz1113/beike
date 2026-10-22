import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@client/store';
import type { SkillLibrary } from '@shared/domain/skills/library';

export function useSkillLibraryData() {
  const [library, setLibrary] = useState<SkillLibrary>({ skills: [], hiddenOfficialRecipes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const invalidate = useCallback(() => { ++epoch.current; }, []);
  const reload = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true);
    try {
      const data = await useAppStore.getState().refreshAssistantSkills();
      if (epoch.current === request) { setLibrary(data); setError(''); }
    } catch (error) {
      if (epoch.current === request) setError(error instanceof Error ? error.message : '技能库加载失败');
    } finally { if (epoch.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    void reload();
    const changed = () => { void reload(); };
    window.addEventListener('skill-library-changed', changed);
    return () => { invalidate(); window.removeEventListener('skill-library-changed', changed); };
  }, [reload, invalidate]);
  return { library, loading, error, reload };
}

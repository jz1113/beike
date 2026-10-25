import { useEffect, useRef, useState } from 'react';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

export type ConfigSaveState = 'idle' | 'saving' | 'saved' | 'error';

export function useConfigSaveState<T extends object>(
  active: boolean,
  showToast: (message: string) => void,
  onSaved: (snapshot: Partial<T>) => void,
) {
  const [states, setStates] = useState<Record<string, ConfigSaveState>>({});
  const versions = useRef<Record<string, number>>({});
  const session = useRef(0);
  useEffect(() => {
    session.current += 1;
    setStates({});
    return () => { session.current += 1; };
  }, [active]);
  const save = async (
    service: string,
    snapshot: Partial<T>,
    operation: () => Promise<void>,
    message: string,
    notify = true,
  ): Promise<boolean> => {
    if (!active) return false;
    const currentSession = session.current;
    const version = versions.current[service] = (versions.current[service] || 0) + 1;
    setStates(previous => ({ ...previous, [service]: 'saving' }));
    try {
      await operation();
      if (currentSession !== session.current) return false;
      onSaved(snapshot);
      if (version !== versions.current[service]) return false;
      setStates(previous => ({ ...previous, [service]: 'saved' }));
      if (notify) showToast(message);
      return true;
    } catch (error) {
      if (currentSession !== session.current || version !== versions.current[service]) return false;
      setStates(previous => ({ ...previous, [service]: 'error' }));
      showToast(formatUserError(error, '配置保存失败，请重试'));
      return false;
    }
  };
  return { save, states, isSaving: Object.values(states).some(state => state === 'saving') };
}

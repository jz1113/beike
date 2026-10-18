import { useEffect } from 'react';
import { useAvatarStore } from '../store/useAvatarStore';

/** Poll in-flight avatar tasks one at a time, and ignore responses from an older request. */
export function useAvatarTaskPolling() {
  const activeKey = useAvatarStore((state) =>
    state.tasks.filter((task) => task.status === 0).map((task) => task.id).sort().join('\n'),
  );
  const pollActiveTask = useAvatarStore((state) => state.pollActiveTask);

  useEffect(() => {
    const ids = activeKey ? activeKey.split('\n') : [];
    if (ids.length === 0) return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      for (const id of ids) {
        if (stopped) return;
        await pollActiveTask(id);
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), 1500);
    };
    timer = window.setTimeout(() => void tick(), 1500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [activeKey, pollActiveTask]);
}

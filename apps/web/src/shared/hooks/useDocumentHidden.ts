import { useEffect, useState } from 'react';

/** 窗口是否处于后台（桌面端切换应用或最小化时减少轮询） */
export function useDocumentHidden() {
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' ? document.hidden : false,
  );

  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return hidden;
}

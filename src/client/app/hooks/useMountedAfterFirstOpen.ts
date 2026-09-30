import { useEffect, useState } from 'react';

/** 首次打开前延后加载；打开后保持挂载，保留后台处理和编辑状态。 */
export function useMountedAfterFirstOpen(isOpen: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);
  return isOpen || hasOpened;
}

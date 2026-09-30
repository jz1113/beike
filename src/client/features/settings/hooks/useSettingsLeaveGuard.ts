import { useCallback, useEffect } from 'react';
import { confirmAction } from '@client/shared/utils/confirmAction';

export function useSettingsLeaveGuard(dirty: boolean, leave: () => void, busy: boolean, showToast: (message: string) => void) {
  const requestLeave = useCallback((navigate: () => void) => {
    if (busy) { showToast('配置保存或存储迁移正在进行，请等待当前操作完成后再离开'); return; }
    if (!dirty) { navigate(); return; }
    void confirmAction('服务配置有未保存的更改。确定放弃更改并离开设置吗？').then((confirmed) => {
      if (confirmed) navigate();
    });
  }, [dirty, busy, showToast]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const handleNavigation = (event: Event) => {
      event.preventDefault();
      requestLeave((event as CustomEvent<{ navigate: () => void }>).detail.navigate);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('app:before-navigate', handleNavigation);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('app:before-navigate', handleNavigation);
    };
  }, [dirty, busy, requestLeave]);
  return useCallback(() => requestLeave(leave), [requestLeave, leave]);
}

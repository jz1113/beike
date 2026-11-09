import { useEffect } from 'react';
import { useAppStore } from '@client/store';

function navigateWithSettingsGuard(navigate: () => void) {
  const event = new CustomEvent('app:before-navigate', { cancelable: true, detail: { navigate } });
  if (window.dispatchEvent(event)) navigate();
}

interface ShortcutHandlers {
  onOpenSettings?: () => void;
}

/**
 * 桌面原生级全局快捷键监听钩子
 * - Cmd/Ctrl + 1/2/3/4: 快速切换四大核心工作区 (首页/生成/电商图文/资产)
 * - Cmd/Ctrl + ,: 快速打开系统设置
 * - Cmd/Ctrl + Enter: 全局广播即刻生图/生成指令
 */
export function useDesktopShortcuts({ onOpenSettings }: ShortcutHandlers = {}) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      if (!isMetaOrCtrl) return;

      // 1. 视图秒切：Cmd/Ctrl + 1 ~ 4
      if (e.key === '1') {
        e.preventDefault();
        navigateWithSettingsGuard(() => setCurrentView('home'));
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        navigateWithSettingsGuard(() => setCurrentView('generate'));
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        navigateWithSettingsGuard(() => setCurrentView('workshop'));
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        navigateWithSettingsGuard(() => setCurrentView('assets'));
        return;
      }

      // 2. 系统设置：Cmd/Ctrl + ,
      if (e.key === ',' || e.key === '，') {
        e.preventDefault();
        onOpenSettings?.();
        return;
      }

      if (useAppStore.getState().currentView === 'settings') return;

      // 3. 即刻生成：Cmd/Ctrl + Enter
      if (e.key === 'Enter') {
        window.dispatchEvent(new CustomEvent('app:trigger-generate'));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCurrentView, onOpenSettings]);
}

import { useEffect } from 'react';
import { useAppStore } from '@/store';

interface ShortcutHandlers {
  onOpenSettings?: () => void;
  onNewSession?: () => void;
}

/**
 * 桌面原生级全局快捷键监听钩子
 * - Cmd/Ctrl + 1/2/3/4: 快速切换四大核心工作区 (首页/生成/工坊/资产)
 * - Cmd/Ctrl + ,: 快速打开系统设置
 * - Cmd/Ctrl + N: 快速创建新对话会话
 * - Cmd/Ctrl + Enter: 全局广播即刻生图/生成指令
 */
export function useDesktopShortcuts({ onOpenSettings, onNewSession }: ShortcutHandlers = {}) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      if (!isMetaOrCtrl) return;

      // 1. 视图秒切：Cmd/Ctrl + 1 ~ 4
      if (e.key === '1') {
        e.preventDefault();
        setCurrentView('home');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setCurrentView('generate');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        const store = useAppStore.getState();
        store.setWorkshopMode('storyboard_generate');
        store.setActiveWorkshopTab('studio');
        setCurrentView('workshop');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        setCurrentView('assets');
        return;
      }

      // 2. 系统设置：Cmd/Ctrl + ,
      if (e.key === ',' || e.key === '，') {
        e.preventDefault();
        onOpenSettings?.();
        return;
      }

      // 3. 新建对话：Cmd/Ctrl + N
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNewSession?.();
        window.dispatchEvent(new CustomEvent('app:new-session'));
        return;
      }

      // 4. 即刻生成：Cmd/Ctrl + Enter
      if (e.key === 'Enter') {
        window.dispatchEvent(new CustomEvent('app:trigger-generate'));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCurrentView, onOpenSettings, onNewSession]);
}

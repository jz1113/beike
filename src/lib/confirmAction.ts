import { isTauriDesktop } from '@/lib/desktopRuntime';

const DEFAULT_TITLE = '贝壳云图';

/** 跨平台确认对话框：桌面端走 Tauri 原生 dialog，Web 端走 window.confirm */
export async function confirmAction(
  message: string,
  title: string = DEFAULT_TITLE,
): Promise<boolean> {
  if (isTauriDesktop()) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      return await confirm(message, {
        title,
        kind: 'warning',
        okLabel: '确定',
        cancelLabel: '取消',
      });
    } catch {
      /* fallback */
    }
  }
  return window.confirm(message);
}

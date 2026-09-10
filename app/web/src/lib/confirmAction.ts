import { confirm } from '@tauri-apps/plugin-dialog';

const DEFAULT_TITLE = '贝壳云图';

/** 桌面原生确认对话框 */
export async function confirmAction(
  message: string,
  title: string = DEFAULT_TITLE,
): Promise<boolean> {
  try {
    return await confirm(message, {
      title,
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    });
  } catch (err) {
    console.warn('[confirmAction] Tauri dialog confirm failed, falling back to window.confirm:', err);
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return window.confirm(message);
    }
    return false;
  }
}

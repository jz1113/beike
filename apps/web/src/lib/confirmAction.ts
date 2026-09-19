const DEFAULT_TITLE = '贝壳云图';

/** 浏览器确认对话框 */
export async function confirmAction(
  message: string,
  title: string = DEFAULT_TITLE,
): Promise<boolean> {
  void title;
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(message);
  }
  return false;
}

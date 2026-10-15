export interface ConfirmActionOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export type ConfirmHandler = (options: ConfirmActionOptions) => Promise<boolean>;

let activeHandler: ConfirmHandler | null = null;

export function registerConfirmHandler(handler: ConfirmHandler | null): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) {
      activeHandler = null;
    }
  };
}

const DEFAULT_TITLE = '确认操作';

/**
 * 现代居中确认对话框（替代原生 window.confirm 顶端弹窗）
 */
export async function confirmAction(
  messageOrOptions: string | ConfirmActionOptions,
  legacyTitle: string = DEFAULT_TITLE,
): Promise<boolean> {
  let options: ConfirmActionOptions;

  if (typeof messageOrOptions === 'string') {
    const isDelete = messageOrOptions.includes('删除') || messageOrOptions.includes('清空');
    options = {
      title:
        legacyTitle && legacyTitle !== '贝壳云图' && legacyTitle !== DEFAULT_TITLE
          ? legacyTitle
          : isDelete
          ? '确认删除'
          : DEFAULT_TITLE,
      description: messageOrOptions,
      confirmText: isDelete ? '删除' : '确定',
      cancelText: '取消',
    };
  } else {
    const isDelete =
      messageOrOptions.confirmText === '删除' || messageOrOptions.title?.includes('删除');
    options = {
      confirmText: isDelete ? '删除' : '确定',
      cancelText: '取消',
      ...messageOrOptions,
    };
  }

  if (activeHandler) {
    return activeHandler(options);
  }

  // 兜底降级（无 UI host 挂载时）
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(options.description || options.title || '');
  }
  return false;
}

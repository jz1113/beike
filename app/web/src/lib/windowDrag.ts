import { isTauriDesktop } from './desktopRuntime';

let cachedWindow: any = null;

async function getAppWindow() {
  if (!isTauriDesktop()) return null;
  if (cachedWindow) return cachedWindow;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    cachedWindow = getCurrentWindow();
    return cachedWindow;
  } catch (err) {
    console.warn('[windowDrag] failed to load @tauri-apps/api/window:', err);
    return null;
  }
}

/** 检查事件目标是否属于交互元素（按钮、输入框、链接等） */
function isInteractiveElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const interactiveSelector = 'button, input, textarea, select, a, [role="button"], [data-no-drag], .no-drag';
  return Boolean(target.closest(interactiveSelector));
}

/** 触发原生窗口拖拽（若在非交互元素上按下鼠标左键） */
export function handleWindowDrag(e: React.MouseEvent) {
  if (e.button !== 0) return; // 仅左键
  if (isInteractiveElement(e.target)) return;

  if (!isTauriDesktop()) return;

  void getAppWindow().then((win) => {
    if (win && typeof win.startDragging === 'function') {
      void win.startDragging().catch((err: any) => {
        // 部分平台原生事件已处理，此处忽略已在拖拽中的异常
        if (!String(err).includes('already')) {
          console.debug('[windowDrag] startDragging:', err);
        }
      });
    }
  });
}

/** 双击标题栏/拖拽区域切换最大化与还原 */
export function handleWindowDoubleClick(e: React.MouseEvent) {
  if (e.button !== 0) return;
  if (isInteractiveElement(e.target)) return;

  if (!isTauriDesktop()) return;

  void getAppWindow().then((win) => {
    if (win && typeof win.toggleMaximize === 'function') {
      void win.toggleMaximize().catch((err: any) => {
        console.debug('[windowDrag] toggleMaximize:', err);
      });
    }
  });
}

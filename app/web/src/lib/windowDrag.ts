/** 检查事件目标是否属于交互元素（按钮、输入框、链接等，含内部 SVG 图标与文本） */
export function isInteractiveElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target instanceof Element ? target : (target as Node).parentElement;
  if (!el || !(el instanceof Element)) return false;
  const interactiveSelector =
    'button, input, textarea, select, a, [role="button"], [data-no-drag], .no-drag, [data-tauri-drag-region="false"]';
  return Boolean(el.closest(interactiveSelector));
}

/** 浏览器模式下无原生窗口可拖，保留调用点以免改动布局组件 */
export function handleWindowDrag(e: React.MouseEvent) { void e; }

/** 浏览器模式下无原生窗口可最大化 */
export function handleWindowDoubleClick(e: React.MouseEvent) { void e; }

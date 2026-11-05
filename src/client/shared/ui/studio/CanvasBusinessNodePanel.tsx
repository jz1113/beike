import './canvasBusinessNodePanel.css';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Render business controls inside the native node without exposing app CSS to the editor. */
export function CanvasBusinessNodePanel({ nodeId, children, label, maxHeight = 680 }: { nodeId?: string; children: ReactNode; label: string; maxHeight?: number }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!nodeId) return;
    let boundFrame: HTMLIFrameElement | undefined;
    let host: HTMLDivElement | undefined;
    let frameObserver: MutationObserver | undefined;
    let sizeObserver: ResizeObserver | undefined;
    let styleObserver: MutationObserver | undefined;
    let currentDocument: Document | undefined;
    let scheduled = false, disposed = false;
    const attach = () => {
      scheduled = false;
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="贝壳云图项目画布"]');
      if (frame && frame !== boundFrame) { boundFrame?.removeEventListener('load', queue); boundFrame = frame; boundFrame.addEventListener('load', queue); }
      const doc = frame?.contentDocument;
      if (!doc?.body) { if (frame) frame.dataset.businessPanelState = 'waiting-document'; return; }
      if (doc !== currentDocument) {
        frameObserver?.disconnect(); currentDocument = doc;
        frameObserver = new MutationObserver(queue);
        frameObserver.observe(doc.body, { childList: true, subtree: true });
      }
      const node = doc.querySelector<HTMLElement>(`.node-wrapper[data-node-id="${CSS.escape(nodeId)}"]`);
      if (!node) { if (frame) frame.dataset.businessPanelState = 'waiting-node'; host?.remove(); return; }
      if (!host || host.ownerDocument !== doc) {
        host?.remove(); styleObserver?.disconnect(); sizeObserver?.disconnect();
        host = doc.createElement('div'); host.className = 'beike-business-inline'; host.dataset.chatCopyZone = 'true'; host.contentEditable = 'true'; host.setAttribute('role', 'group'); host.setAttribute('aria-label', '业务节点操作区域');
        const shadow = host.attachShadow({ mode: 'open' });
        const styles = doc.createElement('div');
        const content = doc.createElement('div'); content.className = 'dark beike-inline-controls'; content.contentEditable = 'false';
        const syncStyles = () => {
          styles.replaceChildren(...Array.from(document.head.querySelectorAll('style,link[rel="stylesheet"]')).map(source => {
            const clone = source.cloneNode(true) as HTMLElement;
            if (source instanceof HTMLLinkElement) clone.setAttribute('href', source.href);
            return clone;
          }));
        };
        syncStyles();
        styleObserver = new MutationObserver(syncStyles);
        styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
        const reset = doc.createElement('style');
        reset.textContent = ':host{display:block;color:#e7e5e4;font:14px/1.5 system-ui;user-select:text} .beike-inline-controls{min-height:0;padding:6px 4px;background:transparent;color:#e7e5e4;color-scheme:dark} button,input,textarea,select{font:inherit} [hidden]{display:none!important}';
        shadow.append(styles, reset, content);
        let measured = 0;
        sizeObserver = new ResizeObserver(() => {
          if (!host?.isConnected || !content.getClientRects().length || !content.getBoundingClientRect().width) return;
          const height = Math.min(maxHeight, Math.max(180, Math.ceil(content.scrollHeight + 28)));
          if (Math.abs(height - measured) < 4 || !host?.isConnected) return;
          measured = height;
          boundFrame?.contentWindow?.postMessage({ kind: 'studio:business-size', nodeId, height }, location.origin);
        });
        sizeObserver.observe(content);
        for (const event of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown', 'wheel']) host.addEventListener(event, ev => ev.stopPropagation());
        setRoot(content);
      }
      if (host.parentElement !== node) node.append(host);
      if (frame) frame.dataset.businessPanelState = 'ready';
    };
    const queue = () => { if (!scheduled && !disposed) { scheduled = true; queueMicrotask(() => { if (!disposed) attach(); }); } };
    const observer = new MutationObserver(queue);
    observer.observe(document.body, { childList: true, subtree: true });
    const message = (event: MessageEvent) => { if (event.origin === location.origin && event.source === boundFrame?.contentWindow) queue(); };
    window.addEventListener('message', message); attach();
    return () => { disposed = true; observer.disconnect(); frameObserver?.disconnect(); styleObserver?.disconnect(); sizeObserver?.disconnect(); window.removeEventListener('message', message); boundFrame?.removeEventListener('load', queue); host?.remove(); };
  }, [nodeId, maxHeight]);
  return root ? createPortal(<section aria-label={label}>{children}</section>, root) : null;
}

export function focusCanvasBusinessNode(nodeId?: string) {
  if (!nodeId) return;
  document.querySelector<HTMLIFrameElement>('iframe[title="贝壳云图项目画布"]')?.contentWindow?.postMessage({ kind: 'studio:business-focus', nodeId }, location.origin);
}

import { useEffect, useRef } from 'react';

const activeDialogs: HTMLElement[] = [];
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside the topmost dialog, and return it to its trigger on close. */
export function useModalDialog(isOpen: boolean, onClose?: () => void, options: { trapFocus?: boolean; initialFocusSelector?: string; escapeCapture?: boolean } = {}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { trapFocus = true, initialFocusSelector, escapeCapture = true } = options;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(element => element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'));
    activeDialogs.push(dialog);
    (initialFocusSelector ? dialog.querySelector<HTMLElement>(initialFocusSelector) : null)?.focus();
    if (!dialog.contains(document.activeElement)) (focusable()[0] || dialog).focus();
    const isTopDialog = (event: KeyboardEvent) =>
      activeDialogs[activeDialogs.length - 1] === dialog && !event.isComposing && !document.querySelector('dialog[open]');
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopDialog(event) || !closeRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRef.current();
    };
    const onTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && trapFocus && isTopDialog(event)) {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !dialog.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last || dialog : first || dialog).focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onTab, true);
    document.addEventListener('keydown', onEscape, escapeCapture);
    return () => {
      const index = activeDialogs.indexOf(dialog);
      if (index >= 0) activeDialogs.splice(index, 1);
      document.removeEventListener('keydown', onTab, true);
      document.removeEventListener('keydown', onEscape, escapeCapture);
      if (dialog.contains(document.activeElement) || document.activeElement === document.body) {
        if (previousFocus?.isConnected && previousFocus !== document.body && !previousFocus.closest('[aria-hidden="true"]')) {
          previousFocus.focus();
        } else if (!activeDialogs.length) {
          document.querySelector<HTMLButtonElement>('[data-testid="ai-assistant-button"]')?.focus();
        }
      }
    };
  }, [isOpen, trapFocus, initialFocusSelector, escapeCapture]);

  return dialogRef;
}

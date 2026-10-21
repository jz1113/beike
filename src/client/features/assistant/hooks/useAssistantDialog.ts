import { useEffect, useRef } from 'react';

const activeDialogs: HTMLElement[] = [];
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside the topmost assistant dialog, and return it to its trigger on close. */
export function useAssistantDialog(isOpen: boolean, onClose?: () => void, options: { trapFocus?: boolean; initialFocusSelector?: string } = {}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { trapFocus = true, initialFocusSelector } = options;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(element => element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'));
    activeDialogs.push(dialog);
    (initialFocusSelector ? dialog.querySelector<HTMLElement>(initialFocusSelector) : null)?.focus();
    if (!dialog.contains(document.activeElement)) (focusable()[0] || dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeDialogs[activeDialogs.length - 1] !== dialog || event.isComposing) return;
      // Native modal dialogs occupy the browser's top layer and own their keyboard handling.
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === 'Tab' && trapFocus) {
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
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      const index = activeDialogs.indexOf(dialog);
      if (index >= 0) activeDialogs.splice(index, 1);
      document.removeEventListener('keydown', onKeyDown, true);
      if (dialog.contains(document.activeElement) || document.activeElement === document.body) {
        if (previousFocus?.isConnected && previousFocus !== document.body && !previousFocus.closest('[aria-hidden="true"]')) {
          previousFocus.focus();
        } else if (!activeDialogs.length) {
          document.querySelector<HTMLButtonElement>('[data-testid="ai-assistant-button"]')?.focus();
        }
      }
    };
  }, [isOpen, trapFocus, initialFocusSelector]);

  return dialogRef;
}

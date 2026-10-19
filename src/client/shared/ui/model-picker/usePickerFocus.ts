import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside an open picker surface. */
export function usePickerFocus(isOpen: boolean, onClose?: () => void, initialFocusSelector?: string) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(element => element.getClientRects().length > 0);
    dialog.querySelector<HTMLElement>(initialFocusSelector || '')?.focus();
    if (!dialog.contains(document.activeElement)) (focusable()[0] || dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
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
      document.removeEventListener('keydown', onKeyDown, true);
      if (dialog.contains(document.activeElement) && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, initialFocusSelector]);

  return dialogRef;
}

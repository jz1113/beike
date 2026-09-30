import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])';

export function usePromptRulesDialogFocus(dialogRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialog));
    const inertBefore = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    (dialog.querySelector<HTMLElement>('[data-autofocus]') || dialog).focus();
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.getClientRects().length && !element.closest('[inert]'));
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      siblings.forEach((element, index) => { element.inert = inertBefore[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dialogRef]);
}

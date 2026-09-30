import { useEffect, useRef } from 'react';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';

const FOCUSABLE_SELECTOR = 'button, [href], input:not([type="hidden"]), select, textarea, summary, [tabindex]';
const activeDialogs: HTMLElement[] = [];
let previousBodyOverflow = '';

function isAvailable(element: HTMLElement) {
  return !element.matches(':disabled')
    && !element.closest('[inert]')
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden';
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0 && isAvailable(element));
}

export function useKeywordReviewDialog(open: boolean, onClose: () => void, closeOnEscape = true) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const triggerRef = useRef<HTMLElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const visible = useViewVisibility();

  useEffect(() => {
    closeRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [onClose, closeOnEscape]);

  useEffect(() => {
    if (!open) { triggerRef.current = null; lastFocusRef.current = null; return; }
    if (!visible || !dialogRef.current) return;
    const dialog = dialogRef.current;
    if (!triggerRef.current || !triggerRef.current.isConnected) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    const trigger = triggerRef.current;
    activeDialogs.push(dialog);
    if (activeDialogs.length === 1) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const isTopDialog = () => activeDialogs.at(-1) === dialog && isAvailable(dialog);
    const focusStart = () => {
      const preferred = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]');
      const target = preferred && isAvailable(preferred) ? preferred : getFocusableElements(dialog)[0] ?? dialog;
      target.focus({ preventScroll: true });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog() || event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (closeOnEscapeRef.current) closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = getFocusableElements(dialog);
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (!elements.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isTopDialog() || !(event.target instanceof HTMLElement)) return;
      if (dialog.contains(event.target)) lastFocusRef.current = event.target;
      else focusStart();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    if (lastFocusRef.current && dialog.contains(lastFocusRef.current) && isAvailable(lastFocusRef.current)) {
      lastFocusRef.current.focus({ preventScroll: true });
    } else focusStart();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      const index = activeDialogs.indexOf(dialog);
      if (index !== -1) activeDialogs.splice(index, 1);
      if (activeDialogs.length === 0) document.body.style.overflow = previousBodyOverflow;
      const remainingDialog = activeDialogs.at(-1);
      if (trigger?.isConnected && isAvailable(trigger) && (!remainingDialog || remainingDialog.contains(trigger))) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [open, visible]);

  return dialogRef;
}

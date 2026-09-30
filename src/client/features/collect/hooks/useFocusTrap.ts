import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Only the top modal handles a keyboard event. Nested previews must not close their parent.
const activeTraps: symbol[] = [];

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  isActive: boolean,
  onEscape?: () => void
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  const getFocusable = useCallback((): HTMLElement[] => {
    const root = containerRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el =>
      !el.closest('[aria-hidden="true"], [inert], [hidden]') && el.getClientRects().length > 0
    );
  }, [containerRef]);

  useEffect(() => {
    if (!isActive) return;
    const root = containerRef.current;
    if (!root) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const token = Symbol('modal-focus-trap');
    activeTraps.push(token);
    const isTopTrap = () => activeTraps[activeTraps.length - 1] === token;
    const focusFirst = () => (getFocusable()[0] || root).focus();
    const initialFocusTimer = setTimeout(() => {
      if (isTopTrap()) focusFirst();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopTrap() || event.defaultPrevented) return;
      if (event.key === 'Escape' && escapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusable();
      if (focusables.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if ((event.shiftKey && active === first) || (!event.shiftKey && active === last) || !root.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isTopTrap() && event.target instanceof Node && !root.contains(event.target)) focusFirst();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      clearTimeout(initialFocusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      const wasTopTrap = isTopTrap();
      const index = activeTraps.indexOf(token);
      if (index >= 0) activeTraps.splice(index, 1);
      const restoreFocus = () => {
        if (previousFocus?.isConnected && previousFocus.getClientRects().length > 0) previousFocus.focus();
      };
      if (wasTopTrap) restoreFocus();
      else {
        // Closing the entire collector can dispose the parent before its nested dialogs.
        setTimeout(() => { if (activeTraps.length === 0) restoreFocus(); }, 0);
      }
    };
  }, [isActive, containerRef, getFocusable]);
}

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';

interface Props {
  label: string;
  className: string;
  backdropClassName: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
}

export function PosterDialogFrame({ label, className, backdropClassName, onClose, closeDisabled = false, children }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const visible = useViewVisibility();

  useLayoutEffect(() => {
    if (!visible) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={backdropClassName} onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`${className} outline-none`} onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (!closeDisabled) onClose();
        } else if (event.key === 'Tab') {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'))
            .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && element.getAttribute('aria-disabled') !== 'true');
          const first = controls[0];
          const last = controls[controls.length - 1];
          const active = document.activeElement;
          if (!first) event.preventDefault();
          else if (active === event.currentTarget || event.shiftKey && active === first || !event.shiftKey && active === last) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }
      }}>
        {children}
      </section>
    </div>
  );
}

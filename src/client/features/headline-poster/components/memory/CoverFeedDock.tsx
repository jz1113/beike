import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  children: ReactNode;
}

export function CoverFeedDock({ open, children }: Props) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 p-4">
      <div className="pointer-events-auto absolute bottom-4 right-4 max-h-[min(560px,calc(100%-32px))] w-[min(380px,calc(100%-32px))] overflow-y-auto overscroll-contain rounded-3xl">
        {children}
      </div>
    </div>,
    document.body,
  );
}

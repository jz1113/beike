import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export function SalesCardMenu({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const doc = menu.ownerDocument;
    const dismissOutside = (event: PointerEvent) => {
      if (!event.composedPath().includes(menu)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menu.open) return;
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      menu.querySelector('summary')?.focus();
    };
    doc.addEventListener('pointerdown', dismissOutside, true);
    doc.addEventListener('keydown', escape, true);
    return () => {
      doc.removeEventListener('pointerdown', dismissOutside, true);
      doc.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  return <details ref={menuRef} className="sales-script-card-menu" name="sales-asset-card-actions"
    onToggle={(event) => setOpen(event.currentTarget.open)}
    onPointerLeave={(event) => { if (event.pointerType === 'mouse') event.currentTarget.open = false; }}
    onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
    <summary aria-label={label} title={title}><MoreHorizontal size={16} aria-hidden /></summary>
    <div className="sales-script-card-menu-panel" onClickCapture={() => {
      const menu = menuRef.current;
      if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
    }}>{children}</div>
  </details>;
}

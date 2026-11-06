import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  names: string[];
  count: number;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BatchHistoryDeleteDialog({ title, names, count, busy, error, onCancel, onConfirm }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { (busy ? panelRef.current : cancelRef.current)?.focus(); }, [busy]);

  return <div className="history-overlay batch-name-overlay">
    <section ref={panelRef} tabIndex={-1} className="batch-history batch-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="batch-delete-title" aria-describedby="batch-delete-description batch-delete-names" aria-busy={busy} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
        const first = buttons[0], last = buttons.at(-1);
        if (!buttons.length) event.preventDefault();
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="batch-delete-body">
        <h2 id="batch-delete-title">{title}</h2>
        <p id="batch-delete-description">删除后无法恢复。当前批次和已保存的图片文件会保留。</p>
        <p id="batch-delete-names" className="history-delete-names">{names.slice(0, 3).join('、')}{count > 3 ? ` 等 ${count} 个批次` : ''}</p>
        {error && <p role="alert" className="history-action-error">{error}</p>}
      </div>
      <footer className="batch-name-footer">
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="history-secondary-button">取消</button>
        <button type="button" disabled={busy} onClick={onConfirm} className="history-danger-button">{busy ? '正在删除…' : '确认删除'}</button>
      </footer>
    </section>
  </div>;
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { registerConfirmHandler, type ConfirmActionOptions } from '@client/shared/utils/confirmAction';

interface PendingConfirm extends ConfirmActionOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const unregister = registerConfirmHandler((options) => {
      return new Promise<boolean>((resolve) => {
        pendingRef.current?.resolve(false);
        const next = { ...options, resolve };
        pendingRef.current = next;
        setPending(next);
      });
    });
    return () => {
      unregister();
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, []);

  const handleClose = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    dialogRef.current?.close();
    setPending(null);
    current.resolve(value);
  }, []);

  // Native modal dialogs share the top layer with their callers and own focus/keyboard handling.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!pending || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const destructive = pending.danger || pending.confirmText === '删除' || pending.title?.includes('删除');
    (destructive ? cancelBtnRef : confirmBtnRef).current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [pending]);

  if (!pending || typeof document === 'undefined') return null;

  const isDelete = pending.confirmText === '删除' || pending.title?.includes('删除');
  const title = pending.title || (isDelete ? '确认删除' : '确认操作');
  const description = pending.description || '';
  const confirmText = pending.confirmText || (isDelete ? '删除' : '确定');
  const cancelText = pending.cancelText || '取消';

  return createPortal(
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-[440px] max-h-[calc(100dvh_-_2rem)] overflow-y-auto border-0 bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-xs"
      aria-modal="true"
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); handleClose(false); }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => { if (event.target === event.currentTarget) handleClose(false); }}
    >
      <div
        className="relative w-full max-w-[440px] rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1B1B1E] text-slate-900 dark:text-white p-6 shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 右上角关闭叉号 */}
        <button
          type="button"
          aria-label="取消"
          onClick={() => handleClose(false)}
          className="absolute right-5 top-5 rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 标题 */}
        <h3 className="pr-8 text-[16px] font-semibold text-slate-900 dark:text-white">{title}</h3>

        {/* 描述文案 */}
        {description && (
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500 dark:text-[#8E8E93]">{description}</p>
        )}

        {/* 底部按钮组 */}
        <div className="mt-7 flex justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={() => handleClose(false)}
            className="rounded-xl bg-[#F2F3F5] dark:bg-white/10 px-5 py-2 text-[13px] font-medium text-slate-800 dark:text-[#EDEDED] hover:bg-[#E5E6EB] dark:hover:bg-white/15 transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => handleClose(true)}
            className="rounded-xl bg-slate-900 hover:bg-black text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:text-white px-5 py-2 text-[13px] font-medium transition-colors cursor-pointer shadow-xs active:scale-[0.98] dark:shadow-[0_0_14px_rgba(99,102,241,0.25)]"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </dialog>,
    document.body
  );
}

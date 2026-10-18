import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings2, Check } from 'lucide-react';
import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';
import { WorkshopContentSettings, WorkshopOutputSettings, WorkshopExecutionSettings } from './WorkshopSettingsSections';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';

export type { WorkshopSettingsModalProps } from './workshopSettingsTypes';

export function WorkshopSettingsModal(props: WorkshopSettingsModalProps) {
  const { isOpen, onClose, busy = false, workspaceError, workspaceStatus } = props;
  const visible = useViewVisibility();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen || !visible) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([tabindex="-1"]), select, input, textarea, summary, a[href], [tabindex="0"]',
      ) || []).filter((el) => !el.matches(':disabled') && el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus();
    };
  }, [isOpen, visible]);
  if (!isOpen || !visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-3 backdrop-blur-[3px] sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="workshop-settings-title" tabIndex={-1}
        className="relative flex max-h-[90dvh] w-full max-w-[800px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-white/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Settings2 size={19} /></span>
            <div><h2 id="workshop-settings-title" className="text-base font-bold">生产设置</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">种草工坊 <span className="mx-1.5 text-slate-300">/</span> 当前批次 · 修改自动保存</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭生产设置" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-indigo-500 dark:hover:bg-white/10"><X size={18} /></button>
        </header>
        {busy && <p role="status" className="shrink-0 border-b border-amber-100 bg-amber-50 px-6 py-2.5 text-xs text-amber-800">任务执行中，设置暂时只读。</p>}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6">
          <fieldset disabled={busy} className="min-w-0 divide-y divide-slate-100 disabled:opacity-60 dark:divide-white/10">
            <legend className="sr-only">当前批次生产设置</legend>
            <WorkshopExecutionSettings {...props} />
            <WorkshopOutputSettings {...props} />
            <WorkshopContentSettings {...props} />
          </fieldset>
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-2.5 sm:px-6 dark:border-white/10 dark:bg-[#18191c]">
          <div>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p role={workspaceError ? 'alert' : 'status'} title={workspaceError ? `保存未确认：${workspaceError}` : workspaceStatus || '修改将随当前批次自动保存'} className={`flex min-w-0 items-center gap-1.5 text-xs md:max-w-[220px] md:truncate ${workspaceError ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                {!workspaceError && <Check size={14} className="shrink-0" />}
                <span className="truncate">{workspaceError ? `保存未确认：${workspaceError}` : workspaceStatus || '修改将随当前批次自动保存'}</span>
              </p>
              <button type="button" onClick={onClose} className="shrink-0 rounded-xl bg-slate-900 px-7 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-indigo-500 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">完成</button>
            </div>
          </div>
        </footer>
      </div>
    </div>, document.body,
  );
}

export default WorkshopSettingsModal;

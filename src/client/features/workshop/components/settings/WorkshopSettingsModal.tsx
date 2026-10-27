import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';
import { WorkshopContentSettings, WorkshopModelSettings, WorkshopOutputSettings, WorkshopExecutionSettings } from './WorkshopSettingsSections';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import './workshopSettings.css';

export type { WorkshopSettingsModalProps } from './workshopSettingsTypes';

type SettingsSection = 'output' | 'skill' | 'models' | 'execution';

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
}> = [
  { id: 'output', label: '图片输出', description: '生成方式、画幅与画质' },
  { id: 'skill', label: '创作技能', description: '按商品匹配内容方案' },
  { id: 'models', label: '生成模型', description: '分析模型与生图模型' },
  { id: 'execution', label: '高级执行', description: '并发与运行策略' },
];

export function WorkshopSettingsModal(props: WorkshopSettingsModalProps) {
  const { isOpen, onClose, busy = false, workspaceError } = props;
  const [activeSection, setActiveSection] = useState<SettingsSection>('output');
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
      if (event.key === 'Escape') { if (dialogRef.current?.querySelector('[aria-expanded="true"]')) return; event.preventDefault(); closeRef.current(); }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-3 backdrop-blur-[3px] sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="workshop-settings-title" tabIndex={-1}
        className="workshop-settings-dialog relative flex h-[min(760px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
        <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">
          <fieldset disabled={busy} className="flex h-full min-w-0 flex-col disabled:opacity-60 md:flex-row">
            <legend className="sr-only">当前批次生产设置</legend>
            <nav aria-label="生产设置分区" className="workshop-settings-nav shrink-0 border-b border-slate-100 bg-slate-50/80 px-3 py-3 dark:border-white/10 dark:bg-[#141518] md:w-[224px] md:border-b-0 md:border-r md:px-4 md:py-6">
              <div className="workshop-settings-nav-heading px-2 pb-4 text-[13px] font-semibold text-slate-500 dark:text-slate-400">本批次设置</div>
              <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {SETTINGS_SECTIONS.map(({ id, label, description }) => {
                  const active = activeSection === id;
                  return <button key={id} type="button" title={description} aria-current={active ? 'page' : undefined} onClick={() => setActiveSection(id)} className={`workshop-settings-nav-item flex min-w-[154px] items-center rounded-xl px-3 py-2.5 text-left transition-colors md:min-w-0 ${active ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/10 dark:text-white dark:ring-white/10' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'}`}>
                    <span className="min-w-0"><strong className="block truncate text-xs font-semibold">{label}</strong></span>
                  </button>;
                })}
              </div>
            </nav>
            <div className="workshop-settings-main flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 sm:px-8 dark:border-white/10">
                <h2 id="workshop-settings-title" className="text-lg font-semibold">生产设置</h2>
                <button type="button" onClick={onClose} aria-label="关闭生产设置" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-indigo-500 dark:hover:bg-white/10"><X size={18} /></button>
              </header>
              {busy && <p role="status" className="shrink-0 border-b border-amber-100 bg-amber-50 px-6 py-2.5 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">任务执行中，设置暂时只读。</p>}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 sm:px-8">
                {activeSection === 'output' && <WorkshopOutputSettings {...props} />}
                {activeSection === 'skill' && <WorkshopContentSettings {...props} />}
                {activeSection === 'models' && <WorkshopModelSettings {...props} />}
                {activeSection === 'execution' && <WorkshopExecutionSettings {...props} />}
              </div>
              <footer className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 sm:px-8 dark:border-white/10 dark:bg-[#18191c]">
                <div className="flex min-w-0 items-center justify-end gap-3">
                  {workspaceError && <p role="alert" title={workspaceError} className="min-w-0 truncate text-xs text-red-500">保存未确认：{workspaceError}</p>}
                  <button type="button" onClick={onClose} className="shrink-0 rounded-xl bg-slate-900 px-7 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-indigo-500 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">完成</button>
                </div>
              </footer>
            </div>
          </fieldset>
        </div>
      </div>
    </div>, document.body,
  );
}

export default WorkshopSettingsModal;

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings2, Layers3, Scan, Cpu, Check } from 'lucide-react';
import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';
import { WorkshopContentSettings, WorkshopOutputSettings, WorkshopExecutionSettings } from './WorkshopSettingsSections';

export type { WorkshopSettingsModalProps } from './workshopSettingsTypes';

const sections = [
  { id: 'content', title: '内容与素材', description: '拍什么 · 用哪些素材', icon: Layers3 },
  { id: 'output', title: '出图规格', description: '怎么生成 · 如何交付', icon: Scan },
  { id: 'execution', title: '模型与执行', description: '模型选择 · 执行偏好', icon: Cpu },
] as const;
type SectionId = typeof sections[number]['id'];

export function WorkshopSettingsModal(props: WorkshopSettingsModalProps) {
  const { isOpen, onClose, busy = false, workspaceError, workspaceStatus } = props;
  const [activeSection, setActiveSection] = useState<SectionId>('content');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
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
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;
  const currentSection = sections.find(section => section.id === activeSection)!;
  const recipeName = props.recipes.find(recipe => recipe.id === props.selectedArchId)?.name || '未选择拍摄类型';
  const quality = { low: '1K', medium: '2K', high: '4K' }[props.selectedQuality];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-3 backdrop-blur-[3px] sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="workshop-settings-title" tabIndex={-1}
        className="relative flex h-[min(800px,92dvh)] w-full max-w-[960px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Settings2 size={19} /></span>
            <div><h2 id="workshop-settings-title" className="text-base font-bold">生产设置</h2>
              <p className="mt-1 text-xs text-slate-500">种草工坊 <span className="mx-1.5 text-slate-300">/</span> 仅应用于当前批次</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭生产设置" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-indigo-500"><X size={18} /></button>
        </header>
        {busy && <p role="status" className="shrink-0 border-b border-amber-100 bg-amber-50 px-6 py-2.5 text-xs text-amber-800">任务执行中，设置暂时只读。仍可切换分区查看当前配置。</p>}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="shrink-0 border-b border-slate-100 bg-slate-50/80 p-2 sm:w-[204px] sm:border-b-0 sm:border-r sm:p-4">
            <p className="mb-3 hidden px-3 text-[11px] font-semibold tracking-wider text-slate-400 sm:block">本批次设置</p>
            <div role="tablist" aria-label="生产设置分区" className="flex gap-1 sm:flex-col">
              {sections.map((section, index) => <button key={section.id} type="button" role="tab" id={`workshop-tab-${section.id}`}
                aria-selected={activeSection === section.id} aria-controls={`workshop-panel-${section.id}`} tabIndex={activeSection === section.id ? 0 : -1}
                onClick={() => setActiveSection(section.id)} onKeyDown={event => {
                  let next = index;
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % sections.length;
                  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + sections.length - 1) % sections.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = sections.length - 1;
                  else return;
                  event.preventDefault(); setActiveSection(sections[next].id);
                  document.getElementById(`workshop-tab-${sections[next].id}`)?.focus();
                }}
                className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-3 text-left transition-colors focus-visible:outline-indigo-500 sm:justify-start sm:gap-3 sm:px-3 ${activeSection === section.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                <section.icon size={17} className="hidden shrink-0 sm:block" />
                <span><span className="block text-xs font-semibold sm:text-sm">{section.title}</span><span className={`mt-1 hidden text-[11px] sm:block ${activeSection === section.id ? 'text-indigo-500' : 'text-slate-400'}`}>{section.description}</span></span>
              </button>)}
            </div>
            <div className="mt-8 hidden border-t border-slate-200/70 px-3 pt-4 sm:block">
              <p className="text-xs font-medium text-slate-600">设置自动保存</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">按内容、出图、执行依次配置，也可以随时切换调整。</p>
            </div>
          </aside>
          <div key={activeSection} role="tabpanel" id={`workshop-panel-${activeSection}`} aria-labelledby={`workshop-tab-${activeSection}`} tabIndex={0}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300 sm:px-7 sm:py-6">
            <h3 className="text-lg font-bold tracking-tight">{currentSection.title}</h3>
            <p className="mb-6 mt-1.5 text-xs leading-5 text-slate-500">{activeSection === 'content' ? '先确定拍摄内容，再选择图组与需要替换的素材。' : activeSection === 'output' ? '设置图片的生成方式，以及最终交付规格。' : '选择分析与生图引擎，调整批量任务的执行偏好。'}</p>
            <fieldset disabled={busy} className="min-w-0 space-y-6 disabled:opacity-60">
              <legend className="sr-only">{currentSection.title}</legend>
              {activeSection === 'content' && <WorkshopContentSettings {...props} />}
              {activeSection === 'output' && <WorkshopOutputSettings {...props} />}
              {activeSection === 'execution' && <WorkshopExecutionSettings {...props} />}
            </fieldset>
          </div>
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500" aria-label="当前批次配置摘要">
            <span className="font-semibold text-slate-700">当前配置</span><span className="max-w-[200px] truncate" title={recipeName}>{recipeName}</span><span aria-hidden="true">·</span>
            <span>{props.generationStrategy === 'grid_first' ? '四宫格' : '单张逐镜'} / {props.selectedShotCount} 镜</span><span aria-hidden="true">·</span>
            <span>{props.selectedAspect} / {quality}{props.generationStrategy === 'grid_first' ? ' 整图' : ''}</span>
            {props.autoGenerateCopywriting && <><span aria-hidden="true">·</span><span>自动文案</span></>}
          </div>
          <div className="flex items-center justify-between gap-4">
            <p role={workspaceError ? 'alert' : 'status'} className={`flex min-w-0 items-center gap-1.5 text-xs ${workspaceError ? 'text-red-600' : 'text-slate-500'}`}>
              {!workspaceError && <Check size={14} className="shrink-0" />}
              {workspaceError ? `保存未确认：${workspaceError}` : workspaceStatus || '修改将随当前批次自动保存'}
            </p>
            <button type="button" onClick={onClose} className="shrink-0 rounded-xl bg-slate-900 px-7 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-indigo-500">完成</button>
          </div>
        </footer>
      </div>
    </div>, document.body,
  );
}

export default WorkshopSettingsModal;

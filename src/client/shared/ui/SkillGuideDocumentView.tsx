import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, Copy, FileText, LoaderCircle } from 'lucide-react';
import MarkdownBody from './markdown/MarkdownBody';

export interface SkillGuideDocument {
  name: string;
  filename: string;
  source: string;
  body: string;
  overview?: ReactNode;
}

const tabs = [{ id: 'overview', label: '概览' }, { id: 'document', label: '技能文档' }] as const;
type Tab = (typeof tabs)[number]['id'];
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/70';

export function SkillGuideDocumentView({ document, uid, mode = 'tabs' }: { document: SkillGuideDocument; uid: string; mode?: 'tabs' | 'inline' }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const tabsRef = useRef<HTMLDivElement>(null);
  const inline = mode === 'inline';

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copy = async () => {
    if (copyState === 'copying') return;
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(document.source);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const index = tabs.findIndex((item) => item.id === tab);
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next].id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div className={inline ? 'space-y-4' : 'grid min-h-0 grid-rows-[auto_minmax(0,1fr)]'}>
      <div className={inline ? 'border-b border-slate-100 dark:border-white/10' : 'border-b border-slate-100 px-4 pt-3 sm:px-6 dark:border-white/10'}>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          {inline ? <h4 className="text-[13px] font-semibold">完整技能文档</h4> : (
            <div ref={tabsRef} role="tablist" aria-label="技能视图" onKeyDown={handleTabKey} className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-black/20">
              {tabs.map((item) => (
                <button key={item.id} id={`${uid}-${item.id}-tab`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${uid}-${item.id}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${tab === item.id ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'} ${focusRing}`}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { void copy(); }} aria-disabled={copyState === 'copying'} aria-busy={copyState === 'copying'} aria-label="复制完整 SKILL.md 文件" className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 aria-disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/5 ${focusRing}`}>
            {copyState === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden /> : copyState === 'copying' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copyState === 'copied' ? '已复制' : inline ? '复制完整 SKILL.md' : '复制技能文件'}
          </button>
        </div>
        <p role="status" aria-live="polite" className={copyState === 'error' || copyState === 'copied' ? 'pb-3 text-xs leading-5 text-slate-500 dark:text-slate-400' : 'sr-only'}>
          {copyState === 'error' ? '复制失败，请重试；也可选中文档正文手动复制（不含文件元信息）。' : copyState === 'copied' ? '已复制完整技能文件，包含 YAML 元信息。' : ''}
        </p>
      </div>
      {inline ? <SkillGuideDocumentBody document={document} /> : (
        <>
          <div id={`${uid}-overview-panel`} role="tabpanel" aria-labelledby={`${uid}-overview-tab`} tabIndex={0} hidden={tab !== 'overview'} className={`min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 ${focusRing}`}>
            {tab === 'overview' ? document.overview : null}
          </div>
          <div id={`${uid}-document-panel`} role="tabpanel" aria-labelledby={`${uid}-document-tab`} tabIndex={0} hidden={tab !== 'document'} className={`min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 ${focusRing}`}>
            {tab === 'document' ? <SkillGuideDocumentBody document={document} /> : null}
          </div>
        </>
      )}
    </div>
  );
}

function SkillGuideDocumentBody({ document }: { document: SkillGuideDocument }) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 pb-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200"><FileText className="h-3.5 w-3.5" aria-hidden />{document.filename}</span>
        <code className="break-all">{document.name}</code>
        <span>随应用构建的技能原文</span>
      </div>
      <MarkdownBody content={document.body} className="[&_h4]:mt-7 [&_h4]:mb-3 [&_h5]:mt-5 [&_p]:leading-7" />
    </div>
  );
}

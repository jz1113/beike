import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { SkillGuideDocumentView, type SkillGuideDocument } from './SkillGuideDocumentView';

export interface SkillGuideSection {
  heading: string;
  body: readonly string[];
}

export interface SkillGuideItem {
  id: string;
  title: string;
  summary: string;
  appliesWhen: string;
  input: string;
  output: string;
  flow: readonly string[];
  sections: readonly SkillGuideSection[];
  document?: SkillGuideDocument;
  mark: ReactNode;
  badge?: { label: string; tone: 'ready' | 'muted' };
}

interface Props {
  title: string;
  status: string;
  note?: string;
  items: readonly SkillGuideItem[];
  layout: 'compact' | 'grid';
  detailMode?: 'inline' | 'page';
  document?: SkillGuideDocument;
  onClose: () => void;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/80';

export function SkillGuideDialog({ title, status, note, items, layout, detailMode = 'inline', document: skillDocument, onClose }: Props) {
  const uid = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = useViewVisibility();
  const openItem = items.find((item) => item.id === openId) ?? null;
  const openPage = detailMode === 'page' ? openItem : null;
  const widthClass = skillDocument
    ? 'h-[min(740px,calc(100dvh-2rem))] max-w-[800px]'
    : openPage
      ? 'h-[min(740px,calc(100dvh-2rem))] max-w-[640px]'
      : detailMode === 'page'
        ? 'max-w-[640px]'
        : layout === 'grid'
          ? 'max-w-[840px]'
          : 'max-w-[680px]';

  useLayoutEffect(() => {
    if (!visible) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!openerRef.current && active && !dialogRef.current?.contains(active)) openerRef.current = active;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      if (opener && opener !== document.body && opener.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !openId || detailMode === 'page') return;
    const scroller = scrollerRef.current;
    const detail = detailRef.current;
    if (!scroller || !detail) return;
    const top = detail.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    scroller.scrollTo({ top: Math.max(0, top) });
    detail.focus({ preventScroll: true });
  }, [detailMode, openId, visible]);

  if (!visible) return null;

  const toggle = (id: string) => {
    const opening = openId !== id;
    setOpenId(opening ? id : null);
    if (detailMode === 'page' && opening) focusAfterPaint(detailDomId(uid, id));
  };
  const collapse = (id: string) => {
    setOpenId(null);
    const toggleId = toggleDomId(uid, id);
    if (detailMode === 'page') {
      focusAfterPaint(toggleId);
      return;
    }
    document.getElementById(toggleId)?.focus();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-3 backdrop-blur-[2px] sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={openPage ? `${uid}-page-summary` : note ? `${uid}-status ${uid}-note` : `${uid}-status`}
        tabIndex={-1}
        className={`grid max-h-[calc(100dvh-2rem)] w-full ${widthClass} grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] outline-none dark:border-white/10 dark:bg-[#18191c] dark:text-slate-100`}
        onKeyDown={(event) => handleDialogKey(event, onClose)}
      >
        {openPage ? (
          <header className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center">{openPage.mark}</span>
                {openPage.badge ? <span className={`text-xs ${openPage.badge.tone === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{openPage.badge.label}</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => collapse(openPage.id)} className={`inline-flex h-8 items-center gap-0.5 rounded-lg px-2 text-xs text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 ${focusRing}`}>
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />返回列表
                </button>
                <CloseButton title={title} onClose={onClose} />
              </div>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">{openPage.title}<span className="ml-2 text-base font-normal text-slate-400">技能</span></h2>
            <p id={`${uid}-page-summary`} className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{openPage.summary}</p>
          </header>
        ) : (
          <header className={`flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/10 ${detailMode === 'page' ? 'px-4 py-3 sm:px-4' : 'px-4 py-4 sm:px-5'}`}>
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:ring-amber-300/30">
                <BookOpen className="h-4 w-4 text-amber-700 dark:text-amber-200" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-black tracking-tight">{title}</h2>
                <p id={`${uid}-status`} className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{status}</p>
                {note ? <p id={`${uid}-note`} className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{note}</p> : null}
              </div>
            </div>
            <CloseButton title={title} onClose={onClose} />
          </header>
        )}
        {skillDocument ? <SkillGuideDocumentView document={skillDocument} uid={uid} /> : openPage ? (
          <SkillGuidePage item={openPage} detailRef={detailRef} detailId={detailDomId(uid, openPage.id)} />
        ) : (
          <div ref={scrollerRef} tabIndex={0} role="region" aria-label={`${title}正文`} className={`min-h-0 overflow-y-auto overscroll-contain outline-none ${detailMode === 'page' ? 'space-y-2 px-3 py-3' : 'space-y-3 px-4 py-4 sm:px-5'} ${focusRing}`}>
            <ul className={layout === 'grid' ? 'grid items-stretch gap-3 sm:grid-cols-2' : 'grid gap-2'}>
              {items.map((item) => (
                <li key={item.id} className="h-full min-w-0">
                  {detailMode === 'page'
                    ? <SkillGuideRow item={item} detailId={detailDomId(uid, item.id)} toggleId={toggleDomId(uid, item.id)} onToggle={() => toggle(item.id)} />
                    : <SkillGuideCard item={item} layout={layout} open={openId === item.id} detailId={detailDomId(uid, item.id)} toggleId={toggleDomId(uid, item.id)} onToggle={() => toggle(item.id)} />}
                </li>
              ))}
            </ul>
            {openItem ? <SkillGuideDetail item={openItem} detailRef={detailRef} detailId={detailDomId(uid, openItem.id)} onCollapse={() => collapse(openItem.id)} /> : null}
          </div>
        )}
      </section>
    </div>
  );
}

function SkillGuideRow({ item, detailId, toggleId, onToggle }: { item: SkillGuideItem; detailId: string; toggleId: string; onToggle: () => void }) {
  return (
    <button id={toggleId} type="button" aria-label={`查看${item.title}详情`} aria-expanded={false} aria-controls={detailId} onClick={onToggle}
      className={`group flex w-full items-center gap-3.5 rounded-xl px-3 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 ${focusRing}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">{item.mark}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{item.title}</span>
        <span className="mt-1 block truncate text-[13px] leading-5 text-slate-500 dark:text-slate-400" title={item.summary}>{item.summary}</span>
      </span>
      {item.badge ? <span className={`flex shrink-0 items-center gap-1 text-[11px] ${item.badge.tone === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
        {item.badge.tone === 'ready' ? <Check className="h-4 w-4" aria-hidden /> : null}<span className="sr-only sm:not-sr-only">{item.badge.label}</span>
      </span> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-600 dark:text-slate-600 dark:group-hover:text-slate-300" aria-hidden />
    </button>
  );
}

function SkillGuideCard({ item, layout, open, detailId, toggleId, onToggle }: { item: SkillGuideItem; layout: 'compact' | 'grid'; open: boolean; detailId: string; toggleId: string; onToggle: () => void }) {
  const facts = [
    ['适用', item.appliesWhen],
    ['输入', item.input],
    ['产出', item.output],
  ] as const;
  const stacked = layout === 'grid';
  return (
    <article className={`flex h-full flex-col rounded-[18px] border p-4 ${open ? 'border-amber-300 bg-amber-50/40 ring-2 ring-amber-100 dark:border-amber-300/40 dark:bg-amber-400/5 dark:ring-amber-400/15' : 'border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.03]'}`}>
      <div className="flex items-start gap-3">
        <SkillMark size={layout === 'grid' ? 'compact' : 'regular'}>{item.mark}</SkillMark>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-black tracking-tight">{item.title}</h3>
            {item.badge ? <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${item.badge.tone === 'ready' ? 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/30' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15'}`}>{item.badge.label}</span> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.summary}</p>
        </div>
      </div>
      <dl className={stacked ? 'mt-3 space-y-2' : 'mt-3 grid gap-3 sm:grid-cols-3'}>
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-[13px] leading-5 text-slate-800 dark:text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      <div className={stacked ? 'mt-auto flex flex-col gap-3 pt-4' : 'mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'}>
        <SkillFlow steps={item.flow} />
        <button id={toggleId} type="button" aria-expanded={open} aria-controls={detailId} onClick={onToggle} className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-amber-300 hover:text-slate-950 dark:border-white/10 dark:bg-[#1B1B1E] dark:text-slate-100 dark:hover:border-amber-300/50 ${layout === 'grid' ? 'w-full' : 'w-full sm:w-auto'} ${focusRing}`}>
          {open ? '收起详情' : '查看详情'}
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
    </article>
  );
}

function SkillGuideDetail({ item, detailRef, detailId, onCollapse }: { item: SkillGuideItem; detailRef: Ref<HTMLElement>; detailId: string; onCollapse: () => void }) {
  return (
    <section ref={detailRef} id={detailId} aria-labelledby={`${detailId}-title`} tabIndex={-1} className="rounded-[18px] border border-slate-200 bg-white p-4 outline-none dark:border-white/10 dark:bg-black/20 sm:p-5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
        <div className="min-w-0">
          <h3 id={`${detailId}-title`} className="text-sm font-black tracking-tight">{item.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.summary}</p>
        </div>
        <button type="button" aria-expanded={true} aria-controls={detailId} onClick={onCollapse} className={`inline-flex h-8 shrink-0 items-center rounded-xl px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-slate-100 ${focusRing}`}>收起详情</button>
      </div>
      <div className="mt-4 space-y-5">
        {item.sections.map((section) => (
          <div key={section.heading} className="border-l-2 border-amber-200 pl-3 dark:border-amber-400/35">
            <h4 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{section.heading}</h4>
            <ul className="mt-2 space-y-2">
              {section.body.map((line, index) => (
                <li key={`${section.heading}-${index}`} className="flex gap-2 text-[13px] leading-6 text-slate-700 dark:text-slate-200">
                  <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-amber-500/80" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {item.document ? <SkillGuideDocumentView document={item.document} uid={detailId} mode="inline" /> : null}
      </div>
    </section>
  );
}

function SkillGuidePage({ item, detailRef, detailId }: { item: SkillGuideItem; detailRef: Ref<HTMLElement>; detailId: string }) {
  return (
    <section ref={detailRef} id={detailId} aria-label={`${item.title}详情`} tabIndex={-1} className={`mx-4 mb-4 min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4 outline-none sm:mx-6 sm:mb-6 sm:p-5 dark:border-white/[0.07] dark:bg-white/[0.025] ${focusRing}`}>
      <div className="space-y-5">
        <div className="border-b border-slate-200/70 pb-4 dark:border-white/[0.07]">
          <dl className="space-y-3">
            {([['适用', item.appliesWhen], ['输入', item.input], ['产出', item.output]] as const).map(([label, value]) => <div key={label} className="flex gap-4 text-[13px] leading-6"><dt className="shrink-0 text-slate-400">{label}</dt><dd className="text-slate-600 dark:text-slate-300">{value}</dd></div>)}
          </dl>
          <div className="pt-4"><SkillFlow steps={item.flow} /></div>
        </div>
        {item.sections.map((section) => (
          <div key={section.heading} className="border-l-2 border-amber-200 pl-3 dark:border-amber-400/35">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{section.heading}</h3>
            <ul className="mt-2 space-y-2">
              {section.body.map((line, index) => (
                <li key={`${section.heading}-${index}`} className="flex gap-2 text-[13px] leading-6 text-slate-700 dark:text-slate-200">
                  <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-amber-500/80" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {item.document ? <SkillGuideDocumentView document={item.document} uid={detailId} mode="inline" /> : null}
      </div>
    </section>
  );
}

function CloseButton({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label={`关闭${title}`} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100 ${focusRing}`}>
      <X className="h-5 w-5" aria-hidden />
    </button>
  );
}

function SkillMark({ size, children }: { size: 'compact' | 'regular'; children: ReactNode }) {
  const box = size === 'compact' ? 'h-11 w-11 rounded-2xl' : 'h-14 w-14 rounded-2xl';
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-amber-50 text-amber-800 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/25 ${box}`}>
      <span aria-hidden className="absolute -right-3 -top-3 h-8 w-8 rounded-full bg-[#df6a48]/20" />
      <span aria-hidden className="absolute -bottom-4 -left-3 h-7 w-7 rounded-md bg-amber-200/80 dark:bg-amber-200/15" />
      <span className="relative">{children}</span>
    </span>
  );
}

function SkillFlow({ steps }: { steps: readonly string[] }) {
  if (steps.length === 0) return null;
  return (
    <ol aria-label="过程" className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5">
      {steps.map((step, index) => (
        <li key={step} className="flex min-w-0 items-center gap-1">
          {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-500" aria-hidden /> : null}
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function focusAfterPaint(id: string) {
  queueMicrotask(() => document.getElementById(id)?.focus());
}

function toggleDomId(uid: string, id: string) {
  return `${uid}-toggle-${id}`;
}

function detailDomId(uid: string, id: string) {
  return `${uid}-detail-${id}`;
}

function handleDialogKey(event: KeyboardEvent<HTMLElement>, onClose: () => void) {
  if (event.defaultPrevented || event.nativeEvent.isComposing) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && element.getAttribute('aria-disabled') !== 'true');
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = document.activeElement;
  if (!first) event.preventDefault();
  else if (active === event.currentTarget || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}

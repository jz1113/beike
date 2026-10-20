import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { BookOpen, ChevronDown, ChevronRight, X } from 'lucide-react';
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
  document?: SkillGuideDocument;
  onClose: () => void;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/80';

export function SkillGuideDialog({ title, status, note, items, layout, document: skillDocument, onClose }: Props) {
  const uid = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = useViewVisibility();
  const openItem = items.find((item) => item.id === openId) ?? null;
  const widthClass = skillDocument ? 'h-[min(740px,calc(100dvh-2rem))] max-w-[800px]' : layout === 'grid' ? 'max-w-[840px]' : 'max-w-[680px]';

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
    if (!visible || !openId) return;
    const scroller = scrollerRef.current;
    const detail = detailRef.current;
    if (!scroller || !detail) return;
    const top = detail.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    scroller.scrollTo({ top: Math.max(0, top) });
    detail.focus({ preventScroll: true });
  }, [openId, visible]);

  if (!visible) return null;

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));
  const collapse = (id: string) => {
    setOpenId(null);
    document.getElementById(toggleDomId(uid, id))?.focus();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-3 backdrop-blur-[2px] sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={note ? `${uid}-status ${uid}-note` : `${uid}-status`}
        tabIndex={-1}
        className={`grid max-h-[calc(100dvh-2rem)] w-full ${widthClass} grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] outline-none dark:border-white/10 dark:bg-[#18191c] dark:text-slate-100`}
        onKeyDown={(event) => handleDialogKey(event, onClose)}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-white/10">
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
          <button type="button" onClick={onClose} aria-label={`关闭${title}`} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100 ${focusRing}`}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        {skillDocument ? <SkillGuideDocumentView document={skillDocument} uid={uid} /> : (
          <div ref={scrollerRef} tabIndex={0} role="region" aria-label={`${title}正文`} className={`min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 outline-none sm:px-5 ${focusRing}`}>
            <ul className={layout === 'grid' ? 'grid items-stretch gap-3 sm:grid-cols-2' : 'grid gap-3'}>
              {items.map((item) => (
                <li key={item.id} className="h-full min-w-0">
                  <SkillGuideCard item={item} layout={layout} open={openId === item.id} detailId={detailDomId(uid, item.id)} toggleId={toggleDomId(uid, item.id)} onToggle={() => toggle(item.id)} />
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

function SkillGuideCard({ item, layout, open, detailId, toggleId, onToggle }: { item: SkillGuideItem; layout: 'compact' | 'grid'; open: boolean; detailId: string; toggleId: string; onToggle: () => void }) {
  const facts = [
    ['适用', item.appliesWhen],
    ['输入', item.input],
    ['产出', item.output],
  ] as const;
  return (
    <article className={`flex h-full flex-col rounded-[18px] border p-4 ${open ? 'border-amber-300 bg-amber-50/40 ring-2 ring-amber-100 dark:border-amber-300/40 dark:bg-amber-400/5 dark:ring-amber-400/15' : 'border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.03]'}`}>
      <div className="flex items-start gap-3">
        <SkillMark compact={layout === 'grid'}>{item.mark}</SkillMark>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-black tracking-tight">{item.title}</h3>
            {item.badge ? <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${item.badge.tone === 'ready' ? 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/30' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15'}`}>{item.badge.label}</span> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.summary}</p>
        </div>
      </div>
      <dl className={layout === 'grid' ? 'mt-3 space-y-2' : 'mt-3 grid gap-3 sm:grid-cols-3'}>
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-[13px] leading-5 text-slate-800 dark:text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      <div className={layout === 'compact' ? 'mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between' : 'mt-auto flex flex-col gap-3 pt-4'}>
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

function SkillMark({ compact, children }: { compact: boolean; children: ReactNode }) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-50 text-amber-800 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/25 ${compact ? 'h-11 w-11' : 'h-14 w-14'}`}>
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

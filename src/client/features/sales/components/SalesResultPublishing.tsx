import { useState, type ComponentProps, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { salesActualReferences, type SalesImageRef, type VideoSalesScript } from '@shared/domain/sales';
import { SalesStructuredPrompt } from './SalesPromptEditor';
import { SalesActionBar, salesFocusClass, salesGhostButtonClass } from './salesChrome';

type CopyKind = 'title' | 'full' | 'cover' | 'interaction' | 'prompt';

export function SalesResultPublishing({ script, productImages, tasks, notices, actions }: {
  script: VideoSalesScript;
  productImages: SalesImageRef[];
  tasks?: ReactNode;
  notices?: ReactNode;
  actions?: ReactNode;
}) {
  const [copyStatus, setCopyStatus] = useState<Partial<Record<CopyKind, 'copied' | 'error'>>>({});
  const seo = script.seo;
  const tags = (seo?.hashtags || []).map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
  const copyText = async (kind: CopyKind) => {
    const value = kind === 'prompt' ? script.fullPrompt : kind === 'title' ? seo?.title : kind === 'cover' ? seo?.coverText : kind === 'interaction' ? seo?.interactionGuide
      : [seo?.title, tags.join(' '), seo?.description, seo?.coverText && `封面文案：${seo.coverText}`, seo?.interactionGuide && `评论区引导：${seo.interactionGuide}`].filter(Boolean).join('\n\n');
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus((previous) => ({ ...previous, [kind]: 'copied' }));
    } catch { setCopyStatus((previous) => ({ ...previous, [kind]: 'error' })); }
  };
  const copyButton = (kind: CopyKind, label: string, iconOnly = false) => <button type="button" aria-label={label} title={copyStatus[kind] === 'copied' ? '已复制' : label} disabled={kind === 'title' && !seo?.title} onClick={() => { void copyText(kind); }} className={`h-8 ${iconOnly ? 'w-8 px-0' : 'px-2'} disabled:opacity-40 ${salesGhostButtonClass}`}>
    {copyStatus[kind] === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{!iconOnly && (copyStatus[kind] === 'copied' ? '已复制' : label)}
  </button>;
  let references: ReturnType<typeof salesActualReferences> = [];
  try { references = salesActualReferences(script, productImages); } catch { /* 原始提示词与复制仍可用。 */ }
  return <>
    <header className="sales-result-publish-header flex shrink-0 flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">成片发布文案</h2>
      <div className="flex gap-1.5">{copyButton('title', '复制标题')}{copyButton('full', '复制全文')}</div>
    </header>
    {Object.values(copyStatus).includes('error') && <p role="status" className="mt-2 text-xs text-rose-500">复制失败，请选中文案手动复制或重试</p>}
    <div className="sales-result-publish-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <section aria-label="发布文案" className="pt-5">
        <h3 className="text-lg font-semibold leading-relaxed [overflow-wrap:anywhere]">{seo?.title || '暂无发布标题'}</h3>
        {tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{tags.map((tag, index) => <span key={`${index}-${tag}`} className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">{tag}</span>)}</div>}
        <p className="mt-4 whitespace-pre-wrap text-[13px] leading-[1.6] text-slate-600 [overflow-wrap:anywhere] dark:text-slate-300">{seo?.description || '暂无发布正文'}</p>
      </section>
      <div className="sales-result-copy-cards mt-5 grid gap-3">
        {seo?.coverText && <section aria-label="封面文案" className="rounded-xl bg-slate-100/80 p-3 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-2"><h3 className="text-xs text-slate-500 dark:text-slate-400">封面文案</h3>{copyButton('cover', '复制封面文案', true)}</div>
          <p className="mt-1 text-sm leading-relaxed [overflow-wrap:anywhere]">{seo.coverText}</p>
        </section>}
        {seo?.interactionGuide && <section aria-label="评论区引导" className="rounded-xl bg-slate-100/80 p-3 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-2"><h3 className="text-xs text-slate-500 dark:text-slate-400">评论区引导</h3>{copyButton('interaction', '复制评论区引导', true)}</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 [overflow-wrap:anywhere] dark:text-slate-300">{seo.interactionGuide}</p>
        </section>}
      </div>
      {notices && <div className="mt-4 space-y-3">{notices}</div>}
      <section aria-label="完整视频提示词" className="sales-result-full-prompt">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2"><h3 className="text-xs font-medium">完整视频提示词</h3>{script.fullPrompt?.trim() && copyButton('prompt', '复制提示词', true)}</div>
        <div className="sales-result-prompt-scroll">
          {script.fullPrompt?.trim() ? <SalesStructuredPrompt prompt={script.fullPrompt} references={references} /> : <p className="pb-3 text-xs leading-5 text-slate-500">视频提示词将在素材确认后生成。</p>}
        </div>
      </section>
      <div className="shrink-0">{tasks}</div>
    </div>
    {actions && <div aria-label="结果操作" className="sales-result-actions shrink-0 border-t border-slate-200/70 pt-4 dark:border-white/10">{actions}</div>}
  </>;
}

type DockAction = ComponentProps<typeof SalesActionBar>['primary'];

export function SalesResultActions({ primary, secondary, busy, reason, note, resultUrl, title }: {
  primary: DockAction;
  secondary?: DockAction;
  busy: boolean;
  reason?: string | null;
  note?: string;
  resultUrl: string | null;
  title: string;
}) {
  const primaryClass = `sales-primary-action inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${salesFocusClass}`;
  return <div className="space-y-2.5">
    {!busy && (reason || note) && <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">{reason || note}</p>}
    {busy ? <>
      <button type="button" disabled className={primaryClass}>下载完整视频</button>
      {resultUrl && <a href={resultUrl} download={`${title || '电商视频'}.mp4`} className={`min-h-9 w-full ${salesGhostButtonClass}`}>下载已有成片</a>}
    </> : <>
      {primary.href && !primary.disabled ? <a href={primary.href} download={primary.download} className={primaryClass}>{primary.label}</a> : <button type="button" onClick={primary.onClick} disabled={primary.disabled} className={primaryClass}>{primary.label}</button>}
      {secondary && <button type="button" onClick={secondary.onClick} disabled={secondary.disabled} className={`min-h-9 w-full ${salesGhostButtonClass}`}>{secondary.label}</button>}
    </>}
  </div>;
}

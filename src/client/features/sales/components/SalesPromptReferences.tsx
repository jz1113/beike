import type { ReactNode } from 'react';
import type { SalesActualReference } from '@shared/domain/sales';
import { salesFocusClass } from './salesChrome';

export function SalesPromptReferences({ prompt, references }: { prompt: string; references: SalesActualReference[] }) {
  const parts: ReactNode[] = [];
  const pattern = /@?图片[ \t]*(\d+)/g;
  let offset = 0;
  for (const match of prompt.matchAll(pattern)) {
    const index = match.index;
    const reference = references[Number(match[1]) - 1];
    if (!reference) continue;
    parts.push(prompt.slice(offset, index));
    parts.push(
      <a key={index} href={reference.url} target="_blank" rel="noreferrer" aria-label={`图片${match[1]} · ${reference.label}`} title={`图片${match[1]} · ${reference.label}`} className={`mx-0.5 inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-slate-300/80 bg-slate-100 px-1 align-middle font-sans text-xs text-slate-800 no-underline hover:bg-slate-200 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-100 dark:hover:bg-white/15 ${salesFocusClass}`}>
        <img src={reference.url} alt="" loading="lazy" className="h-4 w-4 shrink-0 rounded-sm bg-white object-contain" />
        <span className="whitespace-nowrap">@图片 {Number(match[1])}</span>
      </a>,
    );
    offset = index + match[0].length;
  }
  parts.push(prompt.slice(offset));
  return <>{parts}</>;
}

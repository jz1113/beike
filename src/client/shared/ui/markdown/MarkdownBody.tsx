import React, { type ReactNode } from 'react';
import MarkdownCodeBlock from './MarkdownCodeBlock';
import { normalizeMarkdownSource, tokenizeInline } from './visibleMarkdownText';

export type MarkdownAccent = 'amber' | 'violet' | 'slate';

interface Props {
  content: string;
  className?: string;
  accentColor?: MarkdownAccent;
  leading?: ReactNode;
  streaming?: boolean;
  renderCode?: (code: string, lang: string, incomplete: boolean) => ReactNode;
}

export default function MarkdownBody({
  content,
  className = '',
  accentColor = 'slate',
  leading,
  streaming = false,
  renderCode,
}: Props) {
  if (!content && !leading && !streaming) return null;

  const cleanContent = normalizeMarkdownSource(content || '');
  const rendered = renderLines(cleanContent.split('\n'), accentColor, renderCode, streaming);

  return (
    <div className={`agent-markdown space-y-2 text-sm leading-7 select-text text-slate-700 min-w-0 [overflow-wrap:anywhere] dark:text-slate-200 ${className}`}>
      {leading}
      {rendered}
      {streaming && rendered.length === 0 ? <StreamingCursor /> : null}
    </div>
  );
}

function isTableSeparator(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.slice(1, -1).split('|');
  return cells.length > 0 && cells.every((c) => /^[\s:-]+$/.test(c.trim()) && c.includes('-'));
}

function parseTableRow(str: string): string[] {
  const trimmed = str.trim();
  const withoutEnds = trimmed.startsWith('|') && trimmed.endsWith('|')
    ? trimmed.slice(1, -1)
    : trimmed;
  return withoutEnds.split('|').map((c) => c.trim());
}

function StreamingCursor() {
  return <span className="ml-1 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-full bg-slate-400 align-middle dark:bg-slate-300" aria-hidden="true" />;
}

function renderLines(
  lines: string[],
  accentColor: MarkdownAccent,
  renderCode?: (code: string, lang: string, incomplete: boolean) => ReactNode,
  streaming = false,
) {
  const lastLineIndex = streaming ? lines.findLastIndex((entry) => Boolean(entry.trim())) : -1;
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  const paintCode = renderCode || ((code, lang, incomplete) => (
    <MarkdownCodeBlock code={code} lang={lang} incomplete={incomplete} />
  ));

  const accentPillClasses = {
    amber: 'bg-gradient-to-b from-amber-500 to-orange-500',
    violet: 'bg-gradient-to-b from-violet-600 to-indigo-600',
    slate: 'bg-gradient-to-b from-slate-600 to-slate-800',
  }[accentColor];

  const dotClasses = {
    amber: 'bg-amber-500',
    violet: 'bg-violet-500',
    slate: 'bg-slate-500',
  }[accentColor];

  const numBadgeClasses = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-100',
    violet: 'bg-violet-50 border-violet-200 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-100',
    slate: 'bg-slate-100 border-slate-200 text-slate-800 dark:text-slate-100 dark:bg-white/10 dark:border-white/10',
  }[accentColor];

  const quoteClasses = {
    amber: 'border-l-3 border-amber-500 bg-amber-50/50 text-slate-700 dark:border-amber-400/70 dark:bg-amber-400/10 dark:text-amber-50',
    violet: 'border-l-3 border-violet-500 bg-violet-50/40 text-slate-700 dark:border-violet-400/70 dark:bg-violet-400/10 dark:text-violet-50',
    slate: 'border-l-3 border-slate-400 bg-slate-100/60 text-slate-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-200',
  }[accentColor];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <React.Fragment key={`code-${i}`}>
            {paintCode(codeBlockLines.join('\n').trim(), codeBlockLang, false)}
          </React.Fragment>,
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|') && !isTableSeparator(lines[j])) {
        rows.push(parseTableRow(lines[j]));
        j++;
      }
      i = j - 1;

      elements.push(
        <div key={`table-${i}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 font-semibold text-slate-800 dark:border-white/10 dark:bg-white/8 dark:text-slate-100">
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="whitespace-nowrap border-r border-slate-200/60 px-3.5 py-2.5 font-bold text-slate-900 last:border-r-0 dark:border-white/10 dark:text-slate-100">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-white/10 dark:text-slate-200">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="odd:bg-white even:bg-slate-50/30 transition-colors hover:bg-slate-50/60 dark:odd:bg-transparent dark:even:bg-white/5 dark:hover:bg-white/10">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="border-r border-slate-100 px-3.5 py-2.5 align-top leading-relaxed last:border-r-0 dark:border-white/10">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      elements.push(<div key={`hr-${i}`} className="my-2.5 border-t border-slate-200/80 dark:border-white/10" />);
      continue;
    }

    if (!line.trim()) continue;

    const tailCursor = i === lastLineIndex ? <StreamingCursor /> : null;

    if (line.startsWith('#### ')) {
      elements.push(
        <h6 key={`h4-${i}`} className="mt-2.5 mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-900 sm:text-[13px] dark:text-slate-100">
          {accentColor !== 'slate' && <span className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} />}
          <span>{renderInline(line.slice(5))}{tailCursor}</span>
        </h6>,
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h5 key={`h3-${i}`} className="mt-2.5 mb-1 flex items-center gap-1.5 pb-1 text-xs font-bold text-slate-900 sm:text-[13px] dark:text-slate-100">
          {accentColor !== 'slate' && <span className={`h-3 w-1.5 rounded-full ${dotClasses}`} />}
          <span>{renderInline(line.slice(4))}{tailCursor}</span>
        </h5>,
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h4 key={`h2-${i}`} className="mt-3 mb-1 flex items-center gap-2 pb-0.5 text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100">
          {accentColor !== 'slate' && <span className={`h-4 w-1.5 rounded-full ${accentPillClasses}`} />}
          <span>{renderInline(line.slice(3))}{tailCursor}</span>
        </h4>,
      );
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h3 key={`h1-${i}`} className="mt-3.5 mb-1.5 flex items-center gap-2 pb-0.5 text-base font-extrabold text-slate-900 sm:text-lg dark:text-slate-100">
          {accentColor !== 'slate' && <span className={`h-4.5 w-2 rounded-full ${accentPillClasses}`} />}
          <span>{renderInline(line.slice(2))}{tailCursor}</span>
        </h3>,
      );
      continue;
    }

    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`quote-${i}`} className={`${quoteClasses} my-2 rounded-r-xl py-1.5 pl-3 text-xs italic sm:text-[13px]`}>
          {renderInline(line.slice(2).trim())}{tailCursor}
        </blockquote>,
      );
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[*\-+•·]\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      elements.push(
        <div key={`bullet-${i}`} className={`my-1 flex items-start gap-2 ${indent > 0 ? 'ml-4' : 'ml-0.5'}`}>
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClasses}`} />
          <div className="flex-1 leading-relaxed text-slate-700 dark:text-slate-200">{renderInline(bulletMatch[2])}{tailCursor}</div>
        </div>,
      );
      continue;
    }

    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indent = numMatch[1].length;
      elements.push(
        <div key={`num-${i}`} className={`my-2 flex items-start gap-2.5 ${indent > 0 ? 'ml-4' : 'ml-0.5'}`}>
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-bold shadow-2xs ${numBadgeClasses}`}>
            {numMatch[2]}
          </span>
          <div className="flex-1 pt-0.5 leading-relaxed text-slate-700 dark:text-slate-200">{renderInline(numMatch[3])}{tailCursor}</div>
        </div>,
      );
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="my-2 break-words leading-7 text-slate-700 dark:text-slate-200">
        {renderInline(line)}
        {tailCursor}
      </p>,
    );
  }

  if (inCodeBlock && codeBlockLines.length) {
    elements.push(
      <React.Fragment key="code-pending">
        {paintCode(codeBlockLines.join('\n'), codeBlockLang, true)}
      </React.Fragment>,
    );
  }
  return elements;
}

function renderInline(text: string): React.ReactNode {
  const pieces = tokenizeInline(text);
  if (!pieces.length) return null;

  return pieces.map((piece, index) => {
    if (piece.type === 'code') {
      return (
        <code key={`code-${index}`} className="mx-0.5 rounded bg-zinc-200/60 px-1 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-white/10 dark:text-slate-200">
          {piece.text}
        </code>
      );
    }
    if (piece.type === 'bold') {
      return (
        <strong key={`bold-${index}`} className="font-semibold text-zinc-900 dark:text-slate-100">
          {piece.text}
        </strong>
      );
    }
    if (piece.type === 'italic') {
      return (
        <em key={`em-${index}`} className="px-0.5 font-normal text-slate-600 italic dark:text-slate-300">
          {piece.text}
        </em>
      );
    }
    return <span key={`txt-${index}`}>{piece.text}</span>;
  });
}

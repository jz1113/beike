import { AssistantImageBatch } from './AssistantBatchPanel';
import React from 'react';
import AssistantCodeBlock from './AssistantCodeBlock';
import type { MediaAttachment } from '@client/store/appStoreTypes';

interface Props {
  content: string;
  referenceMedia?: MediaAttachment[];
  className?: string;
  accentColor?: 'amber' | 'violet' | 'slate';
}

export default function FormattedMarkdown({
  content,
  className = '',
  accentColor = 'amber',
  referenceMedia = [],
}: Props) {
  if (!content) return null;

  // 预处理文本：清理多余的 Markdown 残留符号
  const cleanContent = content
    .replace(/\*\*(.*?):\s*\*\*/g, '**$1:**')
    .replace(/\*\*(.*?)\s*\*\*/g, '**$1**');

  const lines = cleanContent.split('\n');

  return (
    <div className={`agent-markdown space-y-2 text-sm leading-7 select-text text-slate-700 min-w-0 [overflow-wrap:anywhere] ${className}`}>
      <AssistantImageBatch content={content} referenceMedia={referenceMedia} />
      {renderLines(lines, accentColor, referenceMedia)}
    </div>
  );
}

function isTableSeparator(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.slice(1, -1).split('|');
  return cells.length > 0 && cells.every(c => /^[\s:-]+$/.test(c.trim()) && c.includes('-'));
}

function parseTableRow(str: string): string[] {
  const trimmed = str.trim();
  const withoutEnds = trimmed.startsWith('|') && trimmed.endsWith('|')
    ? trimmed.slice(1, -1)
    : trimmed;
  return withoutEnds.split('|').map(c => c.trim());
}

function renderLines(lines: string[], accentColor: 'amber' | 'violet' | 'slate' = 'amber', referenceMedia: MediaAttachment[] = []) {
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

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
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
    slate: 'bg-slate-100 border-slate-200 text-slate-800',
  }[accentColor];

  const quoteClasses = {
    amber: 'border-l-3 border-amber-500 bg-amber-50/50 text-slate-700',
    violet: 'border-l-3 border-violet-500 bg-violet-50/40 text-slate-700',
    slate: 'border-l-3 border-slate-400 bg-slate-100/60 text-slate-700',
  }[accentColor];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块处理
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        const codeText = codeBlockLines.join('\n').trim();
        elements.push(
          <AssistantCodeBlock
            key={`code-${i}`}
            code={codeText}
            referenceMedia={referenceMedia}
            lang={codeBlockLang}
          />
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

    // Markdown 表格解析
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
        <div key={`table-${i}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200/90 shadow-2xs bg-white">
          <table className="w-full text-left text-xs border-collapse min-w-[480px]">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-800 font-semibold">
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3.5 py-2.5 font-bold whitespace-nowrap text-slate-900 border-r border-slate-200/60 last:border-r-0">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/60 transition-colors odd:bg-white even:bg-slate-50/30">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2.5 leading-relaxed align-top border-r border-slate-100 last:border-r-0">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 分割线 (---, ***, ___)
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      elements.push(
        <div key={`hr-${i}`} className="my-2.5 border-t border-slate-200/80" />
      );
      continue;
    }

    // 空行
    if (!line.trim()) {
      // 空行由块间距表达，避免占位块与段落边距叠加。
      continue;
    }

    // 标题处理 (####, ###, ##, #)
    if (line.startsWith('#### ')) {
      elements.push(
        <h6 key={`h4-${i}`} className="font-bold text-slate-900 text-xs sm:text-[13px] mt-2.5 mb-1 flex items-center gap-1.5">
          {accentColor !== 'slate' && <span className={`w-1.5 h-1.5 rounded-full ${dotClasses}`} />}
          <span>{renderInline(line.slice(5))}</span>
        </h6>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h5 key={`h3-${i}`} className="font-bold text-slate-900 text-xs sm:text-[13px] mt-2.5 mb-1 flex items-center gap-1.5 pb-1">
          {accentColor !== 'slate' && <span className={`w-1.5 h-3 rounded-full ${dotClasses}`} />}
          <span>{renderInline(line.slice(4))}</span>
        </h5>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h4 key={`h2-${i}`} className="font-bold text-slate-900 text-sm sm:text-base mt-3 mb-1 flex items-center gap-2 pb-0.5">
          {accentColor !== 'slate' && <span className={`w-1.5 h-4 rounded-full ${accentPillClasses}`} />}
          <span>{renderInline(line.slice(3))}</span>
        </h4>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h3 key={`h1-${i}`} className="font-extrabold text-slate-900 text-base sm:text-lg mt-3.5 mb-1.5 flex items-center gap-2 pb-0.5">
          {accentColor !== 'slate' && <span className={`w-2 h-4.5 rounded-full ${accentPillClasses}`} />}
          <span>{renderInline(line.slice(2))}</span>
        </h3>
      );
      continue;
    }

    // 引用块
    if (line.startsWith('> ')) {
      const quoteText = line.slice(2).trim();
      elements.push(
        <blockquote key={`quote-${i}`} className={`${quoteClasses} pl-3 py-1.5 rounded-r-xl italic my-2 text-xs sm:text-[13px]`}>
          {renderInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // 列表项 (*, -, +, •, ·)
    const bulletMatch = line.match(/^(\s*)[*\-+•·]\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const text = bulletMatch[2];
      elements.push(
        <div key={`bullet-${i}`} className={`flex items-start gap-2 ${indent > 0 ? 'ml-4' : 'ml-0.5'} my-1`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotClasses} flex-shrink-0 mt-2`} />
          <div className="flex-1 text-slate-700 leading-relaxed">{renderInline(text)}</div>
        </div>
      );
      continue;
    }

    // 数字序号列表 (1., 2., 3.)
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indent = numMatch[1].length;
      const num = numMatch[2];
      const text = numMatch[3];
      elements.push(
        <div key={`num-${i}`} className={`flex items-start gap-2.5 ${indent > 0 ? 'ml-4' : 'ml-0.5'} my-2`}>
          <span className={`w-5 h-5 rounded-lg border font-mono text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs ${numBadgeClasses}`}>
            {num}
          </span>
          <div className="flex-1 text-slate-700 leading-relaxed pt-0.5">{renderInline(text)}</div>
        </div>
      );
      continue;
    }

    // 普通段落
    elements.push(
      <p key={`p-${i}`} className="text-slate-700 leading-7 break-words my-2">
        {renderInline(line)}
      </p>
    );
  }

  if (inCodeBlock && codeBlockLines.length) elements.push(<AssistantCodeBlock key="code-pending" code={codeBlockLines.join('\n')} lang={codeBlockLang} referenceMedia={referenceMedia} incomplete />);
  return elements;
}

// 行内解析器：处理 **粗体**、`行内代码`、*斜体*
function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    const codeIdx = remaining.indexOf('`');
    const boldIdx1 = remaining.indexOf('**');
    const boldIdx2 = remaining.indexOf('__');

    // 检测单星号斜体 (*斜体*)
    let italicIdx = -1;
    for (let k = 0; k < remaining.length; k++) {
      if (remaining[k] === '*' && remaining[k + 1] !== '*' && (k === 0 || remaining[k - 1] !== '*')) {
        const closeK = remaining.indexOf('*', k + 1);
        if (closeK !== -1 && remaining[closeK + 1] !== '*' && remaining[closeK - 1] !== '*') {
          italicIdx = k;
          break;
        }
      }
    }

    const validIndices = [
      codeIdx !== -1 ? { type: 'code', idx: codeIdx } : null,
      boldIdx1 !== -1 ? { type: 'bold_star', idx: boldIdx1 } : null,
      boldIdx2 !== -1 ? { type: 'bold_under', idx: boldIdx2 } : null,
      italicIdx !== -1 ? { type: 'italic', idx: italicIdx } : null,
    ].filter(Boolean) as { type: string; idx: number }[];

    if (validIndices.length === 0) {
      tokens.push(
        <span key={`txt-${keyIdx++}`}>
          {remaining.replace(/\*\*/g, '')}
        </span>
      );
      break;
    }

    validIndices.sort((a, b) => a.idx - b.idx);
    const earliest = validIndices[0];

    // 先把标记前面的普通文本加入 tokens
    if (earliest.idx > 0) {
      const plain = remaining.slice(0, earliest.idx);
      tokens.push(
        <span key={`txt-${keyIdx++}`}>
          {plain.replace(/\*\*/g, '')}
        </span>
      );
      remaining = remaining.slice(earliest.idx);
    }

    // 处理行内代码
    if (earliest.type === 'code') {
      const endIdx = remaining.indexOf('`', 1);
      if (endIdx !== -1) {
        const codeContent = remaining.slice(1, endIdx);
        tokens.push(
          <code 
            key={`code-${keyIdx++}`} 
            className="px-1 py-0.5 rounded bg-zinc-200/60 text-zinc-700 font-mono text-[11px] mx-0.5"
          >
            {codeContent}
          </code>
        );
        remaining = remaining.slice(endIdx + 1);
      } else {
        tokens.push(<span key={`txt-${keyIdx++}`}>`</span>);
        remaining = remaining.slice(1);
      }
    } else if (earliest.type === 'bold_star') {
      const endIdx = remaining.indexOf('**', 2);
      if (endIdx !== -1) {
        const boldContent = remaining.slice(2, endIdx);
        tokens.push(
          <strong 
            key={`bold-${keyIdx++}`} 
            className="font-semibold text-zinc-900"
          >
            {boldContent}
          </strong>
        );
        remaining = remaining.slice(endIdx + 2);
      } else {
        tokens.push(<span key={`txt-${keyIdx++}`}>**</span>);
        remaining = remaining.slice(2);
      }
    } else if (earliest.type === 'bold_under') {
      const endIdx = remaining.indexOf('__', 2);
      if (endIdx !== -1) {
        const boldContent = remaining.slice(2, endIdx);
        tokens.push(
          <strong 
            key={`bold-${keyIdx++}`} 
            className="font-semibold text-zinc-900"
          >
            {boldContent}
          </strong>
        );
        remaining = remaining.slice(endIdx + 2);
      } else {
        tokens.push(<span key={`txt-${keyIdx++}`}>__</span>);
        remaining = remaining.slice(2);
      }
    } else if (earliest.type === 'italic') {
      const endIdx = remaining.indexOf('*', 1);
      if (endIdx !== -1) {
        const italicContent = remaining.slice(1, endIdx);
        tokens.push(
          <em key={`em-${keyIdx++}`} className="italic text-slate-600 font-normal px-0.5">
            {italicContent}
          </em>
        );
        remaining = remaining.slice(endIdx + 1);
      } else {
        tokens.push(<span key={`txt-${keyIdx++}`}>*</span>);
        remaining = remaining.slice(1);
      }
    }
  }

  return <>{tokens}</>;
}

import { useState } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import { salesFocusClass, salesInputClass } from './salesSurface';

interface Props {
  title: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  rows?: number;
  note?: string;
  initiallyOpen?: boolean;
  copyable?: boolean;
}

export function SalesPromptDetails({ title, value, disabled, onChange, rows = 6, note, initiallyOpen, copyable }: Props) {
  const [copyStatus, setCopyStatus] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopyStatus('已复制完整提示词'); }
    catch { setCopyStatus('复制失败，请选中文本手动复制或重试'); }
  };
  return <details open={initiallyOpen} className="group/prompt rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
    <summary className={`cursor-pointer list-none rounded ${salesFocusClass}`}>
      <span className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-700 dark:text-slate-200">{title}</span><span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500"><span>{value.length} 字 · 展开编辑</span><ChevronDown className="h-3.5 w-3.5 transition group-open/prompt:rotate-180" /></span></span>
      <span className="mt-2 line-clamp-2 break-words text-xs leading-6 text-slate-500 dark:text-slate-400 group-open/prompt:hidden">{value || '暂无提示词'}</span>
    </summary>
    <div className="mt-3">
      {copyable && <div className="mb-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => { void copy(); }} className={`inline-flex items-center gap-1 rounded px-1 py-1 text-xs text-slate-500 ${salesFocusClass}`}><Copy className="h-3.5 w-3.5" />复制完整提示词</button><span role="status" className="text-xs text-slate-500">{copyStatus}</span></div>}
      <textarea aria-label={title} value={value} rows={rows} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${salesInputClass} mt-0 resize-y text-sm leading-7`} />
      {note && <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  </details>;
}

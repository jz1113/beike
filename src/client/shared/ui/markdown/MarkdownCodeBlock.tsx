import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, SourceCodeIcon, TextWrapIcon, Tick02Icon } from '@hugeicons/core-free-icons';

function displayLanguage(lang: string, incomplete: boolean) {
  const normalized = lang.trim().toLowerCase();
  const label = !normalized || normalized === 'text' || normalized === 'txt' || normalized === 'plain'
    ? '纯文本'
    : lang.trim();
  return incomplete ? `${label} …` : label;
}

export default function MarkdownCodeBlock({
  code,
  lang = '',
  incomplete = false,
  action,
}: {
  code: string;
  lang?: string;
  incomplete?: boolean;
  action?: ReactNode;
}) {
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyError('');
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError('复制失败，请手动选中复制');
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 dark:border-white/10 dark:bg-[#1c1c1f] dark:text-slate-100">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-1.5 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <HugeiconsIcon icon={SourceCodeIcon} size={13} className="shrink-0" />
          <span className="truncate text-[10px] font-bold tracking-wide">{displayLanguage(lang, incomplete)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {action}
          <button
            type="button"
            aria-label={wrap ? '关闭自动换行' : '开启自动换行'}
            aria-pressed={wrap}
            title={wrap ? '关闭自动换行' : '开启自动换行'}
            onClick={() => setWrap((current) => !current)}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              wrap
                ? 'bg-slate-200/80 text-slate-800 dark:bg-white/15 dark:text-slate-100'
                : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200'
            }`}
          >
            <HugeiconsIcon icon={TextWrapIcon} size={13} />
          </button>
          <button
            type="button"
            aria-label={copied ? '已复制' : '复制'}
            title={copied ? '已复制' : '复制'}
            onClick={() => void handleCopy()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={13} className={copied ? 'text-emerald-600 dark:text-emerald-400' : ''} />
          </button>
        </div>
      </div>
      {copyError ? <p role="alert" className="px-3 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">{copyError}</p> : null}
      <pre className={`px-3 py-2 font-mono text-[11.5px] leading-6 text-slate-800 select-text dark:text-slate-100 ${wrap ? 'break-words whitespace-pre-wrap' : 'overflow-x-auto whitespace-pre'}`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

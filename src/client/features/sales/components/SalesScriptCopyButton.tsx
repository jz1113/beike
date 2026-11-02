import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { salesGhostButtonClass } from './salesChrome';

export function SalesScriptCopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setStatus('copied'); }
    catch { setStatus('error'); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2000);
  };
  return <button type="button" onClick={() => { void copy(); }} className={salesGhostButtonClass} aria-live="polite">
    {status === 'copied' ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
    {status === 'copied' ? '已复制' : status === 'error' ? '复制失败，请重试' : label}
  </button>;
}

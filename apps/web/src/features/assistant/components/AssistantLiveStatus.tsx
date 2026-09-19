import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';

/** 仅展示服务端实际报告的阶段，不模拟搜索或工具执行。 */
export default function AssistantLiveStatus({ message }: { message?: string }) {
  const current = message || '正在等待模型响应…';
  const [startedAt] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    setHistory((previous) => previous.at(-1) === current ? previous : [...previous, current].slice(-4));
  }, [current]);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <div className="py-2 space-y-1.5 text-xs text-zinc-500" role="status" aria-live="polite">
    {history.filter((entry) => entry !== current).map((entry, index) => <div key={`${index}-${entry}`} className="flex items-center gap-2 text-zinc-400">
      <Check className="w-3.5 h-3.5 shrink-0" /><span>{entry}</span>
    </div>)}
    <div className="flex items-center gap-2">
      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
      <span className="flex-1">{current}</span>
      <span className="tabular-nums text-zinc-400" aria-hidden="true">{elapsed}s</span>
    </div>
    {elapsed >= 20 && <p className="pl-5 text-[11px] text-zinc-400">响应耗时较长，仍在等待；可随时停止本轮。</p>}
  </div>;
}

export function activityTarget(args?: string): string {
  if (!args) return '';
  try {
    const parsed = JSON.parse(args);
    for (const key of ['query', 'keyword', 'document_name', 'url', 'asset_id']) {
      if (typeof parsed[key] === 'string') return parsed[key].replace(/\s+/g, ' ').slice(0, 120);
    }
  } catch { /* 流式参数尚未接收完整 */ }
  return '';
}

import type { ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';

export function AssistantReplyFooter({ model, timestamp, copied, onCopy, canCopy = true, children }: {
  canCopy?: boolean; model?: string; timestamp: number; copied: boolean; onCopy: () => void; children?: ReactNode;
}) {
  const date = new Date(timestamp);
  const validTime = Number.isFinite(date.getTime());
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] leading-5 text-zinc-500">
    {model && <span className="inline-flex min-w-0 max-w-full items-center gap-1.5" title={model}>
      {model !== 'direct-collection' && getModelIcon(model, 'h-3.5 w-3.5 shrink-0 opacity-80')}
      <span className="truncate">{model === 'direct-collection' ? '直接采集 · 未调用 AI' : model.replace('-preview-thinking-high', '').replace('-preview', '')}</span>
    </span>}
    {canCopy && <button type="button" onClick={onCopy} aria-label={copied ? '已复制回答' : '复制回答'} title={copied ? '已复制' : '复制回答'}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>}
    {validTime && <time dateTime={date.toISOString()} title={date.toLocaleString('zh-CN')} className="shrink-0 tabular-nums text-zinc-400">
      {date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
    </time>}
    {children}
  </div>;
}

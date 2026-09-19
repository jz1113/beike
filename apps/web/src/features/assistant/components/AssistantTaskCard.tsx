import { useState } from 'react';
import type { AssistantTaskState } from '@beike/domain/assistant/taskPolicy';
import { Check, Loader2, CircleAlert, ChevronDown } from 'lucide-react';
import { proxyMediaUrl } from '@/shared/api/apiClient';

export default function AssistantTaskCard({ task }: { task: AssistantTaskState }) {
  const [expanded, setExpanded] = useState(false);
  const title = task.deliverable === 'storyboard' ? '图文方案' : task.deliverable === 'selection' ? '素材筛选' : '本次任务';
  return <div data-testid="assistant-task-card" className="w-full rounded-xl border border-slate-200 bg-white text-xs text-slate-600">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
      {task.status === 'completed' ? <Check className="h-3.5 w-3.5" /> : task.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleAlert className="h-3.5 w-3.5 text-amber-600" />}
      <span className="font-medium text-slate-800">{title}</span><span className="shrink-0">{task.mode === 'plan' ? '先规划' : '执行'}</span>
      {task.references.length > 0 && <span className="shrink-0 text-slate-400">{task.references.length} 张参考</span>}
      <span className="ml-auto truncate">{task.status === 'completed' ? '已完成' : task.stage}</span><ChevronDown className="h-3 w-3 shrink-0" />
    </button>
    {expanded && <div className="border-t border-slate-100 px-3 py-3">
      <p className="line-clamp-3 whitespace-pre-wrap break-words leading-5">{task.goal}</p>
      {task.totalReferences > 0 && <p className="my-2 leading-5">本轮引用 {task.references.length} / {task.totalReferences} 张{task.referenceScope === 'sample' ? ' · 按来源抽样，仅作为版式参考，不代表已看完图集' : task.referenceScope === 'explicit' ? ' · 用户指定编号' : ''}</p>}
      {task.references.length > 0 && <div className="flex flex-wrap gap-1.5">{task.references.map(ref => <a key={ref.number} href={proxyMediaUrl(ref.url)} target="_blank" rel="noreferrer" title={`${ref.label} · @图片${ref.number}`} className="relative block h-14 w-12 overflow-hidden rounded border border-slate-200"><img src={proxyMediaUrl(ref.url)} alt={ref.label} className="h-full w-full object-cover" /><span className="absolute bottom-0 left-0 bg-white/90 px-1">@{ref.number}</span></a>)}</div>}
    </div>}
  </div>;
}

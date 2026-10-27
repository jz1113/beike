import { useState } from 'react';
import { Brain, Search, Trash2 } from 'lucide-react';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import type { CategorySkillState } from '@shared/contracts/categorySkills';

interface Props {
  memory: CategorySkillState['memory'];
  groupNumbers?: Map<string, number>;
  busy: boolean;
  onPreview: (id: string) => void;
  onRun: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
}
const labels = { learned: '已记住', pending: '待读图', stale: '需重新学习', failed: '失败待重试', rejected: '不适用', holdout: '独立验证' };
const statusCount = (memory: CategorySkillState['memory'], value: string) => value === 'pending' ? Math.max(0, memory.pending - (memory.stale ?? 0) - (memory.failed ?? 0)) : value === 'stale' ? (memory.stale ?? 0) : value === 'failed' ? (memory.failed ?? 0) : value === 'learned' ? memory.learned : value === 'rejected' ? memory.rejected : value === 'holdout' ? memory.holdout : 0;
const inputClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5';

export function CategoryMemoryView({ memory, groupNumbers, busy, onPreview, onRun }: Props) {
  const [kind, setKind] = useState<'prefer' | 'avoid'>('prefer');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(12);
  const entries = memory.entries
    .map(entry => ({ entry, number: groupNumbers?.get(entry.groupId) }))
    .sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER))
    .filter(({ entry, number }) => (filter === 'all' || entry.state === filter)
      && [fullPromptGroupLabel(number), number === undefined ? '' : `组 ${number}`, entry.title, entry.reason, ...entry.rules, ...entry.conditions, ...entry.avoid].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.8fr)]">
    <section className="self-start rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#18191c]">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><Brain className="h-4 w-4 text-indigo-500" />教它记住</h4>
      <p className="mt-2 text-xs leading-5 text-slate-500">补充当前类目的绘图提示词写法、提示词架构偏好或生图避坑规则，整理技能时会自动融合。</p>
      <form className="mt-4 space-y-3" onSubmit={async event => {
        event.preventDefault();
        if (await onRun('remember', { kind, content })) setContent('');
      }}>
        <label className="flex items-center gap-3 text-xs">经验类型
          <select aria-label="经验类型" value={kind} disabled={busy} onChange={event => setKind(event.target.value as 'prefer' | 'avoid')} className={inputClass}>
            <option value="prefer">提示词写法与架构偏好</option><option value="avoid">生图提示词避坑</option>
          </select>
        </label>
        <textarea aria-label="类目经验" maxLength={500} value={content} disabled={busy} onChange={event => setContent(event.target.value)} placeholder="例如：生成种草图时，提示词按【@图片1主体结构+机位占比+握持接触+桌面道具+自然侧光+材质纹理】架构编写；手持镜头必须写明手指与镜头模组的遮挡关系。" className={`${inputClass} min-h-28 w-full resize-y leading-6`} />
        <div className="flex items-center justify-between text-xs text-slate-500"><span>{content.length}/500 · 最多 30 条</span>
          <button type="submit" disabled={busy || !content.trim() || memory.notes.length >= 30} className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white disabled:opacity-40">记住这条经验</button>
        </div>
      </form>
      <ul className="mt-4 space-y-3">{memory.notes.map(note => <li key={note.id} className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5">
        <div className="flex items-center justify-between"><span className={note.kind === 'avoid' ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-300'}>{note.kind === 'avoid' ? '生图提示词避坑' : '提示词写法与架构偏好'}</span>
          <button type="button" disabled={busy} aria-label={`移除经验：${note.content}`} onClick={() => void onRun('forget', { id: note.id })} className="rounded p-1 text-slate-400 hover:text-red-500 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <p className="mt-2 whitespace-pre-wrap leading-6">{note.content}</p>
      </li>)}</ul>
      {!memory.notes.length && <p className="mt-4 text-xs leading-5 text-slate-500">还没有手动经验，也可以先让它从参考图组中学习提示词构建方法与架构。</p>}
    </section>
    <section className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`flex min-w-0 flex-1 items-center gap-2 ${inputClass}`}><Search className="h-3.5 w-3.5 shrink-0 text-slate-400" /><input aria-label="搜索观察记忆" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} placeholder="搜索组号、提示词架构、写法或避坑" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
        <select aria-label="筛选记忆状态" value={filter} onChange={event => { setFilter(event.target.value); setLimit(12); }} className={inputClass}><option value="all">全部状态（{memory.entries.length}）</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}（{statusCount(memory, value)}）</option>)}</select>
      </div>
      <p className="mt-2 text-xs text-slate-500">显示 {Math.min(limit, entries.length)} / {entries.length} 组{entries.length !== memory.entries.length ? ` · 记忆列表共 ${memory.entries.length} 组` : ''}</p>
      <div className="mt-3 space-y-3">{entries.slice(0, limit).map(({ entry, number }) => <article key={entry.groupId} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#18191c]">
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => onPreview(entry.groupId)} className="max-w-full truncate text-left text-xs font-bold tabular-nums hover:text-indigo-500 hover:underline">{fullPromptGroupLabel(number)}</button>
          <span className={`rounded-md px-2 py-1 text-[11px] ${entry.state === 'learned' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : entry.state === 'rejected' || entry.state === 'stale' || entry.state === 'failed' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'}`}>{labels[entry.state]}</span>
        </div>
        {entry.state === 'learned' ? <div className="mt-3 space-y-3 text-xs leading-6">
          {entry.groupFramework && <div><p className="font-semibold text-indigo-600 dark:text-indigo-300">本组架构与展示递进</p><p className="mt-1 whitespace-pre-wrap">{entry.groupFramework}</p></div>}
          {!!entry.observations?.length && <details><summary className="cursor-pointer font-semibold text-indigo-600 dark:text-indigo-300">逐镜读图依据、构建槽位与示例</summary><div className="mt-3 space-y-4">{entry.observations.map(shot => <div key={shot.shot} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5"><p className="font-semibold">第 {shot.shot} 镜 · {shot.purpose || '视觉观察'}</p><p className="mt-2 whitespace-pre-wrap"><b>可见事实：</b>{shot.visual}</p><p className="mt-2 whitespace-pre-wrap"><b>迁移方法：</b>{shot.replacement}</p>{shot.promptTemplate && <p className="mt-2 whitespace-pre-wrap"><b>提示词架构：</b>{shot.promptTemplate}</p>}{shot.promptExample && <p className="mt-2 whitespace-pre-wrap"><b>完整示例：</b>{shot.promptExample}</p>}</div>)}</div></details>}
          {!!entry.differenceAxes?.length && <div><p className="font-semibold text-indigo-600 dark:text-indigo-300">同款多组如何做出差异</p><ul className="mt-1 list-disc pl-4">{entry.differenceAxes.map((axis, index) => <li key={index}>{axis}</li>)}</ul></div>}
          <div>
            <p className="font-semibold text-indigo-600 dark:text-indigo-300">绘图提示词构建方法</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700 dark:text-slate-200">{entry.rules.map((rule, i) => <li key={i}>{rule}</li>)}</ul>
          </div>
          {entry.conditions.length > 0 && (
            <div>
              <p className="font-semibold text-slate-600 dark:text-slate-300">提示词架构与四镜结构</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-500 dark:text-slate-400">{entry.conditions.map((cond, i) => <li key={i}>{cond}</li>)}</ul>
            </div>
          )}
          {entry.avoid.length > 0 && (
            <div>
              <p className="font-semibold text-amber-600 dark:text-amber-400">生图提示词避坑</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-700/90 dark:text-amber-300/90">{entry.avoid.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          )}
          <details><summary className="cursor-pointer text-slate-500">观察信息与重新学习</summary><p className="mt-2 text-slate-500">{entry.model} · {new Date(entry.createdAt).toLocaleString()}</p><button type="button" disabled={busy} onClick={() => void onRun('retry-sample', { id: entry.groupId })} className="mt-2 text-indigo-500 underline disabled:opacity-40">重置观察，下轮重新读图</button></details>
        </div> : <p className="mt-3 text-xs leading-6 text-slate-500">{entry.state === 'rejected' ? entry.reason : entry.state === 'holdout' ? '独立保留，用于成图对照；图片与评分均不参与技能编写。' : entry.reason || '尚未读图。将按每轮上限分批提炼绘图提示词构建方法与提示词架构。'}</p>}
        {entry.state === 'rejected' && <button type="button" disabled={busy} onClick={() => void onRun('retry-sample', { id: entry.groupId })} className="mt-2 text-xs text-indigo-500 underline disabled:opacity-40">归类确认后重新学习</button>}
      </article>)}</div>
      {!entries.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 dark:border-white/10">{memory.entries.length ? '没有匹配的记忆，试试其他搜索或状态。' : '先投喂同类目的四图组，提炼的绘图提示词构建方法与架构会保存在这里。'}</p>}
      {entries.length > limit && <button type="button" onClick={() => setLimit(value => value + 12)} className="mt-4 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-500 dark:border-white/10">查看更多 · 还有 {entries.length - limit} 组</button>}
    </section>
  </div>;
}

import { useState } from 'react';
import { Sparkles, RefreshCw, ArrowUpRight, History, Images, Brain, Plus, ArrowRight, Settings2 } from 'lucide-react';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { useCategorySkill } from '../../hooks/useCategorySkill';
import { canConsolidate, categoryNextStep } from '../../model/categoryAgent';
import { CategoryMemoryView } from './CategoryMemoryView';
import { CategorySkillVersionCard } from './CategorySkillVersionCard';

export type CategorySkillTab = 'references' | 'memory' | 'skill' | 'history';
interface Props {
  folderId: string; tab: CategorySkillTab; onTab: (tab: CategorySkillTab) => void;
  onPreview: (id: string) => void; onUseReference: (id: string) => void; onFeed: () => void;
}
const button = 'rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5';
const tabs = [{ id: 'references', label: '参考图库', icon: Images }, { id: 'memory', label: '学习记忆', icon: Brain }, { id: 'skill', label: '技能版本', icon: Sparkles }, { id: 'history', label: '进化记录', icon: History }] as const;
const selectClass = 'rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-white/10 dark:bg-[#22232a]';

export function CategorySkillPanel({ folderId, tab, onTab, onPreview, onUseReference, onFeed }: Props) {
  const [models] = useState(loadSystemConfiguredModels);
  const [modelId, setModelId] = useState(models.selectedVisionModel);
  const [maxNewSamples, setMaxNewSamples] = useState(5);
  const { state, busy, error, notice, refresh, run } = useCategorySkill(folderId, modelId, maxNewSamples);
  const scope = state?.scope;
  const active = state?.versions.find(version => version.id === scope?.activeVersionId);
  const trial = state?.versions.find(version => version.id === scope?.trialVersionId);
  const running = busy || Boolean(scope?.runningToken);
  const next = state ? categoryNextStep(state) : null;
  const configure = (patch: Record<string, unknown>) => scope && void run('configure', { minSamples: scope.minSamples, autoAnalyze: scope.autoAnalyze, autoPublish: scope.autoPublish, ...patch });
  const canLearn = state && (state.pendingSamples > 0 || (canConsolidate(state) && state.needsConsolidation));
  const candidates = state?.versions.filter(version => version.id !== active?.id && version.id !== trial?.id && version.parentVersionId === scope?.activeVersionId).slice(0, 3) || [];
  const versionCard = (version: NonNullable<typeof active>) => state && <CategorySkillVersionCard key={version.id} version={version} state={state} busy={running} onPreview={onPreview} onRun={run} />;
  return <section aria-label="类目智能体" className="mb-5 text-slate-800 dark:text-slate-100">
    <div className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-white dark:border-indigo-400/20 dark:bg-[#18191c]">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-medium tracking-wider text-indigo-500">类目智能体 · 每个二级类目独立记忆</p>
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Brain className="h-5 w-5 shrink-0 text-indigo-500" />{state?.dataset.folder.name || '正在读取类目'}<span className="ml-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">{trial ? '试用技能中' : active ? '正式技能生效' : '基础保真规则'}</span></h3>
          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">投喂图片，记住方法，用成图反馈修正下一版。原始参考决定画面，类目技能帮助换品和保真。</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={running} onClick={onFeed} className={`${button} flex items-center gap-1.5`}><Plus className="h-3.5 w-3.5" />投喂参考图</button>
          <button type="button" disabled={running || !modelId || !canLearn} onClick={() => void run('learn')} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" />{running ? '学习处理中' : state?.pendingSamples ? '读图并更新技能' : '整理新技能'}</button>
          <button type="button" onClick={() => void refresh()} aria-label="刷新类目记忆" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-4 md:grid-cols-4">
        {[
          { label: '参考图组', value: state?.dataset.samples.length, hint: '去重后原图完整', tab: 'references' },
          { label: '已记住', value: state?.memory.learned, hint: `${state?.memory.pending ?? '—'} 套待学习`, tab: 'memory' },
          { label: '独立验证', value: state?.memory.holdout, hint: '不参与编写技能', tab: 'skill' },
          { label: '成图反馈', value: state?.feedbackCount, hint: `${state?.versions.length ?? 0} 个技能版本`, tab: 'history' },
        ].map(metric => <button key={metric.label} type="button" onClick={() => onTab(metric.tab as CategorySkillTab)} className="rounded-xl bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-indigo-50 dark:bg-white/[0.025] dark:hover:bg-indigo-500/10">
          <span className="text-[11px] text-slate-500">{metric.label}</span><strong className="ml-3 text-xl font-semibold tabular-nums">{metric.value ?? '—'}</strong><span className="mt-1 block text-[11px] text-slate-400">{metric.hint}</span>
        </button>)}
      </div>
      {next && <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-indigo-50/70 px-3 py-2.5 text-xs dark:bg-indigo-500/[0.07]">
        <span className="flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-300"><ArrowRight className="h-3.5 w-3.5" />{next.label}</span><span className="leading-5 text-slate-500 dark:text-slate-400">{next.detail}</span>
      </div>}
      <details className="mx-5 mb-4 text-xs">
        <summary className="flex w-fit cursor-pointer items-center gap-1.5 text-slate-500"><Settings2 className="h-3.5 w-3.5" />学习设置与调用预算</summary>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <label className="flex items-center gap-2">读图模型<select aria-label="读图模型" value={modelId} disabled={running} onChange={event => setModelId(event.target.value)} className={`${selectClass} max-w-64`}>{!models.availableVisionModels.length && <option value="">请先在设置中配置视觉模型</option>}{models.availableVisionModels.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}</select></label>
          <label className="flex items-center gap-2">每轮最多读取<select aria-label="每轮读图预算" value={maxNewSamples} disabled={running} onChange={event => setMaxNewSamples(Number(event.target.value))} className={selectClass}>{[1, 5, 10].map(count => <option key={count} value={count}>{count} 套</option>)}</select></label>
          <label className="flex items-center gap-2">整理技能门槛<select aria-label="整理技能门槛" value={scope?.minSamples || 20} disabled={running || !scope} onChange={event => configure({ minSamples: Number(event.target.value) })} className={selectClass}>{[20, 25, 30].map(count => <option key={count} value={count}>{count} 套</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={scope?.autoAnalyze || false} disabled={running || !scope} onChange={event => configure({ autoAnalyze: event.target.checked })} />有新资料时自动学一轮</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={scope?.autoPublish || false} disabled={running || !scope} onChange={event => configure({ autoPublish: event.target.checked })} />对照通过后自动升级</label>
          <p className="w-full leading-6 text-slate-500">本轮最多 {Math.min(state?.pendingSamples ?? maxNewSamples, maxNewSamples)} 次逐组读图，满足门槛后另有 1 次技能整理，按模型配置计费。门槛中约八成须为已学样本，独立验证至少 3 套。自动学习仅在此页面打开时工作，同一批资料最多自动一轮；剩余内容可手动继续。失败后保留观察，手动重试。</p>
          <button type="button" disabled={running || !modelId || !state?.pendingSamples} onClick={() => void run('observe')} className={button}>只读图记忆，暂不整理技能</button>
        </div>
      </details>
      <nav aria-label="类目学习导航" className="flex overflow-x-auto border-t border-slate-100 px-3 pt-1 dark:border-white/5">{tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onTab(id)} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium ${tab === id ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav>
    </div>
    {error && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-6 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">重新读取状态</button></div>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs leading-6 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{notice}</p>}
    {tab === 'references' && state && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] leading-6 text-slate-500">
      <p>本类目共 {state.dataset.total} 套 · 有效 {state.dataset.samples.length} 套 · 不完整或不适用 {state.dataset.excluded + state.memory.rejected} 套 · 来源重复 {state.dataset.duplicates} 套</p>
      <button type="button" onClick={() => onTab('memory')} className="text-indigo-500 hover:underline">查看学到了什么 →</button>
    </div>}
    {tab === 'memory' && state && <CategoryMemoryView memory={state.memory} busy={running} onPreview={onPreview} onRun={run} />}
    {tab === 'skill' && state && <div className="mt-4 space-y-4">
      {trial && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50 p-4 text-xs leading-6 dark:bg-indigo-500/10"><span>后续新分析正在试用候选技能。固定同款商品、同组参考和相同生图设置，分别生成新旧版成图并评分。</span><button type="button" disabled={running} onClick={() => void run('baseline')} className={button}>切回正式版做对照</button></div>}
      {active && <div className="flex justify-end"><button type="button" disabled={running} onClick={() => void run('rollback')} className={button}>回滚上一正式版本</button></div>}
      {trial && versionCard(trial)}{active && versionCard(active)}{candidates.map(versionCard)}
      {!state.versions.length && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm leading-7 text-slate-500 dark:border-white/10"><Sparkles className="mx-auto mb-3 h-6 w-6 text-indigo-400" />还没有候选技能，先积累图片观察。<p className="text-xs">已记住 {state.memory.learned} 套，独立验证 {state.memory.holdout} 套，整理门槛 {scope?.minSamples} 套。暂时使用基础商品保真规则。</p><button type="button" onClick={() => onTab('memory')} className="mt-3 text-xs text-indigo-500 underline">查看学习记忆</button></div>}
      <details className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-white/10 dark:bg-[#18191c]"><summary className="cursor-pointer font-medium">独立验证图组 · 用实际成图决定是否升级</summary>
        <p className="my-3 leading-6 text-slate-500">至少完成 3 款商品的同条件新旧版对照，并在成图的“评分反馈”填写商品保真、构图还原、生活真实感和一致性。只有无退步且有提升，才可升级。</p>
        <div className="space-y-2">{state.dataset.samples.filter(sample => sample.role === 'holdout').map(sample => <div key={sample.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5"><button type="button" className="truncate text-left hover:underline" onClick={() => onPreview(sample.id)}>{sample.title || sample.id}</button><button type="button" onClick={() => onUseReference(sample.id)} className="flex shrink-0 items-center gap-1 text-indigo-500">载入工坊对照<ArrowUpRight className="h-3 w-3" /></button></div>)}</div>
        {!state.memory.holdout && <p className="text-slate-500">还没有独立验证图组，继续投喂更多同类目原图。</p>}
      </details>
    </div>}
    {tab === 'history' && state && <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
      <div className="space-y-4">{state.versions.map(versionCard)}{!state.versions.length && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-xs text-slate-500 dark:border-white/10">尚未整理技能版本，读图记忆和手动经验会先保存在当前类目。</p>}</div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#18191c]"><h4 className="mb-4 text-sm font-semibold">最近的学习与调整</h4><ol className="space-y-4 border-l border-slate-200 pl-4 dark:border-white/10">{state.events.map(event => <li key={event.id} className="text-xs leading-6"><time className="text-[11px] text-slate-400">{new Date(event.createdAt).toLocaleString()}</time><p>{event.detail}</p></li>)}</ol>{!state.events.length && <p className="text-xs leading-6 text-slate-500">投喂参考、记住经验、试用与升级后，记录会显示在这里。</p>}</div>
    </div>}
  </section>;
}

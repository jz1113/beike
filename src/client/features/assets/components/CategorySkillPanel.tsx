import { useState } from 'react';
import { Sparkles, RefreshCw, ArrowUpRight, History, Layers, ShieldCheck } from 'lucide-react';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import type { CategorySkillVersion } from '@shared/contracts/categorySkills';
import { useCategorySkill } from '../hooks/useCategorySkill';

export type CategorySkillTab = 'references' | 'skill' | 'history';
interface Props {
  folderId: string; tab: CategorySkillTab; onTab: (tab: CategorySkillTab) => void;
  onPreview: (id: string) => void; onUseReference: (id: string) => void;
}
const button = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5';
const tabs = [{ id: 'references', label: '参考图组', icon: Layers }, { id: 'skill', label: '当前技能', icon: Sparkles }, { id: 'history', label: '优化记录', icon: History }] as const;

export function CategorySkillPanel({ folderId, tab, onTab, onPreview, onUseReference }: Props) {
  const [models] = useState(loadSystemConfiguredModels);
  const [modelId, setModelId] = useState(models.selectedVisionModel);
  const { state, busy, error, refresh, run } = useCategorySkill(folderId, modelId);
  const scope = state?.scope;
  const active = state?.versions.find(version => version.id === scope?.activeVersionId);
  const trial = state?.versions.find(version => version.id === scope?.trialVersionId);
  const running = busy || Boolean(scope?.runningToken);
  const configure = (patch: Record<string, unknown>) => scope && void run('configure', { minSamples: scope.minSamples, autoAnalyze: scope.autoAnalyze, autoPublish: scope.autoPublish, ...patch });
  const candidate = (version: CategorySkillVersion) => {
    const validation = state?.validations[version.id];
    const current = version.id === scope?.activeVersionId;
    const trying = version.id === scope?.trialVersionId;
    const compatible = version.parentVersionId === scope?.activeVersionId;
    return <article key={version.id} className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold">{current ? '正式版本' : trying ? '试用中' : compatible ? '候选版本' : '历史版本'} · {version.id.slice(0, 8)}</span>
        <time className="text-[11px] text-slate-500">{new Date(version.createdAt).toLocaleString()}</time>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-600 dark:text-slate-300">{version.summary}</p>
      <p className="mt-2 text-[11px] text-slate-500">{version.manifest.samples.filter(sample => sample.role === 'training').length} 套提炼样本 · {version.manifest.samples.filter(sample => sample.role === 'holdout').length} 套留出参考 · {version.model}</p>
      <details className="mt-3 text-xs"><summary className="cursor-pointer text-indigo-600 dark:text-indigo-300">完整规则与样本依据</summary>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-100 p-3 font-sans leading-6 dark:bg-black/20">{version.promptSnippet}</pre>
        <ul className="mt-3 space-y-2">{version.manifest.ruleEvidence?.map((evidence, index) => <li key={index} className="border-l-2 border-indigo-400 pl-3 leading-5">
          {evidence.rule}<span className="block text-slate-500">适用：{evidence.condition}</span>
          <button type="button" onClick={() => onPreview(evidence.groupId)} className="text-indigo-500 underline">查看来源图组</button>
        </li>)}</ul>
      </details>
      {!current && compatible && <>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{validation?.reason}（已配对 {validation?.pairs || 0} 镜 / {validation?.products || 0} 款商品）</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={running || trying} onClick={() => void run('trial', { versionId: version.id })} className={button}>{trying ? '后续分析正在试用' : '试用此版本'}</button>
          <button type="button" disabled={running || !validation?.passed} onClick={() => void run('publish', { versionId: version.id })} className={`${button} text-indigo-600`}>通过验证后升级</button>
        </div>
      </>}
    </article>;
  };
  return <section aria-label="商品细分技能" className="mb-5 text-slate-800 dark:text-slate-100">
    <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50/80 to-white/60 px-4 py-4 dark:border-indigo-400/15 dark:from-indigo-500/[0.08] dark:to-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-indigo-500" />{state?.dataset.folder.name || '商品细分'} · 素材与技能</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">原图逐镜保留，技能持续积累换品方法。{trial ? '当前试用候选版' : active ? '当前使用正式版' : '当前使用基础保真规则'}。</p></div>
        <div className="flex items-center gap-3 text-xs"><span>{state?.dataset.samples.length ?? '—'} / {scope?.minSamples || 20} 套有效样本</span>
          <button type="button" disabled={running} onClick={() => void refresh()} aria-label="刷新细分技能" className="rounded-lg p-2 hover:bg-white/50"><RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} /></button></div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-indigo-100 dark:bg-white/5"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, (state?.dataset.samples.length || 0) / (scope?.minSamples || 20) * 100)}%` }} /></div>
      <nav aria-label="细分素材与技能" className="mt-4 flex gap-1">{tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onTab(id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${tab === id ? 'bg-white text-indigo-700 shadow-sm dark:bg-white/10 dark:text-indigo-200' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-white/5'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
    {scope?.error && <p role="status" className="mt-3 text-xs text-amber-600">{scope.error}</p>}
    {running && <p role="status" className="mt-3 text-xs text-indigo-500">正在逐组观察和整理规则，已完成 {scope?.progress || 0} 套。当前分析需保持页面打开，已完成观察会保留。</p>}
    {tab === 'references' && state && <p className="mt-3 text-[11px] leading-5 text-slate-500">本细分共 {state.dataset.total} 套：有效 {state.dataset.samples.length} 套，排除不完整或不适用 {state.dataset.excluded} 套，来源重复 {state.dataset.duplicates} 套。图组上传、反推和归档继续使用上方入口。</p>}
    {tab === 'skill' && state && <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-slate-200 p-4 text-xs dark:border-white/10">
        <label className="flex items-center gap-2">分析模型<select value={modelId} disabled={running} onChange={event => setModelId(event.target.value)} className="max-w-56 rounded-md bg-slate-100 px-2 py-1.5 dark:bg-white/10">{models.availableVisionModels.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}</select></label>
        <label className="flex items-center gap-2">首次整体提炼<select value={scope?.minSamples} disabled={running} onChange={event => configure({ minSamples: Number(event.target.value) })} className="rounded-md bg-slate-100 px-2 py-1.5 dark:bg-white/10">{[20, 25, 30].map(count => <option key={count} value={count}>{count} 套</option>)}</select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={scope?.autoAnalyze || false} disabled={running} onChange={event => configure({ autoAnalyze: event.target.checked })} />自动增量提炼</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={scope?.autoPublish || false} disabled={running} onChange={event => configure({ autoPublish: event.target.checked })} />实测通过后自动升级</label>
        <button type="button" disabled={running || !modelId || state.dataset.samples.length < (scope?.minSamples || 20) || (state.versions.length > 0 && !state.pendingSamples && !state.feedbackChanged)} onClick={() => void run('learn')} className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-40">{state.versions.length ? '整理新增样本与反馈' : '提炼首版技能'}</button>
        <p className="w-full leading-5 text-slate-500">开启后，在此细分页面打开期间，达到阈值会调用所选模型；后续每新增 5 套待学习样本或有新的学习组反馈再提炼，模型按配置计费。留出图组独立用于验证。</p>
      </div>
      {trial && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50 p-4 text-xs dark:bg-indigo-500/10"><span>后续分析试用 {trial.id.slice(0, 8)}。完成新旧版的同商品、同参考对照后，在成图上评分。</span><button type="button" disabled={running} onClick={() => void run('baseline')} className={button}>切回正式版做对照</button></div>}
      {active && <div className="flex justify-end"><button type="button" disabled={running} onClick={() => void run('rollback')} className={button}>回滚上一正式版本</button></div>}
      {trial && candidate(trial)}{active && candidate(active)}
      {state.versions.filter(version => version.id !== active?.id && version.id !== trial?.id && version.parentVersionId === scope?.activeVersionId).slice(0, 3).map(candidate)}
      {!state.versions.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm leading-6 text-slate-500 dark:border-white/10">继续投喂同一商品细分的完整四图组。满 {scope?.minSamples} 套后，逐组看图、保留不同风格的适用条件，整理成可追溯的候选技能。</p>}
      <details className="rounded-xl border border-slate-200 p-4 text-xs dark:border-white/10"><summary className="cursor-pointer font-medium">留出图组 · 用于实际成图对照</summary>
        <p className="my-3 leading-5 text-slate-500">选同一款商品、同一图组和相同生图设置，分别用正式版与候选版重新分析并生成；至少完成 3 款商品的四项评分。评分位于工坊成图的“评分反馈”。</p>
        <div className="space-y-2">{state.dataset.samples.filter(sample => sample.role === 'holdout').map(sample => <div key={sample.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5"><button type="button" className="truncate text-left hover:underline" onClick={() => onPreview(sample.id)}>{sample.title || sample.id}</button><button type="button" onClick={() => onUseReference(sample.id)} className="flex shrink-0 items-center gap-1 text-indigo-500">载入工坊对照<ArrowUpRight className="h-3 w-3" /></button></div>)}</div>
      </details>
    </div>}
    {tab === 'history' && state && <div className="mt-4 space-y-4">
      <p className="text-xs text-slate-500">已记录 {state.feedbackCount} 次成图反馈。以下展示最近的版本和优化记录。</p>
      {state.versions.map(candidate)}
      <ol className="space-y-3 border-l border-slate-200 pl-5 dark:border-white/10">{state.events.map(event => <li key={event.id} className="text-xs leading-5"><time className="text-slate-500">{new Date(event.createdAt).toLocaleString()}</time><p>{event.detail}</p></li>)}</ol>
      {!state.events.length && <p className="p-8 text-center text-sm text-slate-500">还没有优化记录。先在本细分积累参考图组。</p>}
    </div>}
  </section>;
}

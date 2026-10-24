import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, ArrowUpRight, Images, Brain, Settings2 } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { useCategorySkill } from '../../hooks/useCategorySkill';
import { canConsolidate, categoryNextStep } from '../../model/categoryAgent';
import { CategoryMemoryView } from './CategoryMemoryView';
import { CategorySkillVersionCard } from './CategorySkillVersionCard';

export type CategorySkillTab = 'references' | 'memory' | 'skill';
interface Props {
  folderId: string;
  tab: CategorySkillTab;
  onTab: (tab: CategorySkillTab) => void;
  groupNumbers?: Map<string, number>;
  onPreview: (id: string) => void;
  onUseReference: (id: string) => void;
}
const button = 'rounded-xl border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] cursor-pointer';
const selectClass = 'h-8 rounded-xl border border-slate-200/90 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none transition-colors focus:border-indigo-400 dark:border-white/10 dark:bg-[#1B1C20] dark:text-slate-100';

export function CategorySkillPanel({ folderId, tab, onTab, groupNumbers, onPreview, onUseReference }: Props) {
  const [models, setModels] = useState(loadSystemConfiguredModels);
  const [modelId, setModelId] = useState(models.selectedVisionModel);
  const [maxNewSamples, setMaxNewSamples] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    const sync = () => {
      const nextModels = loadSystemConfiguredModels();
      setModels(nextModels);
      setModelId(prev => nextModels.availableVisionModels.some(m => m.id === prev) ? prev : nextModels.selectedVisionModel);
    };
    window.addEventListener('models_updated', sync);
    window.addEventListener('modality_models_updated', sync);
    return () => {
      window.removeEventListener('models_updated', sync);
      window.removeEventListener('modality_models_updated', sync);
    };
  }, []);
  const { state, busy, error, notice, refresh, run } = useCategorySkill(folderId, modelId, maxNewSamples);
  const scope = state?.scope;
  const active = state?.versions.find(version => version.id === scope?.activeVersionId);
  const trial = state?.versions.find(version => version.id === scope?.trialVersionId);
  const running = busy || Boolean(scope?.runningToken);
  const next = state ? categoryNextStep(state) : null;
  const configure = (patch: Record<string, unknown>) => scope && void run('configure', { minSamples: scope.minSamples, autoAnalyze: scope.autoAnalyze, autoPublish: scope.autoPublish, ...patch });
  const canLearn = state && (state.pendingSamples > 0 || (canConsolidate(state) && state.needsConsolidation));
  const candidates = state?.versions.filter(version => version.id !== active?.id && version.id !== trial?.id && version.parentVersionId === scope?.activeVersionId).slice(0, 3) || [];
  const versionCard = (version: NonNullable<typeof active>) => state && <CategorySkillVersionCard key={version.id} version={version} state={state} groupNumbers={groupNumbers} busy={running} onPreview={onPreview} onRun={run} />;
  const tabItems: Array<{ id: CategorySkillTab; label: string; icon: typeof Images; count?: number }> = [
    { id: 'references', label: '参考图库', icon: Images, count: groupNumbers?.size ?? state?.dataset.samples.length },
    { id: 'memory', label: '学习记忆', icon: Brain, count: state ? state.memory.learned + state.memory.notes.length : undefined },
    { id: 'skill', label: '技能版本', icon: Sparkles, count: state?.versions.length },
  ];

  return <section aria-label="类目智能体" className="relative z-20 mb-3 text-slate-800 dark:text-slate-100">
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xs dark:border-white/[0.08] dark:bg-[#17181C]/95">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <nav aria-label="类目学习导航" className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-white/[0.05]">
            {tabItems.map(({ id, label, icon: Icon, count }) => (
              <button
                type="button"
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => onTab(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  tab === id
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-[#25262B] dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {typeof count === 'number' && (
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${
                    tab === id ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300' : 'bg-slate-200/70 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'
                  }`}>{count}</span>
                )}
              </button>
            ))}
          </nav>

          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${trial ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'}`}>
            {trial ? '试用技能中' : active ? '正式技能生效' : '基础保真规则'}
          </span>

          {(running || scope?.error) && next && (
            <span className={`truncate max-w-[320px] text-xs ${scope?.error ? 'text-amber-600 dark:text-amber-300' : 'text-indigo-600 dark:text-indigo-300'}`} title={next.detail}>
              {next.detail}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={running || !modelId || !canLearn} onClick={() => void run('learn')} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{running ? '学习处理中' : state?.pendingSamples ? `读图更新技能 (${state.pendingSamples})` : '整理新技能'}</span>
          </button>
          <button type="button" onClick={() => setShowSettings(prev => !prev)} aria-expanded={showSettings} className={`${button} flex items-center gap-1.5 ${showSettings ? 'border-indigo-400/50 bg-indigo-50/60 text-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-300' : ''}`}>
            <Settings2 className="h-3.5 w-3.5" />
            <span>设置</span>
          </button>
          <button type="button" onClick={() => void refresh()} aria-label="刷新类目记忆" className="rounded-xl border border-slate-200/80 p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer"><RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {showSettings && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300">读图模型</span>
              <div className="w-52 sm:w-60">
                <ConfiguredModelPicker
                  ariaLabel="读图模型"
                  options={models.availableVisionModels}
                  value={modelId}
                  onChange={setModelId}
                  disabled={running}
                  modalityKind="chat"
                  isUp={false}
                  emptyLabel="请先在设置中配置视觉模型"
                />
              </div>
            </div>
            <label className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <span>单轮上限</span>
              <select aria-label="每轮读图预算" value={maxNewSamples} disabled={running} onChange={event => setMaxNewSamples(Number(event.target.value))} className={selectClass}>
                {[1, 5, 10].map(count => <option key={count} value={count}>{count} 套</option>)}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={scope?.autoAnalyze || false} disabled={running || !scope} onChange={event => configure({ autoAnalyze: event.target.checked })} className="h-3.5 w-3.5 accent-indigo-600" />
              <span>新图自动学习</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={scope?.autoPublish || false} disabled={running || !scope} onChange={event => configure({ autoPublish: event.target.checked })} className="h-3.5 w-3.5 accent-indigo-600" />
              <span>对照通过自动升级</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={running || !modelId || !state?.pendingSamples} onClick={() => void run('observe')} className={button}>仅读图记忆</button>
            {state && canConsolidate(state) && <button type="button" disabled={running || !modelId} onClick={() => void run('consolidate')} className={button}>立即整理技能</button>}
          </div>
        </div>
      )}
    </div>
    {error && <div role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs leading-5 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">重新读取状态</button></div>}
    {notice && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs leading-5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{notice}</p>}
    {tab === 'memory' && state && <CategoryMemoryView memory={state.memory} groupNumbers={groupNumbers} busy={running} onPreview={onPreview} onRun={run} />}
    {tab === 'skill' && state && <div className="mt-4 space-y-4">
      {trial && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50 p-4 text-xs leading-6 dark:bg-indigo-500/10"><span>后续新分析正在试用候选技能。固定同款商品、同组参考和相同生图设置，分别生成新旧版成图并评分。</span><button type="button" disabled={running} onClick={() => void run('baseline')} className={button}>切回正式版做对照</button></div>}
      {active && <div className="flex justify-end"><button type="button" disabled={running} onClick={() => void run('rollback')} className={button}>回滚上一正式版本</button></div>}
      {trial && versionCard(trial)}{active && versionCard(active)}{candidates.map(versionCard)}
      {!state.versions.length && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm leading-7 text-slate-500 dark:border-white/10"><Sparkles className="mx-auto mb-3 h-6 w-6 text-indigo-400" />还没有候选技能，先积累图片观察。<p className="text-xs">已记住 {state.memory.learned} 套，经验 {state.memory.notes.length} 条。暂时使用基础商品保真规则。</p><button type="button" onClick={() => onTab('memory')} className="mt-3 text-xs text-indigo-500 underline">查看学习记忆</button></div>}
      <details className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-white/10 dark:bg-[#18191c]"><summary className="cursor-pointer font-medium">可选：用实际成图对比技能</summary>
        <p className="my-3 leading-6 text-slate-500">可以直接启用技能。需要比较效果时，固定商品、参考和生成设置，分别生成新旧版图片并评分。</p>
        <div className="space-y-2">{state.dataset.samples.map((sample, index) => <div key={sample.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5"><button type="button" className="truncate text-left font-semibold tabular-nums hover:underline" onClick={() => onPreview(sample.id)}>{fullPromptGroupLabel(groupNumbers?.get(sample.id) ?? index + 1)}</button><button type="button" onClick={() => onUseReference(sample.id)} className="flex shrink-0 items-center gap-1 text-indigo-500 dark:text-indigo-400">载入工坊对照<ArrowUpRight className="h-3 w-3" /></button></div>)}</div>
      </details>
    </div>}
  </section>;
}

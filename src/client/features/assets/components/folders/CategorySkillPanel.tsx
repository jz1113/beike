import { useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw, Images, Brain, Settings2 } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { useCategorySkill } from '../../hooks/useCategorySkill';
import { canConsolidate, categoryNextStep, categoryReadCount } from '../../model/categoryAgent';
import { CategoryLearningSummary } from './CategoryLearningSummary';
import { CategoryMemoryView } from './CategoryMemoryView';
import { CategorySkillVersionCard } from './CategorySkillVersionCard';

export type CategorySkillTab = 'references' | 'memory' | 'skill';
interface Props {
  folderId: string;
  tab: CategorySkillTab;
  onTab: (tab: CategorySkillTab) => void;
  groupNumbers?: Map<string, number>;
  onPreview: (id: string) => void;
  autoLearn?: boolean;
  showReferences?: boolean;
}
const button = 'rounded-xl border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] cursor-pointer';
const selectClass = 'h-8 rounded-xl border border-slate-200/90 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none transition-colors focus:border-indigo-400 dark:border-white/10 dark:bg-[#1B1C20] dark:text-slate-100';

export function CategorySkillPanel({ folderId, tab, onTab, groupNumbers, onPreview, autoLearn = true, showReferences = true }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const selectTab = (next: CategorySkillTab) => {
    if (next !== tab && panelRef.current?.querySelector('[data-skill-dirty="true"]') && !window.confirm('技能修改尚未保存，确定切换吗？')) return;
    onTab(next);
  };
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
  const { state, busy, error, notice, refresh, run } = useCategorySkill(folderId, modelId, maxNewSamples, autoLearn);
  const scope = state?.scope;
  const active = state?.versions.find(version => version.id === scope?.activeVersionId);
  const trial = state?.versions.find(version => version.id === scope?.trialVersionId);
  const running = busy || Boolean(scope?.runningToken);
  const next = state ? categoryNextStep(state) : null;
  const configure = (patch: Record<string, unknown>) => scope && void run('configure', { minSamples: scope.minSamples, autoAnalyze: scope.autoAnalyze, autoPublish: scope.autoPublish, ...patch });
  const roundCount = state ? categoryReadCount(state, maxNewSamples) : 0;
  const canLearn = state && (roundCount > 0 || (canConsolidate(state) && state.needsConsolidation));
  const candidates = state?.versions.filter(version => version.id !== active?.id && version.id !== trial?.id && version.parentVersionId === scope?.activeVersionId).slice(0, 3) || [];
  const shown = new Set([active?.id, trial?.id, ...candidates.map(version => version.id)]);
  const history = state?.versions.filter(version => !shown.has(version.id)) || [];
  const versionCard = (version: NonNullable<typeof active>) => state && <CategorySkillVersionCard key={version.id} version={version} state={state} groupNumbers={groupNumbers} busy={running} onPreview={onPreview} onRun={run} />;
  const tabItems: Array<{ id: CategorySkillTab; label: string; icon: typeof Images; count?: number }> = [
    { id: 'references', label: '参考图库', icon: Images, count: state?.dataset.total },
    { id: 'memory', label: '偏好与记忆', icon: Brain, count: state?.memory.entries.length },
    { id: 'skill', label: '技能正文与版本', icon: Sparkles, count: state?.versions.length },
  ];

  return <section ref={panelRef} aria-label="类目智能体" className="relative z-20 mb-3 text-slate-800 dark:text-slate-100">
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xs dark:border-white/[0.08] dark:bg-[#17181C]/95">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <nav aria-label="类目学习导航" className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-white/[0.05]">
            {tabItems.filter(item => showReferences || item.id !== 'references').map(({ id, label, icon: Icon, count }) => (
              <button
                type="button"
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => selectTab(id)}
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

          {next && (
            <span className={`max-w-[420px] truncate text-xs ${scope?.error ? 'text-amber-600 dark:text-amber-300' : running ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`} title={next.detail}>
              {next.label} · {next.detail}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={running || !modelId || !canLearn} onClick={() => void run('learn')} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{running ? '后台学习处理中' : scope?.error ? '重试未完成组' : roundCount ? `读取新增/变更组 · 本轮 ${roundCount} 组` : '整理新技能'}</span>
          </button>
          <button type="button" onClick={() => setShowSettings(prev => !prev)} aria-expanded={showSettings} className={`${button} flex items-center gap-1.5 ${showSettings ? 'border-indigo-400/50 bg-indigo-50/60 text-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-300' : ''}`}>
            <Settings2 className="h-3.5 w-3.5" />
            <span>设置</span>
          </button>
          <button type="button" onClick={() => void refresh()} aria-label="刷新类目记忆" className="rounded-xl border border-slate-200/80 p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer"><RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {state && <CategoryLearningSummary state={state} maxNewSamples={maxNewSamples} />}
      {showSettings && (
        <div className="asset-skill-settings-panel" aria-label="技能学习设置">
          <header className="asset-skill-settings-header">
            <div>
              <div className="asset-skill-settings-title"><Settings2 size={14} />学习设置</div>
              <p>控制本类目的读图模型、学习批次与自动整理策略。</p>
            </div>
            <span className="asset-skill-settings-scope">仅当前类目</span>
          </header>

          <div className="asset-skill-settings-grid">
            <div className="asset-skill-setting-row asset-skill-setting-row-wide">
              <div className="asset-skill-setting-copy">
                <span>读图模型</span>
                <small>用于读取参考图并提取商品保真规则</small>
              </div>
              <div className="asset-skill-setting-control asset-skill-model-control">
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

            <label className="asset-skill-setting-row">
              <span className="asset-skill-setting-copy"><span>单轮上限</span><small>每次自动或手动学习最多处理的图组</small></span>
              <span className="asset-skill-setting-control">
                <select aria-label="每轮读图预算" value={maxNewSamples} disabled={running} onChange={event => setMaxNewSamples(Number(event.target.value))} className={selectClass}>
                  {[1, 5, 10, 20, 30].map(count => <option key={count} value={count}>{count} 组</option>)}
                </select>
              </span>
            </label>

            <label className="asset-skill-setting-row asset-skill-setting-toggle-row">
              <span className="asset-skill-setting-copy"><span>自动学习</span><small>有新资料时自动启动一轮读图</small></span>
              <span className={`asset-skill-toggle ${scope?.autoAnalyze ? 'is-on' : ''}`}>
                <input type="checkbox" checked={scope?.autoAnalyze || false} disabled={running || !scope} onChange={event => configure({ autoAnalyze: event.target.checked })} />
                <span aria-hidden="true" />
              </span>
            </label>
          </div>

          <footer className="asset-skill-settings-footer">
            <p>候选不会自动发布；先试用或完成至少 3 款商品的实际成图对照，再手动升级。</p>
            <div className="asset-skill-settings-actions">
              <button type="button" disabled={running || !modelId || !roundCount} onClick={() => void run('observe')} className={button}>仅读图并保存记忆</button>
              {state && canConsolidate(state) && <button type="button" disabled={running || !modelId} onClick={() => void run('consolidate')} className="asset-skill-settings-primary">立即整理技能</button>}
            </div>
          </footer>
        </div>
      )}
    </div>
    {tab !== 'references' && !state && !error && <p role="status" className="py-10 text-center text-xs text-slate-500">正在读取技能…</p>}
    {error && <div role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs leading-5 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">重新读取状态</button></div>}
    {notice && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs leading-5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{notice}</p>}
    {tab === 'memory' && state && <CategoryMemoryView memory={state.memory} groupNumbers={groupNumbers} busy={running} onPreview={onPreview} onRun={run} />}
    {tab === 'skill' && state && <div className="mt-4 space-y-4">
      <p className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500 dark:bg-white/5">学习顺序：逐镜读图事实 → 提示词槽位与完整示例 → 整组分镜架构 → 同款多条差异规划。旧观察需按新方法重新读图；已启用版本继续用于生产，新版需完成学习后试用或启用。</p>
      <p className="text-xs leading-6 text-slate-500">在下方查看完整技能，点击“编辑技能”修改正文；希望后续学习持续遵守的要求，请在<button type="button" onClick={() => selectTab('memory')} className="mx-1 text-indigo-500 underline">偏好与记忆</button>中补充。</p>
      {trial && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50 p-4 text-xs leading-6 dark:bg-indigo-500/10"><span>后续新分析正在试用候选技能。固定同款商品图和相同生图设置，分别生成新旧版成图并评分。</span><button type="button" disabled={running} onClick={() => void run('baseline')} className={button}>切回正式版做对照</button></div>}
      {active && <div className="flex justify-end"><button type="button" disabled={running} onClick={() => void run('rollback')} className={button}>回滚上一正式版本</button></div>}
      {trial && versionCard(trial)}{active && versionCard(active)}{candidates.map(versionCard)}
      {history.length > 0 && <details className="rounded-xl border border-slate-200 p-4 text-xs dark:border-white/10"><summary className="cursor-pointer font-medium">更多版本（{history.length}）</summary><div className="mt-4 space-y-4">{history.map(versionCard)}</div></details>}
      {!state.versions.length && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm leading-7 text-slate-500 dark:border-white/10"><Sparkles className="mx-auto mb-3 h-6 w-6 text-indigo-400" />还没有候选技能，先积累图片观察。<p className="text-xs">已记住 {state.memory.learned} 套，经验 {state.memory.notes.length} 条。暂时使用基础商品保真规则。</p><button type="button" onClick={() => selectTab('memory')} className="mt-3 text-xs text-indigo-500 underline">查看学习记忆</button></div>}
      <details className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-white/10 dark:bg-[#18191c]"><summary className="cursor-pointer font-medium">可选：用实际成图对比技能</summary>
        <p className="my-3 leading-6 text-slate-500">可以直接启用技能。需要比较效果时，固定商品图和生成设置，分别生成新旧版图片并评分。以下参考仅作为技能学习来源查看，不载入生产。</p>
        <div className="space-y-2">{state.dataset.samples.map(sample => <div key={sample.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5"><button type="button" className="truncate text-left font-semibold tabular-nums hover:underline" onClick={() => onPreview(sample.id)}>{fullPromptGroupLabel(groupNumbers?.get(sample.id))}</button></div>)}</div>
      </details>
    </div>}
  </section>;
}

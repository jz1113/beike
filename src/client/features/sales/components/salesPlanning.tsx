import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Copy, Image as ImageIcon, Pencil, Settings2, UserRound, Map } from 'lucide-react';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { VIDEO_SALES_SHOT_TYPE_CONFIG, salesSkillSpeechLimits, type SalesCreativeAsset, type SalesImageRef, type VideoSalesScript, type VideoSalesShot } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { SALES_SKILL_OPTIONS, salesCategoryForSkill, salesSkillId, type SalesSkillId } from '../model/fashionSalesSkill';
import { SalesCreationRule, salesCardClass, salesDividerClass, salesFocusClass, salesGroupClass, salesInputClass, salesLabelClass, salesSectionTitleClass } from './salesChrome';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesPresentationSelect } from './SalesPresentationSelect';
import { SalesVideoPreflight } from './SalesVideoPreflight';
import { salesUnverifiedClaims } from '../model/salesClaimWarnings';

export const DURATION_OPTIONS = [
  { value: 15, label: '15秒', desc: '完播率最高，适合爆品单点突破' },
  { value: 30, label: '30秒', desc: '结构完整，转化率最均衡' },
  { value: 60, label: '60秒', desc: '适合复杂卖点或剧情故事' },
];

export function countVoiceoverHan(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

export function SalesPlanningSettings({ state, disabled, noDivider, layout = 'vertical', onOpenRules, onChange }: { state: VideoSalesStudioState; disabled: boolean; noDivider?: boolean; layout?: 'vertical' | 'bottom'; onOpenRules: () => void; onChange: (patch: Partial<VideoSalesStudioState>) => void }) {
  const { ready, multimodalModels } = usePreferenceModels();
  const isBottom = layout === 'bottom';
  return (
    <section className={`${salesGroupClass} ${noDivider ? '' : salesDividerClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={salesSectionTitleClass}>创作设置</h2>
        {isBottom && <span className="text-[11px] text-slate-500 dark:text-slate-400">商品采集完成后，按下方参数提炼卖点并生成完整脚本</span>}
      </div>
      <div className={isBottom ? `grid items-start gap-4 ${state.category === 'fashion' ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}` : 'space-y-3.5'}>
        <div className="space-y-2">
          <label className={salesLabelClass}>创作技能
            <select value={salesSkillId(state.category)} disabled={disabled} onChange={(event) => onChange({ category: salesCategoryForSkill(event.target.value as SalesSkillId), ...(event.target.value === 'fashion' && state.category !== 'fashion' ? { videoMode: 'live_presenter' } : {}) })} className={salesInputClass}>
              {state.category !== 'fashion' && <option value="" disabled>请选择服饰技能（服饰、鞋、包）</option>}
              {SALES_SKILL_OPTIONS.map((skill) => <option key={skill.id} value={skill.id} className="bg-white text-slate-900 dark:bg-[#1B1B1E] dark:text-slate-100">{skill.label}</option>)}
            </select>
          </label>
          {!isBottom && <SalesCreationRule category={state.category} onOpenRules={onOpenRules} />}
        </div>
        {state.category === 'fashion' && <label className={salesLabelClass}>呈现方式
          <SalesPresentationSelect value={state.videoMode} disabled={disabled} onChange={(videoMode) => onChange({ videoMode })} className={salesInputClass} showDescription />
        </label>}
        <div className="space-y-1.5"><span className={salesLabelClass}>卖点与脚本模型</span><SalesModelPicker modality="chat" value={state.selectedChatModel || ''} models={multimodalModels} ready={ready} disabled={disabled} onChange={(selectedChatModel) => onChange({ selectedChatModel })} /><p className="text-[11px] leading-5 text-slate-500">同一模型也用于商品分析和视频提示词。</p></div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <label className={salesLabelClass}>目标时长（秒）<input type="number" min={10} max={120} step={1} className={salesInputClass} value={state.targetDuration} disabled={disabled} onChange={(event) => onChange({ targetDuration: Number(event.target.value) })} /></label>
            <label className={salesLabelClass}>画面比例<select className={salesInputClass} value={state.aspectRatio} disabled={disabled} onChange={(event) => onChange({ aspectRatio: event.target.value as VideoSalesStudioState['aspectRatio'] })}>{['9:16', '3:4', '16:9', '1:1'].map((aspect) => <option key={aspect} value={aspect}>{aspect}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>快捷时长</span>{DURATION_OPTIONS.map((option) => <button key={option.value} type="button" disabled={disabled} aria-pressed={state.targetDuration === option.value} className="rounded-full border border-black/10 px-3 py-1 aria-pressed:bg-black/10 dark:border-white/10 dark:aria-pressed:bg-white/10" onClick={() => onChange({ targetDuration: option.value })}>{option.label}</button>)}<span>支持 10–120 秒</span></div>
        </div>
      </div>
      {isBottom ? (
        <div className="grid items-center gap-3 border-t border-slate-200/70 pt-3 lg:grid-cols-2 dark:border-white/10">
          <SalesCreationRule category={state.category} onOpenRules={onOpenRules} />
          <SalesVideoPreflight state={state} disabled={disabled} onChange={onChange} />
        </div>
      ) : (
        <SalesVideoPreflight state={state} disabled={disabled} onChange={onChange} />
      )}
    </section>
  );
}


export function SalesFooterCreationControls({ state, disabled, onChange }: {
  state: VideoSalesStudioState;
  disabled: boolean;
  onChange: (patch: Partial<VideoSalesStudioState>) => void;
}) {
  const [customDuration, setCustomDuration] = useState(false);
  const isCustomDuration = customDuration || !DURATION_OPTIONS.some((option) => option.value === state.targetDuration);
  const { ready, multimodalModels } = usePreferenceModels();
  const selectClass = `h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none transition focus:border-amber-500/70 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100 ${salesFocusClass}`;
  return (
    <div aria-label="创作设置" className="flex flex-wrap items-center gap-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2.5 border-r border-slate-200 pr-2.5 dark:border-white/10">
        <label className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="shrink-0">技能</span>
          <select aria-label="创作技能" value={salesSkillId(state.category)} disabled={disabled} onChange={(event) => onChange({ category: salesCategoryForSkill(event.target.value as SalesSkillId), ...(event.target.value === 'fashion' && state.category !== 'fashion' ? { videoMode: 'live_presenter' } : {}) })} className={selectClass}>
            {state.category !== 'fashion' && <option value="" disabled>请选择服饰技能（服饰、鞋、包）</option>}
            {SALES_SKILL_OPTIONS.map((skill) => <option key={skill.id} value={skill.id} className="bg-white text-slate-900 dark:bg-[#1B1B1E] dark:text-slate-100">{skill.label}</option>)}
          </select>
        </label>
        {state.category === 'fashion' && (
          <label className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="shrink-0">呈现方式</span>
          <SalesPresentationSelect value={state.videoMode} disabled={disabled} onChange={(videoMode) => onChange({ videoMode })} className={selectClass} />
          </label>
        )}
        <div className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <span className="shrink-0">模型</span>
        <div className="w-40 sm:w-44">
          <SalesModelPicker modality="chat" value={state.selectedChatModel || ''} models={multimodalModels} ready={ready} disabled={disabled} onChange={(selectedChatModel) => onChange({ selectedChatModel })} />
        </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-l border-slate-200 pl-2.5 dark:border-white/10">
        <div className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="shrink-0">时长</span>
          <div className="inline-flex h-9 items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 dark:border-white/10 dark:bg-white/[0.05]">
            {DURATION_OPTIONS.map((option) => (
              <button key={option.value} type="button" disabled={disabled} aria-pressed={!isCustomDuration && state.targetDuration === option.value} onClick={() => { setCustomDuration(false); onChange({ targetDuration: option.value }); }} className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${!isCustomDuration && state.targetDuration === option.value ? 'bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                {option.label}
              </button>
            ))}
            <button type="button" disabled={disabled} aria-pressed={isCustomDuration} onClick={() => setCustomDuration(true)} className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${isCustomDuration ? 'bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'} ${salesFocusClass}`}>自定义</button>
          </div>
          {isCustomDuration && <input autoFocus aria-label="目标时长（秒）" type="number" min={10} max={120} step={1} value={state.targetDuration} disabled={disabled} onChange={(event) => onChange({ targetDuration: Number(event.target.value) })} className="h-7 w-12 border-l border-slate-200 bg-transparent px-1 text-center text-xs font-medium text-slate-800 outline-none dark:border-white/10 dark:text-slate-100" />}
        </div>
        <label className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="shrink-0">比例</span>
          <select aria-label="画面比例" value={state.aspectRatio} disabled={disabled} onChange={(event) => onChange({ aspectRatio: event.target.value as VideoSalesStudioState['aspectRatio'] })} className={selectClass}>
            {['9:16', '3:4', '16:9', '1:1'].map((aspect) => <option key={aspect} value={aspect} className="bg-white text-slate-900 dark:bg-[#1B1B1E] dark:text-slate-100">{aspect}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

interface SalesPlanSectionProps {
  script: VideoSalesScript;
  disabled: boolean;
  onEditShot: (index: number, patch: Partial<VideoSalesShot>) => void;
  suppliedFacts?: string;
  productImages?: SalesImageRef[];
}

interface SalesScriptOutlineProps {
  script: VideoSalesScript;
  productImages?: SalesImageRef[];
  showPlannedAssets?: boolean;
  timeline?: boolean;
}

function PlannedAssetsSummary({ assets }: { assets: SalesCreativeAsset[] }) {
  if (assets.length === 0) return null;
  return <section aria-label="待准备素材" className="mt-5 border-t border-slate-200/70 pt-5 dark:border-white/10">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">待准备素材</h2>
      <span className="text-xs tabular-nums text-slate-400">{assets.length} 张</span>
    </div>
    <div className="mt-3 space-y-2" aria-label="脚本规划素材概览">
      {assets.map((asset) => <div key={asset.id} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/[0.04] text-slate-400 dark:bg-white/[0.06]">{asset.kind === 'person' || asset.kind === 'face' ? <UserRound className="h-4 w-4" aria-hidden /> : asset.kind === 'scene' ? <Map className="h-4 w-4" aria-hidden /> : <ImageIcon className="h-4 w-4" aria-hidden />}</span>
        <span className="min-w-0 flex-1 truncate">{asset.label}</span>
        <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">{asset.required ? '必需' : '可选'}</span>
      </div>)}
    </div>
  </section>;
}

function shotRanges(script: VideoSalesScript) {
  let elapsed = 0;
  return script.shots.map((shot, index) => {
    const start = elapsed;
    elapsed += shot.duration || 0;
    return { shot, index, start, end: elapsed };
  });
}

export function SalesScriptOutline({ script, productImages, showPlannedAssets = true, timeline = false }: SalesScriptOutlineProps) {
  const ranges = shotRanges(script);
  const shotCount = script.shots.length;
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const nodes = Array.from({ length: shotCount }, (_, index) => document.getElementById(`sales-shot-${index}`)).filter(Boolean) as HTMLElement[];
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveIndex(Number((visible.target as HTMLElement).dataset.shotIndex || 0));
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0.1, 0.5, 0.9] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [script.id, shotCount]);

  const duration = script.totalDuration || ranges[ranges.length - 1]?.end || 1;
  return <section aria-label="脚本大纲" className="mt-5 border-t border-slate-200/70 pt-5 dark:border-white/10">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">脚本大纲</h2>
      <span className="text-sm tabular-nums text-slate-400">{ranges.length} 段 · {duration} 秒</span>
    </div>
    <ol className={`${timeline ? 'sales-result-timeline' : ''} mt-4 space-y-2`}>
      {ranges.map(({ shot, index, start, end }) => {
        const type = VIDEO_SALES_SHOT_TYPE_CONFIG[shot.type] || VIDEO_SALES_SHOT_TYPE_CONFIG.demo;
        const matchedImage = typeof shot.imageIndex === 'number' ? productImages?.find((image) => image.index === shot.imageIndex) : undefined;
        return <li key={shot.shotId || index}>
          <button type="button" aria-current={activeIndex === index ? 'step' : undefined} onClick={() => {
            setActiveIndex(index);
            if (typeof document !== 'undefined') document.getElementById(`sales-shot-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }} className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-3 text-left transition ${salesFocusClass} ${activeIndex === index ? 'bg-amber-500/10 text-slate-900 dark:bg-amber-300/10 dark:text-slate-100' : 'text-slate-500 hover:bg-black/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.04]'}`}>
            <span className="w-16 shrink-0 text-sm tabular-nums text-slate-400">{start}–{end}s</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium"><span>{type.label}</span>{matchedImage?.url && <img src={matchedImage.url} alt="" className="h-5 w-5 rounded object-contain" />}</span>
              <span className={`sales-outline-dialogue mt-1 block text-sm leading-6 ${timeline ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'truncate'}`}>{(timeline ? shot.voiceover : shot.voiceover?.split(/\r?\n/)[0]) || '此段无口播'}</span>
            </span>
          </button>
        </li>;
      })}
    </ol>
    {showPlannedAssets && <PlannedAssetsSummary assets={script.assets || []} />}
  </section>;
}

export function SalesPlanSection({ script, disabled, onEditShot, suppliedFacts = '', productImages }: SalesPlanSectionProps) {
  const ranges = shotRanges(script);
  const isFashion = Boolean(script.beat);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <ol className="relative space-y-4 pl-8" aria-label="口播与画面时间轴">
        <span aria-hidden className="absolute bottom-4 left-3 top-4 w-px bg-slate-200 dark:bg-white/10" />
        {ranges.map(({ shot, index, start, end }) => {
          const claims = salesUnverifiedClaims(shot.voiceover, suppliedFacts);
          const type = VIDEO_SALES_SHOT_TYPE_CONFIG[shot.type] || VIDEO_SALES_SHOT_TYPE_CONFIG.demo;
          const shotHan = countVoiceoverHan(shot.voiceover || '');
          const matchedImage = typeof shot.imageIndex === 'number' ? productImages?.find((img) => img.index === shot.imageIndex) : undefined;
          return <li id={`sales-shot-${index}`} data-shot-index={index} key={shot.shotId || index} className="relative scroll-mt-5">
            <span className="absolute -left-8 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border-4 border-white bg-slate-900 text-[9px] font-semibold text-white shadow-sm dark:border-[#18191c] dark:bg-slate-100 dark:text-slate-950" title={`${start}–${end} 秒`}>{start}s</span>
            <article className={`${salesCardClass} overflow-hidden p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 pb-3 dark:border-white/10">
                <span className="text-sm font-semibold">{index + 1}. {type.label}</span>
                {shot.camera && <span title={shot.camera} className="min-w-0 max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500 sm:max-w-xs dark:bg-white/[0.06] dark:text-slate-400">{shot.camera}</span>}
                <span className="text-[11px] tabular-nums text-slate-400">{start}–{end}s</span>
                <div className="ml-auto flex items-center gap-2">
                  {matchedImage?.url && <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500" title={shot.selectionReason || `匹配商品参考 #${shot.imageIndex! + 1}`}><img src={matchedImage.url} alt={`商品参考 ${shot.imageIndex! + 1}`} className="h-6 w-6 rounded-md border border-slate-200 bg-white object-contain dark:border-white/10" />商品图 {shot.imageIndex! + 1}</span>}
                  {(claims.length > 0 || shot.promptStale) && <span title={[shot.promptStale ? '提示词需要重新生成' : '', claims.length ? `请核实：${claims.join('、')}` : ''].filter(Boolean).join('；')} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />待核对</span>}
                  <button type="button" aria-label={`编辑第 ${index + 1} 段`} title="编辑这一段" className={`rounded-md p-1.5 text-slate-400 hover:bg-black/[0.04] hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 ${salesFocusClass}`} onClick={() => document.getElementById(`sales-shot-${index}-voiceover`)?.focus()}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                </div>
              </div>
              <div className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                <div className="min-h-24 rounded-xl border border-amber-200/70 bg-amber-50/45 p-3 dark:border-amber-300/10 dark:bg-amber-300/[0.04]"><InlineShotField id={`sales-shot-${index}-voiceover`} label={shot.speechMode === 'on_camera' ? '出镜说话 · 同步口型' : shot.speechMode === 'voiceover' ? '画外音' : '声音未标注'} value={shot.voiceover} disabled={disabled} prominent count={shotHan} hint={isFashion ? `建议 ${Math.max(salesSkillSpeechLimits.minShotHan, Math.round(shot.duration * salesSkillSpeechLimits.preferredMinRate))}–${Math.max(salesSkillSpeechLimits.minShotHan, Math.round(shot.duration * salesSkillSpeechLimits.preferredMaxRate))} 字，可随展示调整` : undefined} onSave={(value) => onEditShot(index, { voiceover: value })} /></div>
                <div className="min-h-24 rounded-xl border border-slate-200/80 bg-white/65 p-3 dark:border-white/10 dark:bg-white/[0.025]"><InlineShotField id={`sales-shot-${index}-description`} label="画面描述" value={shot.description} disabled={disabled} compact onSave={(value) => onEditShot(index, { description: value })} /></div>
              </div>
              <SalesPromptDetails title="查看完整提示词" value={shot.prompt || shot.description} disabled={disabled} onChange={(value) => onEditShot(index, { prompt: value })} rows={5} preview={false} copyable note={shot.promptStale ? '商品或脚本已更新，保存后请重新生成视频提示词。' : undefined} />
              <details className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10"><summary className={`flex cursor-pointer items-center gap-2 rounded text-xs font-medium text-slate-500 ${salesFocusClass}`}><Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden /><span>更多设置</span><span className="ml-auto flex items-center gap-1.5 text-[11px] font-normal text-slate-400"><span>{shot.duration} 秒 · {shot.speechMode === 'on_camera' ? '出镜说话' : shot.speechMode === 'voiceover' ? '画外音' : '声音未标注'}</span><ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden /></span></summary><div className="mt-3 flex flex-wrap items-end gap-3"><label className="block w-28 text-xs text-slate-500">时长（秒）<input aria-label={`段落 ${index + 1} 时长`} type="number" min={1} max={60} disabled={disabled} value={shot.duration} onChange={(event) => onEditShot(index, { duration: Number(event.target.value) || shot.duration })} className={salesInputClass} /></label><label className="block min-w-48 flex-1 text-xs text-slate-500">声音来源<select aria-label={`段落 ${index + 1} 声音来源`} value={shot.speechMode || ''} disabled={disabled} onChange={(event) => onEditShot(index, { speechMode: event.target.value as NonNullable<VideoSalesShot['speechMode']> })} className={salesInputClass}><option value="" disabled>未标注</option><option value="on_camera">出镜人物说话</option><option value="voiceover">画外音</option></select></label></div>{shot.speechMode === 'on_camera' && <p className="mt-3 text-xs leading-6 text-slate-500">出镜说话建议用中景，完整嘴部清晰可见；修改后检查人物素材并重新合成视频提示词。</p>}{shot.selectionReason && <p className="mt-3 text-[11px] leading-5 text-slate-500">参考依据：{shot.selectionReason}</p>}</details>
            </article>
          </li>;
        })}
      </ol>
    </div>
  );
}

function InlineShotField({ id, label, value, disabled, prominent, compact, count, hint, onSave }: { id: string; label: string; value: string; disabled: boolean; prominent?: boolean; compact?: boolean; count?: number; hint?: string; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const save = () => { if (draft !== value) onSave(draft); setEditing(false); };
  return <div className="min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium text-slate-500">{label}{typeof count === 'number' ? ` · ${count} 字` : ''}</span>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      {compact && value && !editing && <button type="button" aria-label={`${expanded ? '收起' : '展开'}${label}`} aria-expanded={expanded} aria-controls={`${id}-preview`} onClick={() => setExpanded((open) => !open)} className={`shrink-0 rounded text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 ${salesFocusClass}`}>{expanded ? '收起' : '展开'}</button>}
    </div>
    {editing ? <textarea id={id} autoFocus rows={prominent ? 4 : 3} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); save(); } }} className={`${salesInputClass} resize-y ${prominent ? 'text-base leading-8' : 'text-sm leading-7'}`} /> : <button type="button" id={id} disabled={disabled} onClick={() => setEditing(true)} className={`mt-1 block w-full rounded-lg text-left ${prominent ? 'text-lg font-semibold leading-9 text-slate-900 dark:text-slate-100' : 'text-sm leading-7 text-slate-600 dark:text-slate-300'} ${salesFocusClass} hover:bg-black/[0.025] dark:hover:bg-white/[0.03]`}><span id={`${id}-preview`} className={compact && !expanded ? 'line-clamp-2' : 'whitespace-pre-wrap'}>{value || '此段无内容，点击添加'}</span></button>}
  </div>;
}

interface SalesPromptDetailsProps {
  title: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  rows?: number;
  note?: string;
  initiallyOpen?: boolean;
  copyable?: boolean;
  preview?: boolean;
}

export function SalesPromptDetails({ title, value, disabled, onChange, rows = 6, note, initiallyOpen, copyable, preview = true }: SalesPromptDetailsProps) {
  const [copyStatus, setCopyStatus] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopyStatus('已复制完整提示词'); }
    catch { setCopyStatus('复制失败，请选中文本手动复制或重试'); }
  };
  return <details open={initiallyOpen} className="sales-shot-prompt group/prompt rounded-xl border border-slate-200/80 p-2.5 dark:border-white/10 dark:bg-black/25">
    <summary className={`cursor-pointer list-none rounded ${salesFocusClass}`}>
      <span className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-700 dark:text-slate-200">{title}</span><span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500"><span>{value.length} 字 · 展开编辑</span><ChevronDown className="h-3.5 w-3.5 transition group-open/prompt:rotate-180" /></span></span>
      {preview && <span className="mt-2 line-clamp-2 break-words text-xs leading-6 text-slate-500 dark:text-slate-400 group-open/prompt:hidden">{value || '暂无提示词'}</span>}
    </summary>
    <div className="mt-3">
      {copyable && <div className="mb-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => { void copy(); }} className={`inline-flex items-center gap-1 rounded px-1 py-1 text-xs text-slate-500 ${salesFocusClass}`}><Copy className="h-3.5 w-3.5" />复制完整提示词</button><span role="status" className="text-xs text-slate-500">{copyStatus}</span></div>}
      <textarea aria-label={title} value={value} rows={rows} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${salesInputClass} mt-0 resize-y text-sm leading-7`} />
      {note && <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  </details>;
}

import { useState } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { VIDEO_SALES_SHOT_TYPE_CONFIG, type VideoSalesProductAnalysis, type VideoSalesScript, type VideoSalesShot } from '@shared/domain/video-sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { SALES_SKILL_OPTIONS, salesCategoryForSkill, salesSkillId, type SalesSkillId } from '../model/fashionSalesSkill';
import { SalesCreationRule, salesCardClass, salesDividerClass, salesFocusClass, salesGroupClass, salesInputClass, salesLabelClass, salesSectionTitleClass } from './salesChrome';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesVideoPreflight } from './SalesVideoPreflight';
import { salesUnverifiedClaims } from '../model/salesClaimWarnings';

export const DURATION_OPTIONS = [
  { value: 15, label: '15秒', desc: '完播率最高，适合爆品单点突破' },
  { value: 30, label: '30秒', desc: '结构完整，转化率最均衡' },
  { value: 60, label: '60秒', desc: '适合复杂卖点或剧情故事' },
];

export function SalesPlanningSettings({ state, disabled, onOpenRules, onChange }: { state: VideoSalesStudioState; disabled: boolean; onOpenRules: () => void; onChange: (patch: Partial<VideoSalesStudioState>) => void }) {
  const { ready, multimodalModels } = usePreferenceModels();
  return (
    <section className={`${salesGroupClass} ${salesDividerClass}`}>
      <h2 className={salesSectionTitleClass}>创作设置</h2>
      <label className={salesLabelClass}>创作技能
        <select value={salesSkillId(state.category)} disabled={disabled} onChange={(event) => onChange({ category: salesCategoryForSkill(event.target.value as SalesSkillId), ...(event.target.value === 'fashion' && state.category !== 'fashion' ? { videoMode: 'live_presenter' } : {}) })} className={salesInputClass}>
          {SALES_SKILL_OPTIONS.map((skill) => <option key={skill.id} value={skill.id} className="bg-white text-slate-900 dark:bg-[#1B1B1E] dark:text-slate-100">{skill.label}</option>)}
        </select>
      </label>
      <SalesCreationRule category={state.category} onOpenRules={onOpenRules} />
      {state.category === 'fashion' && <label className={salesLabelClass}>出镜方式
        <select value={state.videoMode} disabled={disabled} onChange={(event) => onChange({ videoMode: event.target.value as VideoSalesStudioState['videoMode'] })} className={salesInputClass}>
          <option value="live_presenter">人物出镜讲解（同步口型）</option><option value="product_closeup">商品与细节展示（画外音）</option><option value="scene_demo">手部或背影展示（画外音）</option><option value="graphic_montage">商品混剪（画外音）</option>
        </select>
        <span className="text-[11px] font-normal leading-5 text-slate-500">出镜讲解由人物亲口说话，细节镜头可接同一人的画外音。</span>
      </label>}
      <div className="space-y-1.5"><span className={salesLabelClass}>多模态分析与口播模型</span><SalesModelPicker modality="chat" value={state.selectedChatModel || ''} models={multimodalModels} ready={ready} disabled={disabled} onChange={(selectedChatModel) => onChange({ selectedChatModel })} /><p className="text-[11px] leading-5 text-slate-500">同一模型也用于可选图片校验和视频提示词。</p></div>
      <div className="grid grid-cols-2 gap-3">
        <label className={salesLabelClass}>目标时长（秒）<input type="number" min={10} max={120} step={1} className={salesInputClass} value={state.targetDuration} disabled={disabled} onChange={(event) => onChange({ targetDuration: Number(event.target.value) })} /></label>
        <label className={salesLabelClass}>画面比例<select className={salesInputClass} value={state.aspectRatio} disabled={disabled} onChange={(event) => onChange({ aspectRatio: event.target.value as VideoSalesStudioState['aspectRatio'] })}>{['9:16', '3:4', '16:9', '1:1'].map((aspect) => <option key={aspect} value={aspect}>{aspect}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>快捷时长</span>{DURATION_OPTIONS.map((option) => <button key={option.value} type="button" disabled={disabled} aria-pressed={state.targetDuration === option.value} className="rounded-full border border-black/10 px-3 py-1 aria-pressed:bg-black/10 dark:border-white/10 dark:aria-pressed:bg-white/10" onClick={() => onChange({ targetDuration: option.value })}>{option.label}</button>)}<span>支持 10–120 秒</span></div>
      <SalesVideoPreflight state={state} disabled={disabled} onChange={onChange} />
    </section>
  );
}

interface SalesPlanSectionProps {
  analysis: VideoSalesProductAnalysis | null;
  script: VideoSalesScript;
  disabled: boolean;
  onEditShot: (index: number, patch: Partial<VideoSalesShot>) => void;
  suppliedFacts?: string;
}

export function SalesPlanSection({ analysis, script, disabled, onEditShot, suppliedFacts = '' }: SalesPlanSectionProps) {
  let elapsed = 0;
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <section className={`${salesCardClass} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{script.title || '口播脚本'}</h2><span className="text-xs text-slate-500">{script.shots.length} 段 · {script.totalDuration} 秒</span></div>
        <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">确认口播和画面节奏后，再准备素材。分镜属于同一条视频，不逐镜生成或拼接。</p>
        {script.beat && <p className="mt-2 text-xs leading-6 text-slate-500">默认中景、中全景或全身展示，固定机位或保持距离的小幅横移；商品与 logo 不贴近镜头。</p>}
        {script.planStale && <p role="status" className="mt-3 rounded-xl bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">商品或方案已修改，请重新生成脚本后继续。</p>}
        {analysis && <details className="mt-4 border-t border-slate-200/80 pt-3 dark:border-white/10"><summary className={`cursor-pointer rounded text-xs text-slate-500 ${salesFocusClass}`}>查看商品分析与事实依据 · 已分析 {analysis.coveredImageCount ?? 0}/{analysis.imageCount ?? analysis.coveredImageCount ?? 0} 张图片</summary><div className="mt-4 grid gap-4 text-sm md:grid-cols-3"><Fact title="卖点" items={analysis.sellingPoints} /><Fact title="已知事实" items={analysis.knownFacts || []} /><Fact title="创作建议" items={[analysis.targetAudience, ...(analysis.creativeNotes || []), analysis.videoSuggestions?.suggestedStyle || '']} /></div></details>}
      </section>
      <ol className="space-y-3" aria-label="口播与画面时间轴">
        {script.shots.map((shot, index) => {
          const claims = salesUnverifiedClaims(shot.voiceover, suppliedFacts);
          const start = elapsed;
          elapsed += shot.duration;
          const type = VIDEO_SALES_SHOT_TYPE_CONFIG[shot.type] || VIDEO_SALES_SHOT_TYPE_CONFIG.demo;
          return <li key={shot.shotId || index} className={`${salesCardClass} p-4`}>
            <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-black/5 px-2 py-1 text-xs font-medium tabular-nums dark:bg-white/10">{start}–{elapsed} 秒</span><span className="text-xs text-slate-500">{index + 1}. {type.label}</span></div>
            <div className="grid gap-3 xl:grid-cols-2"><div><p className="text-[11px] text-slate-500">{shot.speechMode === 'on_camera' ? '出镜说话 · 同步口型' : shot.speechMode === 'voiceover' ? '画外音' : '口播 · 未标注声音来源'}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7">{shot.voiceover || '此段无口播'}</p></div><div><p className="text-[11px] text-slate-500">画面</p><p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-7 text-slate-600 dark:text-slate-300">{shot.description}</p></div></div>
            {claims.length > 0 && <p role="status" className="mt-3 text-xs leading-6 text-amber-700 dark:text-amber-300">请核实“{claims.join('、')}”：提供的商品资料未包含这些体验依据，可展开编辑这一段。</p>}
            <details className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10"><summary className={`cursor-pointer rounded text-xs text-slate-500 ${salesFocusClass}`}>编辑这一段</summary>
              <div className="mt-3 space-y-3"><label className="block text-xs text-slate-500">段落时长（秒）<input aria-label={`段落 ${index + 1} 时长`} type="number" min={1} max={60} disabled={disabled} value={shot.duration} onChange={(event) => onEditShot(index, { duration: Number(event.target.value) || shot.duration })} className={`${salesInputClass} max-w-28`} /></label>
                <label className="block text-xs text-slate-500">声音来源<select aria-label={`段落 ${index + 1} 声音来源`} value={shot.speechMode || ''} disabled={disabled} onChange={(event) => onEditShot(index, { speechMode: event.target.value as NonNullable<VideoSalesShot['speechMode']> })} className={salesInputClass}><option value="" disabled>请选择声音来源</option><option value="on_camera">出镜人物说话（同步口型）</option><option value="voiceover">画外音（商品或细节镜头）</option></select></label>
                {shot.speechMode === 'on_camera' && <p className="text-xs leading-6 text-slate-500">说话用中景，完整头部、嘴部与主要服装同时入画，让完整嘴部清晰可见；不推近脸部或 logo，转身或遮嘴放在句间停顿；修改后检查人物素材并重新定稿。</p>}
                <div className="grid gap-3 xl:grid-cols-2"><label className="text-xs text-slate-500">口播<textarea value={shot.voiceover} rows={3} disabled={disabled} onChange={(event) => onEditShot(index, { voiceover: event.target.value })} className={`${salesInputClass} resize-y`} /></label><label className="text-xs text-slate-500">画面描述<textarea value={shot.description} rows={3} disabled={disabled} onChange={(event) => onEditShot(index, { description: event.target.value })} className={`${salesInputClass} resize-y`} /></label></div>
                {shot.selectionReason && <p className="text-[11px] leading-5 text-slate-500">参考依据：{shot.selectionReason}</p>}
              </div>
            </details>
          </li>;
        })}
      </ol>
    </div>
  );
}

function Fact({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="text-xs text-slate-500">{title}</h3><p className="mt-1 break-words text-sm leading-6">{items.filter((item) => item.trim()).join('；') || '暂无已确认信息'}</p></div>;
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
}

export function SalesPromptDetails({ title, value, disabled, onChange, rows = 6, note, initiallyOpen, copyable }: SalesPromptDetailsProps) {
  const [copyStatus, setCopyStatus] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopyStatus('已复制完整提示词'); }
    catch { setCopyStatus('复制失败，请选中文本手动复制或重试'); }
  };
  return <details open={initiallyOpen} className="group/prompt rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
    <summary className={`cursor-pointer list-none rounded ${salesFocusClass}`}>
      <span className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-700 dark:text-slate-200">{title}</span><span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500"><span>{value.length} 字 · 展开编辑</span><ChevronDown className="h-3.5 w-3.5 transition group-open/prompt:rotate-180" /></span></span>
      <span className="mt-2 line-clamp-2 break-words text-xs leading-6 text-slate-500 dark:text-slate-400 group-open/prompt:hidden">{value || '暂无提示词'}</span>
    </summary>
    <div className="mt-3">
      {copyable && <div className="mb-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => { void copy(); }} className={`inline-flex items-center gap-1 rounded px-1 py-1 text-xs text-slate-500 ${salesFocusClass}`}><Copy className="h-3.5 w-3.5" />复制完整提示词</button><span role="status" className="text-xs text-slate-500">{copyStatus}</span></div>}
      <textarea aria-label={title} value={value} rows={rows} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${salesInputClass} mt-0 resize-y text-sm leading-7`} />
      {note && <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  </details>;
}

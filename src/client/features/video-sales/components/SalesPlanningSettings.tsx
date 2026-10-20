import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { DURATION_OPTIONS } from './ProductSetupPanelData';
import { SalesModelPicker } from './SalesModelPicker';
import { salesDividerClass, salesGroupClass, salesInputClass, salesLabelClass, salesSectionTitleClass } from './salesSurface';

export function SalesPlanningSettings({ state, disabled, onChange }: { state: VideoSalesStudioState; disabled: boolean; onChange: (patch: Partial<VideoSalesStudioState>) => void }) {
  const { ready, multimodalModels } = usePreferenceModels();
  return (
    <section className={`${salesGroupClass} ${salesDividerClass}`}>
      <h2 className={salesSectionTitleClass}>创作设置</h2>
      <div className="space-y-1.5"><span className={salesLabelClass}>多模态分析与口播模型</span><SalesModelPicker modality="chat" value={state.selectedChatModel || ''} models={multimodalModels} ready={ready} disabled={disabled} onChange={(selectedChatModel) => onChange({ selectedChatModel })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <label className={salesLabelClass}>目标时长（秒）<input type="number" min={10} max={120} step={1} className={salesInputClass} value={state.targetDuration} disabled={disabled} onChange={(event) => onChange({ targetDuration: Number(event.target.value) })} /></label>
        <label className={salesLabelClass}>画面比例<select className={salesInputClass} value={state.aspectRatio} disabled={disabled} onChange={(event) => onChange({ aspectRatio: event.target.value as VideoSalesStudioState['aspectRatio'] })}>{['9:16', '3:4', '16:9', '1:1'].map((aspect) => <option key={aspect} value={aspect}>{aspect}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>快捷时长</span>{DURATION_OPTIONS.map((option) => <button key={option.value} type="button" disabled={disabled} aria-pressed={state.targetDuration === option.value} className="rounded-full border border-black/10 px-3 py-1 aria-pressed:bg-black/10 dark:border-white/10 dark:aria-pressed:bg-white/10" onClick={() => onChange({ targetDuration: option.value })}>{option.label}</button>)}<span>支持 10–120 秒</span></div>
      <p className="text-[11px] leading-5 text-slate-500">先确认商品颜色和参考图，再分析商品、编写口播。绘图和视频模型在后续步骤单独选择。</p>
    </section>
  );
}

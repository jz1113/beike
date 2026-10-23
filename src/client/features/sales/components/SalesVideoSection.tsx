import { useState } from 'react';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import MarkdownCodeBlock from '@client/shared/ui/markdown/MarkdownCodeBlock';
import { eligibleSalesImages, salesActualReferences, type SalesActualReference, type VideoSalesScript } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesVideoParams } from './SalesVideoParams';
import { salesCardClass, salesFocusClass, salesInputClass } from './salesChrome';

interface Props {
  state: VideoSalesStudioState;
  script: VideoSalesScript;
  modelId: string;
  disabled: boolean;
  assetsReady: boolean;
  finalized?: boolean;
  videoError?: string | null;
  submitError?: string | null;
  onChange: (patch: Partial<VideoSalesStudioState>) => void;
  onEditPrompt: (prompt: string) => void;
}

export function SalesVideoSection({ state, script, modelId, disabled, assetsReady, finalized, videoError, submitError, onChange, onEditPrompt }: Props) {
  const { ready, multimodalModels, videoModels } = usePreferenceModels();
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <section className={`${salesCardClass} space-y-4 p-4 sm:p-5`}>
        <h2 className="text-base font-semibold">视频定稿</h2>
        {!assetsReady ? <p role="status" className="rounded-xl bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">请先在“素材图片”完成生成并确认图片，定稿模型和视频参数届时开放。</p> : <div className="space-y-4">
          <div className="space-y-1.5"><span className="text-xs text-slate-500">定稿提示词模型</span><SalesModelPicker modality="chat" value={state.selectedChatModel || ''} models={multimodalModels} ready={ready} disabled={disabled} onChange={(selectedChatModel) => onChange({ selectedChatModel })} /><p className="text-xs leading-6 text-slate-500 dark:text-slate-400">与口播脚本是同一只多模态模型，由它查看真实图片后编写提示词。旁边的视频模型只负责出片。</p></div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-1.5"><span className="text-xs text-slate-500">视频模型</span><SalesModelPicker modality="video" value={state.selectedVideoModel || ''} models={videoModels} ready={ready} disabled={disabled} onChange={(selectedVideoModel) => onChange({ selectedVideoModel })} /></div>
            <div className="space-y-1.5"><span className="text-xs text-slate-500">视频能力与参数</span><SalesVideoParams modelId={modelId} refMode={state.videoRefMode} aspectRatio={state.aspectRatio} resolution={state.videoResolution} targetDuration={state.targetDuration} disabled={disabled} onChange={onChange} /></div>
          </div>
        </div>}
        {assetsReady && videoError && <p role="status" className="rounded-xl bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">{videoError}</p>}
      </section>
      <section className={`${salesCardClass} space-y-3 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">最终完整视频提示词</h3><span className={`text-[11px] ${finalized ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>{finalized ? '提示词已生成' : script.fullPrompt?.trim() ? '需要更新提示词' : '待生成'}</span></div>
        {script.fullPrompt?.trim() ? <SalesFinalPrompt prompt={script.fullPrompt} references={finalReferences(state, script)} disabled={disabled || !assetsReady} onChange={onEditPrompt} /> : <p className="py-6 text-sm leading-7 text-slate-500 dark:text-slate-400">脚本阶段无需完整视频提示词。完成素材后，点击“生成视频提示词”。</p>}
        {assetsReady && submitError && submitError !== videoError && <p role="status" className="text-xs leading-6 text-amber-700 dark:text-amber-200">{submitError}</p>}
      </section>
    </div>
  );
}

function finalReferences(state: VideoSalesStudioState, script: VideoSalesScript): SalesActualReference[] {
  try {
    return salesActualReferences(script, eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata));
  } catch {
    return [];
  }
}

function SalesFinalPrompt({ prompt, references, disabled, onChange }: { prompt: string; references: SalesActualReference[]; disabled: boolean; onChange: (prompt: string) => void }) {
  const [editing, setEditing] = useState(false);
  const chips = references.length > 0 ? (
    <div className="flex flex-wrap gap-2 border-b border-slate-200/80 px-3 py-2 dark:border-white/10">
      {references.map((ref, index) => (
        <a key={ref.id} href={ref.url} target="_blank" rel="noreferrer" className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 pr-2 pl-1 text-[11px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 ${salesFocusClass}`} title={`图片${index + 1} · ${ref.label}`}>
          <img src={ref.url} alt="" className="h-8 w-8 rounded-md object-cover" />
          <span className="truncate">图片{index + 1} · {ref.label}</span>
        </a>
      ))}
    </div>
  ) : undefined;
  return (
    <div>
      {editing ? (
        <div className="space-y-2">
          {chips}
          <textarea aria-label="最终完整视频提示词" value={prompt} rows={10} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${salesInputClass} mt-0 resize-y text-sm leading-7`} />
          <button type="button" onClick={() => setEditing(false)} className={`rounded-md border border-slate-300 px-2 py-1 text-[11px] dark:border-white/20 ${salesFocusClass}`}>完成</button>
        </div>
      ) : (
        <MarkdownCodeBlock code={prompt} preamble={chips} action={<button type="button" disabled={disabled} onClick={() => setEditing(true)} className="mr-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] disabled:opacity-40 dark:border-white/20">编辑</button>} />
      )}
      <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">整条视频一次提交。切换模型、参考方式或清晰度会保留已有有效提示词，提交前检查新配置是否兼容。修改商品、脚本或素材后需更新提示词。</p>
    </div>
  );
}

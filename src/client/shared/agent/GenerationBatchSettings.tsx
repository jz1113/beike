import { useSyncExternalStore } from 'react';
import { getGenerationMediaConcurrency, setGenerationMediaConcurrency, subscribeGenerationMediaConcurrency } from './generationConcurrency';
import type { BatchGenerationSettings } from './buildGenerationPromptBatch';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { useAppStore } from '@client/store';

const fieldClass = 'min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-[#202126]';

export default function GenerationBatchSettings({ value, onChange, image, video }: {
  value: BatchGenerationSettings; onChange: (value: BatchGenerationSettings) => void; image: boolean; video: boolean;
}) {
  const { imageModels, videoModels } = usePreferenceModels();
  const concurrency = useSyncExternalStore(subscribeGenerationMediaConcurrency, getGenerationMediaConcurrency, () => 3);
  const patch = (update: Partial<BatchGenerationSettings>) => {
    onChange({ ...value, ...update });
    const state = useAppStore.getState();
    if (update.imageModel !== undefined) state.setQuickModel(update.imageModel);
    if (update.imageAspect !== undefined) state.setQuickAspectId(update.imageAspect);
    if (update.imageQuality !== undefined) state.setQuickQuality(update.imageQuality);
    if (update.videoModel !== undefined) state.setQuickVideoModel(update.videoModel);
    if (update.videoAspect !== undefined) state.setQuickVideoAspectId(update.videoAspect);
    if (update.videoResolution !== undefined) state.setQuickVideoResolution(update.videoResolution);
    if (update.videoDuration !== undefined) state.setQuickVideoDuration(update.videoDuration);
    if (update.videoRefMode !== undefined) state.setQuickVideoRefMode(update.videoRefMode);
  };
  return <div className="space-y-3">
    {image && <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3"><legend className="mb-1.5 font-medium">图片设置</legend>
      <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">模型<select aria-label="批量图片模型" className={fieldClass} value={value.imageModel} onChange={event => patch({ imageModel: event.target.value })}>
        <option value="">请选择模型</option>{!imageModels.some(model => model.id === value.imageModel) && value.imageModel && <option value={value.imageModel}>{value.imageModel}（请核对是否启用）</option>}
        {imageModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
      </select></label>
      <label className="flex flex-col gap-1">默认比例<input aria-label="默认图片比例" className={fieldClass} value={value.imageAspect} onChange={event => patch({ imageAspect: event.target.value })} /></label>
      <label className="flex flex-col gap-1">质量<select aria-label="批量图片质量" className={fieldClass} value={value.imageQuality} onChange={event => patch({ imageQuality: event.target.value as BatchGenerationSettings['imageQuality'] })}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
    </fieldset>}
    {video && <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3"><legend className="mb-1.5 font-medium">视频设置</legend>
      <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">模型<select aria-label="批量视频模型" className={fieldClass} value={value.videoModel} onChange={event => patch({ videoModel: event.target.value })}>
        <option value="">请选择模型</option>{!videoModels.some(model => model.id === value.videoModel) && value.videoModel && <option value={value.videoModel}>{value.videoModel}（请核对是否启用）</option>}
        {videoModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
      </select></label>
      <label className="flex flex-col gap-1">默认比例<input aria-label="默认视频比例" className={fieldClass} value={value.videoAspect} onChange={event => patch({ videoAspect: event.target.value })} /></label>
      <label className="flex flex-col gap-1">时长（秒）<input aria-label="默认视频时长" className={fieldClass} type="number" min={1} max={120} value={value.videoDuration} onChange={event => patch({ videoDuration: Number(event.target.value) })} /></label>
      <label className="flex flex-col gap-1">分辨率<select aria-label="批量视频分辨率" className={fieldClass} value={value.videoResolution} onChange={event => patch({ videoResolution: event.target.value as BatchGenerationSettings['videoResolution'] })}>{['480P', '720P', '1080P', '4K'].map(resolution => <option key={resolution}>{resolution}</option>)}</select></label>
      <label className="flex flex-col gap-1">参考模式<select aria-label="批量视频参考模式" className={fieldClass} value={value.videoRefMode} onChange={event => patch({ videoRefMode: event.target.value })}>
        <option value="omni">全能参考</option><option value="text">文生视频</option><option value="first_frame">首帧</option><option value="first_last_frame">首尾帧</option><option value="edit">编辑视频</option><option value="extend">延长视频</option>
      </select></label>
      <label className="flex items-center gap-2"><input aria-label="视频生成音频" type="checkbox" checked={value.videoGenerateAudio ?? false} onChange={event => patch({ videoGenerateAudio: event.target.checked })} />生成音频（模型支持时）</label>
    </fieldset>}
    <label className="flex items-center gap-2">媒体提交并发数<select aria-label="媒体提交并发数" className={fieldClass} value={concurrency} onChange={event => setGenerationMediaConcurrency(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count} 路</option>)}</select></label>
    <p className="text-slate-500">每项生成 1 份。条目中的比例与时长优先；不支持的参数会在提交前提示。Agent 对话独立排队，上游完成时间取决于模型服务。</p>
  </div>;
}

import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesVideoParams } from './SalesVideoParams';
import { salesDividerClass, salesGroupClass, salesLabelClass, salesSectionTitleClass } from './salesChrome';
import type { SalesAspectRatio, SalesVideoRefMode } from '../model/salesWorkspace';

interface Props {
  chatModel: string;
  videoModel: string;
  videoModelId: string;
  imageModel: string;
  refMode: SalesVideoRefMode;
  aspectRatio: SalesAspectRatio;
  resolution: string;
  targetDuration: number;
  aspectConflict: string | null;
  redrawScenes: boolean;
  disabled: boolean;
  onChange: (patch: {
    selectedChatModel?: string;
    selectedVideoModel?: string;
    selectedImageModel?: string;
    redrawScenes?: boolean;
    videoRefMode?: SalesVideoRefMode;
    aspectRatio?: SalesAspectRatio;
    videoResolution?: string;
    targetDuration?: number;
  }) => void;
}

export function SalesEnhanceSettings({
  chatModel,
  videoModel,
  videoModelId,
  imageModel,
  refMode,
  aspectRatio,
  resolution,
  targetDuration,
  aspectConflict,
  redrawScenes,
  disabled,
  onChange,
}: Props) {
  const { ready, multimodalModels, videoModels, imageModels } = usePreferenceModels();

  return (
    <section className={`${salesGroupClass} ${salesDividerClass}`}>
      <h2 className={salesSectionTitleClass}>模型配置</h2>
      <div className="space-y-1.5">
        <span className={salesLabelClass}>多模态模型</span>
        <SalesModelPicker modality="chat" value={chatModel} models={multimodalModels} ready={ready} disabled={disabled} onChange={(modelId) => onChange({ selectedChatModel: modelId })} />
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-[#EDEDED]">
          <input type="checkbox" className="accent-slate-950 dark:accent-white" checked={redrawScenes} disabled={disabled} onChange={(event) => onChange({ redrawScenes: event.target.checked })} />
          先按脚本生成人物和场景参考图
        </label>
        {redrawScenes && (
          <SalesModelPicker modality="image" value={imageModel} models={imageModels} ready={ready} disabled={disabled} onChange={(modelId) => onChange({ selectedImageModel: modelId })} />
        )}
      </div>
      <div className="space-y-1.5">
        <span className={salesLabelClass}>视频生成</span>
        <SalesModelPicker modality="video" value={videoModel} models={videoModels} ready={ready} disabled={disabled} onChange={(modelId) => onChange({ selectedVideoModel: modelId })} />
        <SalesVideoParams
          modelId={videoModelId}
          refMode={refMode}
          aspectRatio={aspectRatio}
          resolution={resolution}
          targetDuration={targetDuration}
          disabled={disabled}
          onChange={onChange}
        />
        {aspectConflict && <p className="text-xs font-medium leading-relaxed text-amber-600 dark:text-amber-300">{aspectConflict}。画幅保持原选择，确认前请更换画幅或视频模型。</p>}
      </div>
    </section>
  );
}

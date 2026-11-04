import type { ModalityPickerSelection } from '@shared/domain/models/modalityStorage';
import type { SalesReferenceSlot, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { compatibleSalesVideoModels, salesVideoModelPatch } from '../model/salesVideoCompatibility';
import { salesGhostButtonClass } from './salesChrome';

interface Props {
  error: string;
  plan: SalesProductionPlanState;
  script: SalesScriptDomain;
  references: readonly SalesReferenceSlot[];
  audios?: readonly string[];
  videoModels: readonly ModalityPickerSelection[];
  disabled: boolean;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  onEditStoryboard: () => void;
}

export function SalesVideoDurationNotice({ error, plan, script, references, audios, videoModels, disabled, onPatchPlan, onEditStoryboard }: Props) {
  const compatible = compatibleSalesVideoModels(plan, script, references, videoModels, audios);
  return (
    <aside className="sales-video-duration-notice" aria-label="视频时长与模型不兼容">
      <p role="status">{error}</p>
      {!compatible.length && <p>已配置模型中暂无兼容当前脚本和引用素材的选项，可更换参考脚本或在设置中配置合适的视频模型。</p>}
      <div>
        {compatible.slice(0, 3).map((model) => (
          <button key={model.id} type="button" disabled={disabled} className={salesGhostButtonClass}
            onClick={() => onPatchPlan(salesVideoModelPatch(model.id))}>
            改用 {model.name} · {model.durationSec} 秒
          </button>
        ))}
        <button type="button" disabled={disabled} className={salesGhostButtonClass} onClick={onEditStoryboard}>更换参考脚本</button>
      </div>
    </aside>
  );
}

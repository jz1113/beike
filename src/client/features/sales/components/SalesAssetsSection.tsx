import type { SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { salesAssetRecovery } from '../model/salesAssetProgress';
import { SalesAssetCard } from './SalesAssetCard';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { SalesModelPicker } from './SalesModelPicker';
import { CircleDashed } from 'lucide-react';
import { salesCardClass, salesSectionTitleClass } from './salesChrome';

interface Props {
  script: VideoSalesScript;
  aspectRatio?: string;
  productImages?: SalesImageRef[];
  imageModel: string;
  disabled: boolean;
  onStop?: () => void;
  onModel: (model: string) => void;
  onEditPrompt: (id: string, prompt: string) => void;
  onGenerate: (id?: string, queryOnly?: boolean) => void;
}

export function SalesAssetsSection({ script, aspectRatio, productImages, imageModel, disabled, onStop, onModel, onEditPrompt, onGenerate }: Props) {
  const { ready, imageModels } = usePreferenceModels();
  const assets = script.assets || [];
  return (
    <div className="sales-assets-workspace space-y-4 p-4 sm:p-5">
      {assets.length === 0 && <div className={`${salesCardClass} flex items-center gap-3 p-5 text-sm`}><CircleDashed className="h-5 w-5 text-slate-400" /><span>此方案无需额外绘图，确认现有素材后即可进入视频生成。</span></div>}
      {assets.length > 0 && <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className={salesSectionTitleClass}>素材清单</h3><div className="flex items-center gap-2 text-xs text-slate-500"><span>绘图模型</span><div className="w-48"><SalesModelPicker modality="image" value={imageModel} models={imageModels} ready={ready} disabled={disabled} onChange={onModel} /></div></div></div>
        <div className="sales-asset-grid">
          {assets.map((asset) => <div key={asset.id} className="min-w-0"><SalesAssetCard asset={asset} assets={assets} aspectRatio={aspectRatio} productImages={productImages} disabled={disabled || Boolean(script.planStale && salesAssetRecovery(asset) !== 'query')} onStop={onStop} modelReady={Boolean(imageModel)} onEdit={(prompt) => onEditPrompt(asset.id, prompt)} onGenerate={(queryOnly) => onGenerate(asset.id, queryOnly)} /></div>)}
        </div>
      </div>
      }
    </div>
  );
}

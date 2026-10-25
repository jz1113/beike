import type { SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { salesAssetRecovery } from '../model/salesAssetProgress';
import { SalesAssetCard } from './SalesAssetCard';
import { CircleDashed } from 'lucide-react';
import { salesCardClass, salesSectionTitleClass } from './salesChrome';

interface Props {
  script: VideoSalesScript;
  aspectRatio?: string;
  productImages?: SalesImageRef[];
  imageModel: string;
  disabled: boolean;
  onModel: (model: string) => void;
  onEditPrompt: (id: string, prompt: string) => void;
  onGenerate: (id?: string, queryOnly?: boolean, validateOnly?: boolean) => void;
}

export function SalesAssetsSection({ script, aspectRatio, productImages, imageModel, disabled, onGenerate }: Props) {
  const assets = script.assets || [];
  const legacyProductIndexes = productImages ? productImages.filter((image) => image.url.trim() && !image.unavailable).map((image) => image.index) : [...new Set(script.shots.flatMap((shot) => typeof shot.imageIndex === 'number' ? [shot.imageIndex] : []))];
  return (
    <div className="space-y-4 p-4 sm:p-5">
      {assets.length === 0 && <div className={`${salesCardClass} flex items-center gap-3 p-5 text-sm`}><CircleDashed className="h-5 w-5 text-slate-400" /><span>此方案无需额外绘图，确认现有素材后即可进入视频生成。</span></div>}
      {assets.length > 0 && <div className="min-w-0">
        <div className="mb-3"><h3 className={salesSectionTitleClass}>素材清单</h3></div>
        <div className="grid min-w-0 grid-cols-1 items-start gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {assets.map((asset) => <div key={asset.id} className="min-w-0"><SalesAssetCard asset={asset} assets={assets} aspectRatio={aspectRatio} productImages={productImages} legacyProductIndexes={legacyProductIndexes} disabled={disabled || Boolean(script.planStale && salesAssetRecovery(asset) !== 'query')} modelReady={Boolean(imageModel)} onGenerate={(queryOnly) => onGenerate(asset.id, queryOnly)} /></div>)}
        </div>
      </div>
      }
    </div>
  );
}

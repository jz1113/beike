import type { SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { SalesModelPicker } from './SalesModelPicker';
import { salesAssetProgress, salesAssetRecovery } from '../model/salesAssetProgress';
import { SalesAssetCard } from './SalesAssetCard';
import { salesCardClass } from './salesChrome';

interface Props {
  script: VideoSalesScript;
  productImages?: SalesImageRef[];
  imageModel: string;
  disabled: boolean;
  onModel: (model: string) => void;
  onEditPrompt: (id: string, prompt: string) => void;
  onGenerate: (id?: string, queryOnly?: boolean, validateOnly?: boolean) => void;
}

export function SalesAssetsSection({ script, productImages, imageModel, disabled, onModel, onEditPrompt, onGenerate }: Props) {
  const { ready, imageModels } = usePreferenceModels();
  const assets = script.assets || [];
  const progress = salesAssetProgress(assets);
  const legacyProductIndexes = productImages ? productImages.filter((image) => image.url.trim() && !image.unavailable).map((image) => image.index) : [...new Set(script.shots.flatMap((shot) => typeof shot.imageIndex === 'number' ? [shot.imageIndex] : []))];
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <section className={`${salesCardClass} space-y-3 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">素材图片</h2><span className="text-xs text-slate-500">{progress.confirmed} / {progress.total} 张已确认 · 已生成 {progress.generated}/{progress.total} 张</span></div>
        {progress.total > 0 && <div className="space-y-2">
          <progress aria-label="素材图片生成进度" max={progress.total} value={progress.generated} className="block h-1.5 w-full overflow-hidden rounded-full accent-emerald-500" />
          <p className="text-[11px] leading-5 text-slate-500">必需素材 {progress.requiredGenerated}/{progress.required} 张已生成{progress.failed > 0 ? ` · ${progress.failed} 张失败，可单独重试` : ''}{progress.queryable ? ' · 有原任务可继续查询' : ''}</p>
        </div>}
        <p className="text-xs leading-6 text-slate-500">生成完成后请检查人物、商品外观与细节，确认图片后继续。单条制作默认人工确认，也可展开自动校验。</p>
        {script.beat && <p className="text-xs leading-6 text-slate-500">服饰素材优先中景或中全景，保留整件商品与自然比例；讲解图需完整头部和嘴部入画，不放大脸部、胸前局部或 logo。</p>}
        {assets.length > 0 && <div className="max-w-md space-y-1.5"><span className="text-xs text-slate-500">绘图模型</span><SalesModelPicker modality="image" value={imageModel} models={imageModels} ready={ready} disabled={disabled} onChange={onModel} /></div>}
        {script.planStale && <p role="alert" className="text-xs text-amber-600 dark:text-amber-300">商品或方案已变更，请先更新口播脚本。</p>}
        {progress.queryable && <button type="button" disabled={disabled} onClick={() => onGenerate(undefined, true)} className="rounded-full border border-black/10 px-3 py-2 text-xs dark:border-white/15">继续查询原图片任务（不重新提交）</button>}
        {assets.length > 0 && assets.every((asset) => !asset.required || (asset.status === 'done' && asset.url)) && <details open={assets.some((asset) => asset.validation === 'conflict')}><summary className="cursor-pointer text-xs text-slate-500">自动校验（可选）</summary><p className="my-2 text-xs text-slate-500">调用多模态模型检查已有图片，可能计费，不重新生图。</p><button type="button" disabled={disabled || Boolean(script.planStale)} onClick={() => onGenerate(undefined, false, true)} className="rounded-full border border-black/10 px-3 py-2 text-xs dark:border-white/15">仅重新校验已有图片（不重新生图）</button></details>}
        {assets.length === 0 && <p className="text-sm">此方案无需额外绘图，确认素材后即可进入视频定稿。</p>}
      </section>
      <div className="grid gap-4 2xl:grid-cols-2">
        {assets.map((asset) => <SalesAssetCard key={asset.id} asset={asset} assets={assets} productImages={productImages} legacyProductIndexes={legacyProductIndexes} disabled={disabled || Boolean(script.planStale && salesAssetRecovery(asset) !== 'query')} modelReady={Boolean(imageModel)} onEdit={(prompt) => onEditPrompt(asset.id, prompt)} onGenerate={(queryOnly) => onGenerate(asset.id, queryOnly)} />)}
      </div>
      <p className="text-xs leading-6 text-slate-500">生成素材与视频定稿是独立操作。单项重新生成也可能计费；生成完成后不会自动提交视频。</p>
    </div>
  );
}

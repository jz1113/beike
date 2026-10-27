import { Image as ImageIcon } from 'lucide-react';
import { salesActualReferences, type SalesCreativeAsset, type SalesImageRef, type VideoSalesScript } from '@shared/domain/sales';
import { salesFocusClass } from './salesChrome';
import { SalesImagePreviewButton } from './SalesImagePreview';

function assetStatus(asset: SalesCreativeAsset): string {
  if (asset.status === 'failed') return '生成失败';
  if (asset.status === 'generating') return '生成中';
  if (asset.status === 'uncertain') return '待查询';
  if (asset.status !== 'done' || !asset.url) return '待生成';
  return asset.validation === 'passed' && asset.validationSource === 'manual' ? '已确认' : '待确认';
}

export function SalesVideoMaterials({ script, productImages }: { script: VideoSalesScript; productImages: SalesImageRef[] }) {
  let references: ReturnType<typeof salesActualReferences> = [];
  let referenceError = '';
  try { references = salesActualReferences(script, productImages); }
  catch (error) {
    referenceError = error instanceof Error ? error.message : '素材尚未准备完整';
    const used = [...new Set(script.shots.map((shot) => shot.imageIndex))];
    references = [
      ...used.flatMap((index) => productImages.filter((image) => image.index === index)).map((image) => ({ id: `product-${image.index}`, kind: 'product' as const, label: `商品参考 ${image.index + 1}`, url: image.url })),
      ...(script.assets || []).filter((asset) => asset.required || asset.url).map((asset) => ({ id: asset.id, kind: asset.kind, label: asset.label, url: asset.url || '' })),
    ];
  }
  const previewImages = references.map((reference, index) => ({ ...reference, label: `图片${index + 1}` }));
  return <section aria-label="使用素材" className="sales-material-tray">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">使用素材</h2><span className="text-xs tabular-nums text-slate-400">{references.length} 张</span></div>
    {referenceError && <p role="status" className="sr-only">{referenceError}</p>}
    <ul className="sales-result-materials mt-3 grid grid-cols-4 gap-2">
      {references.map((reference, index) => {
        const asset = script.assets?.find((item) => item.id === reference.id);
        const content = <>
          <span className="relative block aspect-square overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 dark:border-white/10 dark:bg-white/[0.04]">
            {reference.url ? <img src={reference.url} alt={`图片${index + 1}`} loading="lazy" className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center text-slate-400"><ImageIcon className="h-5 w-5" aria-hidden /></span>}
          </span>
          <span className="mt-1.5 block text-center text-[11px] text-slate-500 dark:text-slate-400">图片{index + 1}</span>
        </>;
        const label = `图片${index + 1}${asset ? ` · ${assetStatus(asset)}` : ''}`;
        return <li key={reference.id} className="min-w-0">{reference.url ? <SalesImagePreviewButton image={previewImages[index]} images={previewImages} title={label} className={`block w-full cursor-zoom-in text-left ${salesFocusClass}`}>{content}</SalesImagePreviewButton> : <div title={label} aria-label={label}>{content}</div>}</li>;
      })}
    </ul>
  </section>;
}

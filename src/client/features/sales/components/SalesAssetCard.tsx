import { Loader2, RotateCcw } from 'lucide-react';
import type { SalesCreativeAsset, SalesImageRef } from '@shared/domain/sales';
import { explainSalesReferenceError, salesReferenceRejection } from '../model/salesAssetHelpers';
import { salesAssetRecovery } from '../model/salesAssetProgress';
import { salesGhostButtonClass } from './salesChrome';

export function SalesAssetCard({ asset, assets, aspectRatio, productImages, legacyProductIndexes, disabled, modelReady, onGenerate }: { asset: SalesCreativeAsset; assets: SalesCreativeAsset[]; aspectRatio?: string; productImages?: SalesImageRef[]; legacyProductIndexes: number[]; disabled: boolean; modelReady: boolean; onEdit?: (prompt: string) => void; onGenerate: (queryOnly?: boolean) => void }) {
  const dependencies = (asset.referenceAssetIds || []).map((id) => assets.find((item) => item.id === id));
  const dependencyPending = dependencies.some((item) => !item?.url || item.status !== 'done');
  const usedIndexes = asset.usesProduct ? (asset.productImageIndexes ?? legacyProductIndexes) : [];
  const productLabels = usedIndexes.map((index) => `商品参考 ${index + 1}`);
  const matchedProducts = usedIndexes.map((index) => ({ index, image: productImages?.find((img) => img.index === index) })).filter((item) => Boolean(item.image?.url));
  const referenceLabels = [...productLabels, ...dependencies.map((item) => item?.label || '缺失参考')];
  const referenceIssue = [asset.error, asset.validationReason].find((item) => salesReferenceRejection(item));
  const referenceRejected = Boolean(referenceIssue && !asset.taskId && asset.status !== 'done');
  const inFlight = asset.status === 'generating';
  const recovery = salesAssetRecovery(asset);
  const canQuery = recovery === 'query';
  const ratio = /^\d+:\d+$/.test(aspectRatio || '') ? aspectRatio!.replace(':', ' / ') : '9 / 16';
  return (
    <article className="flex min-w-0 flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl bg-slate-100 dark:bg-white/[0.04]" style={{ aspectRatio: ratio }}>
        {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" className="block h-full w-full" aria-label={`查看${asset.label}完整图片`}><img src={asset.url} alt={asset.label} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" /></a> : <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-500">{inFlight && <Loader2 className="h-5 w-5 animate-spin" />}{inFlight ? '正在生成图片' : '待生成素材图'}</div>}
      </div>
      <h3 title={asset.label} className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-5">{asset.label}</h3>
      {asset.validation === 'conflict' && <p role="status" className="text-[11px] text-rose-500">内容冲突</p>}
      {(asset.usesProduct || dependencies.length > 0) && <div className="flex min-w-0 items-center gap-1.5" aria-label="本素材参考图片" title={`使用参考：${referenceLabels.join('、')}`}>
        <span className="text-[11px] text-slate-500">参考</span>
        {matchedProducts.map(({ index, image }) => <a key={index} href={image!.url} target="_blank" rel="noreferrer" title={`商品参考 #${index + 1}`} className="block overflow-hidden rounded-md border border-slate-200 bg-white dark:border-white/10"><img src={image!.url} alt={`商品参考 ${index + 1}`} className="h-7 w-7 object-contain" /></a>)}
        {matchedProducts.length === 0 && <span className="text-[11px] text-slate-500">{productLabels.join('、')}</span>}
        {dependencies.length > 0 && <span className="min-w-0 truncate text-[11px] text-slate-500">{dependencies.map((item) => item?.label || '缺失参考').join('、')}</span>}
        <span className="sr-only">使用参考：{referenceLabels.join('、')}</span>
      </div>}
      {dependencies.length > 0 && (dependencyPending || referenceRejected) && <p className="text-[11px] leading-4 text-amber-600 dark:text-amber-300">{dependencyPending ? '请先生成参考图片' : '前置图已生成，可直接重试'}</p>}
      {asset.validationReason && asset.validationReason !== referenceIssue && asset.validationReason !== '人工已确认' && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">{asset.validationReason}</p>}
      {referenceIssue && <p role="alert" className="text-xs leading-5 text-rose-500">{explainSalesReferenceError(referenceIssue, referenceLabels)}</p>}
      {asset.error && asset.error !== referenceIssue && <p role="alert" className="text-xs leading-5 text-rose-500">{asset.error}</p>}
      {asset.status === 'uncertain' && !referenceRejected && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">提交结果未确认，请先核对服务商记录，重新提交可能重复计费。</p>}
      <button type="button" title={asset.url ? '重新生成会再次提交绘图任务，可能计费' : undefined} disabled={disabled || (canQuery ? false : Boolean(recovery) || dependencyPending || !modelReady || !asset.prompt.trim())} onClick={() => onGenerate(canQuery)} className={`min-h-8 px-3 py-1.5 disabled:opacity-40 ${salesGhostButtonClass}`}>{inFlight && !canQuery ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}{canQuery ? '继续查询此素材（不重新生图）' : recovery === 'verify' ? '提交结果待核实' : asset.url ? '重新生成此素材（可能计费）' : asset.status === 'failed' || asset.status === 'uncertain' ? '重试此素材（可能计费）' : '生成此素材（可能计费）'}</button>
    </article>
  );
}

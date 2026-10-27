import { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import type { SalesCreativeAsset, SalesImageRef } from '@shared/domain/sales';
import { explainSalesReferenceError, salesReferenceRejection } from '../model/salesAssetHelpers';
import { salesAssetRecovery } from '../model/salesAssetProgress';
import { salesGhostButtonClass } from './salesChrome';
import { SalesImagePreviewButton } from './SalesImagePreview';

export function SalesAssetCard({ asset, assets, aspectRatio, disabled, modelReady, onGenerate, onStop }: { asset: SalesCreativeAsset; assets: SalesCreativeAsset[]; aspectRatio?: string; productImages?: SalesImageRef[]; disabled: boolean; modelReady: boolean; onStop?: () => void; onEdit?: (prompt: string) => void; onGenerate: (queryOnly?: boolean) => void }) {
  const dependencies = (asset.referenceAssetIds || []).map((id) => assets.find((item) => item.id === id));
  const dependencyPending = dependencies.some((item) => !item?.url || item.status !== 'done');
  const usedIndexes = asset.usesProduct ? (asset.productImageIndexes ?? []) : [];
  const missingProductReferences = Boolean(asset.usesProduct && !usedIndexes.length);
  const productLabels = usedIndexes.map((index) => `商品参考 ${index + 1}`);
  const referenceLabels = [...productLabels, ...dependencies.map((item) => item?.label || '缺失参考')];
  const referenceIssue = [asset.error, asset.validationReason].find((item) => salesReferenceRejection(item));
  const referenceRejected = Boolean(referenceIssue && !asset.taskId && asset.status !== 'done');
  const inFlight = asset.status === 'generating';
  const recovery = salesAssetRecovery(asset);
  const canQuery = recovery === 'query';
  const ratio = /^\d+:\d+$/.test(aspectRatio || '') ? aspectRatio!.replace(':', ' / ') : '9 / 16';
  return (
    <article aria-label={asset.label} className="sales-asset-card">
      <div className="sales-asset-preview relative overflow-hidden rounded-xl bg-slate-100 dark:bg-white/[0.04]" style={{ aspectRatio: ratio }}>
        {asset.url && <SalesImagePreviewButton image={{ url: asset.url, label: asset.label, kind: asset.kind }} images={assets.flatMap((item) => item.url ? [{ url: item.url, label: item.label, kind: item.kind }] : [])} className="block h-full w-full cursor-zoom-in" aria-label={`查看${asset.label}完整图片`}><img src={asset.url} alt={asset.label} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" /></SalesImagePreviewButton>}
        {inFlight ? <SalesAssetGeneratingPreview onStop={onStop} /> : !asset.url && <div className="flex h-full items-center justify-center text-xs text-slate-500">待生成素材图</div>}
      </div>
      <div className="sales-asset-controls">
      {asset.validation === 'conflict' && <p role="status" className="text-[11px] text-rose-500">内容冲突</p>}
      {missingProductReferences && <p role="alert" className="text-xs leading-5 text-amber-600 dark:text-amber-300">此旧素材缺少商品参考编号，请更新脚本后再生成。</p>}
      {dependencies.length > 0 && (dependencyPending || referenceRejected) && <p className="text-[11px] leading-4 text-amber-600 dark:text-amber-300">{dependencyPending ? '请先生成参考图片' : '前置图已生成，可直接重试'}</p>}
      {asset.validationReason && asset.validationReason !== referenceIssue && asset.validationReason !== '人工已确认' && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">{asset.validationReason}</p>}
      {referenceIssue && <p role="alert" className="text-xs leading-5 text-rose-500">{explainSalesReferenceError(referenceIssue, referenceLabels)}</p>}
      {asset.error && asset.error !== referenceIssue && <p role="alert" className="text-xs leading-5 text-rose-500">{asset.error}</p>}
      {asset.status === 'uncertain' && !referenceRejected && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">提交结果未确认，请先核对服务商记录，重新提交可能重复计费。</p>}
      <button type="button" title={asset.url ? '重新生成会再次提交绘图任务，可能计费' : undefined} disabled={disabled || (canQuery ? false : Boolean(recovery) || missingProductReferences || dependencyPending || !modelReady || !asset.prompt.trim())} onClick={() => onGenerate(canQuery)} className={`mt-auto min-h-9 px-3 py-2 disabled:opacity-40 ${salesGhostButtonClass}`}>{inFlight && !canQuery ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}{canQuery ? '继续查询此素材（不重新生图）' : recovery === 'verify' ? '提交结果待核实' : asset.url ? '重新生成此素材（可能计费）' : asset.status === 'failed' || asset.status === 'uncertain' ? '重试此素材（可能计费）' : '生成此素材（可能计费）'}</button>
      </div>
    </article>
  );
}

function SalesAssetGeneratingPreview({ onStop }: { onStop?: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100/95 p-2 text-center dark:bg-[#141417]/95">
    <Loader2 className="h-6 w-6 animate-spin text-amber-500" aria-hidden />
    <p role="status" className="text-xs leading-6 text-slate-600 dark:text-slate-300">正在生成图片<br /><span className="tabular-nums">已等待 {elapsed}s</span></p>
    {onStop && <button type="button" onClick={onStop} className={`min-h-8 ${salesGhostButtonClass}`}>停止</button>}
  </div>;
}

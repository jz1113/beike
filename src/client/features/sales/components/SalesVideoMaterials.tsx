import { Image as ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { salesActualReferences, type SalesCreativeAsset, type SalesImageRef, type VideoSalesScript } from '@shared/domain/sales';
import { salesFocusClass } from './salesChrome';

function assetStatus(asset: SalesCreativeAsset): string {
  if (asset.status === 'failed') return '生成失败';
  if (asset.status === 'generating') return '生成中';
  if (asset.status === 'uncertain') return '待查询';
  if (asset.status !== 'done' || !asset.url) return '待生成';
  return asset.validation === 'passed' && asset.validationSource === 'manual' ? '已确认' : '待确认';
}

export function SalesVideoMaterials({ script, productImages }: { script: VideoSalesScript; productImages: SalesImageRef[] }) {
  const assets = script.assets || [];
  let references: ReturnType<typeof salesActualReferences> = [];
  let referenceError = '';
  try { references = salesActualReferences(script, productImages); }
  catch (error) { referenceError = error instanceof Error ? error.message : '素材尚未准备完整'; }
  return <>
    <MaterialSection title="生成素材" count={assets.length}>
      {assets.length ? assets.map((asset) => <MaterialRow key={asset.id} label={asset.label} url={asset.url} status={assetStatus(asset)} />) : <li className="text-xs leading-6 text-slate-500">本次无需生成额外素材</li>}
    </MaterialSection>
    <MaterialSection title="整体使用素材" count={references.length}>
      {referenceError ? <li role="status" className="text-xs leading-6 text-amber-700 dark:text-amber-300">{referenceError}</li> : references.map((ref, index) => <MaterialRow key={ref.id} label={ref.label} url={ref.url} status={`图片 ${index + 1}`} />)}
    </MaterialSection>
  </>;
}

function MaterialSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section aria-label={title} className="mt-5 border-t border-slate-200/70 pt-5 dark:border-white/10">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      <span className="text-xs tabular-nums text-slate-400">{count} 张</span>
    </div>
    <ul className="mt-3 space-y-2">{children}</ul>
  </section>;
}

function MaterialRow({ label, url, status }: { label: string; url?: string; status: string }) {
  const content = <>
    {url ? <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-md bg-white object-contain" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/[0.04] text-slate-400 dark:bg-white/[0.06]"><ImageIcon className="h-4 w-4" aria-hidden /></span>}
    <span className="min-w-0 flex-1 break-words">{label}</span>
    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{status}</span>
  </>;
  const className = 'flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200';
  return <li>{url ? <a href={url} target="_blank" rel="noreferrer" title={`查看${label}`} className={`${className} ${salesFocusClass} hover:border-amber-500/40`}>{content}</a> : <div className={className}>{content}</div>}</li>;
}

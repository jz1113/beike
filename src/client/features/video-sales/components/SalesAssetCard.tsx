import { Loader2, RotateCcw } from 'lucide-react';
import type { SalesCreativeAsset } from '@shared/domain/video-sales';
import { explainSalesReferenceError, salesReferenceRejection } from '../model/salesAssetHelpers';
import { salesAssetRecovery } from '../model/salesAssetProgress';
import { SalesPromptDetails } from './salesPlanning';
import { salesCardClass, salesGhostButtonClass } from './salesChrome';

const STATUS = { pending: '待生成', generating: '生成中', done: '已生成', failed: '失败', uncertain: '提交待确认' };
const VALIDATION = { pending: '待校验', passed: '校验通过', conflict: '内容冲突', uncertain: '校验待确认' };
const KIND = { person: '出镜人物', face: '人物特写', scene: '场景', keyframe: '关键帧' };

export function SalesAssetCard({ asset, assets, legacyProductIndexes, disabled, modelReady, onEdit, onGenerate }: { asset: SalesCreativeAsset; assets: SalesCreativeAsset[]; legacyProductIndexes: number[]; disabled: boolean; modelReady: boolean; onEdit: (prompt: string) => void; onGenerate: (queryOnly?: boolean) => void }) {
  const dependencies = (asset.referenceAssetIds || []).map((id) => assets.find((item) => item.id === id));
  const dependencyPending = dependencies.some((item) => !item?.url || item.status !== 'done');
  const productLabels = asset.usesProduct ? (asset.productImageIndexes ?? legacyProductIndexes).map((index) => `商品参考 ${index + 1}`) : [];
  const referenceLabels = [...productLabels, ...dependencies.map((item) => item?.label || '缺失参考')];
  const referenceIssue = [asset.error, asset.validationReason].find((item) => salesReferenceRejection(item));
  const referenceRejected = Boolean(referenceIssue && !asset.taskId && asset.status !== 'done');
  const inFlight = asset.status === 'generating';
  const recovery = salesAssetRecovery(asset);
  const canQuery = recovery === 'query';
  return (
    <article className={`${salesCardClass} space-y-3 p-4`}>
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{asset.label}</h3><span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] dark:bg-white/10">{KIND[asset.kind]} · {asset.required ? '必需' : '可选'}</span></div>
      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500" role="status"><span>{referenceRejected ? '参考图被拒绝' : STATUS[asset.status || 'pending']}</span><span className={asset.validation === 'conflict' ? 'text-rose-500' : asset.validation === 'passed' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{asset.validationSource === 'manual' && asset.validation === 'passed' ? '人工已确认' : asset.validation === 'pending' || !asset.validation ? '待确认' : VALIDATION[asset.validation]}</span></div>
      {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" className="mx-auto block w-fit max-w-full overflow-hidden rounded-xl bg-black/5 dark:bg-white/5" aria-label={`查看${asset.label}完整图片`}><img src={asset.url} alt={asset.label} className="block h-auto max-h-80 w-auto max-w-full rounded-xl" /></a> : <div className="flex h-36 items-center justify-center gap-2 rounded-xl bg-black/5 text-xs text-slate-500 dark:bg-white/5">{inFlight && <Loader2 className="h-4 w-4 animate-spin" />}{inFlight ? '正在生成图片' : '待生成素材图'}</div>}
      <SalesPromptDetails title="绘图提示词" value={asset.prompt} disabled={disabled || Boolean(recovery)} onChange={onEdit} initiallyOpen={asset.validation === 'conflict' || asset.status === 'failed' || referenceRejected} />
      {dependencies.length > 0 && <p className="text-[11px] text-slate-500">参考依赖：{dependencies.map((item) => item?.label || '缺失参考').join('、')}{dependencyPending ? ' · 请先生成这些图片' : referenceRejected ? ' · 前置图已生成，可直接重试' : ''}</p>}
      {asset.usesProduct && <p className="text-[11px] text-slate-500">使用商品原图：{productLabels.join('、')}（按本张目标视角）</p>}
      {asset.validationReason && asset.validationReason !== referenceIssue && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">{asset.validationReason}</p>}
      {referenceIssue && <p role="alert" className="text-xs leading-5 text-rose-500">{explainSalesReferenceError(referenceIssue, referenceLabels)}</p>}
      {asset.error && asset.error !== referenceIssue && <p role="alert" className="text-xs leading-5 text-rose-500">{asset.error}</p>}
      {asset.status === 'uncertain' && !referenceRejected && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">提交结果未确认，请先核对服务商记录，重新提交可能重复计费。</p>}
      <button type="button" disabled={disabled || (canQuery ? false : Boolean(recovery) || dependencyPending || !modelReady || !asset.prompt.trim())} onClick={() => onGenerate(canQuery)} className={`min-h-9 px-3 py-2 disabled:opacity-40 ${salesGhostButtonClass}`}><RotateCcw className="h-3.5 w-3.5" />{canQuery ? '继续查询此素材（不重新生图）' : recovery === 'verify' ? '提交结果待核实' : asset.url ? '重新生成此素材（可能计费）' : asset.status === 'failed' || asset.status === 'uncertain' ? '重试此素材（可能计费）' : '生成此素材（可能计费）'}</button>
    </article>
  );
}

import { Loader2, RotateCcw } from 'lucide-react';
import type { SalesCreativeAsset, VideoSalesScript } from '@shared/domain/video-sales';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesPromptDetails } from './SalesPromptDetails';
import { salesCardClass, salesGhostButtonClass } from './salesSurface';

interface Props {
  script: VideoSalesScript;
  imageModel: string;
  disabled: boolean;
  onModel: (model: string) => void;
  onEditPrompt: (id: string, prompt: string) => void;
  onGenerate: (id?: string, queryOnly?: boolean) => void;
}

const STATUS = { pending: '待生成', generating: '生成中', done: '已生成', failed: '失败', uncertain: '提交待确认' };
const VALIDATION = { pending: '待校验', passed: '校验通过', conflict: '内容冲突', uncertain: '校验待确认' };
const KIND = { person: '出镜人物', face: '人物特写', scene: '场景', keyframe: '关键帧' };

export function SalesAssetsSection({ script, imageModel, disabled, onModel, onEditPrompt, onGenerate }: Props) {
  const { ready, imageModels } = usePreferenceModels();
  const assets = script.assets || [];
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <section className={`${salesCardClass} space-y-3 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">素材图片</h2><span className="text-xs text-slate-500">{assets.filter((asset) => asset.url && asset.status === 'done' && asset.validation === 'passed').length} / {assets.length} 张已通过校验</span></div>
        <p className="text-xs leading-6 text-slate-500">仅生成脚本需要的素材，人物按需出现，无需上传人物。人物特写继承同一人物参考，商品颜色与外观按已确认商品图保持一致。</p>
        {assets.length > 0 && <div className="max-w-md space-y-1.5"><span className="text-xs text-slate-500">绘图模型</span><SalesModelPicker modality="image" value={imageModel} models={imageModels} ready={ready} disabled={disabled} onChange={onModel} /></div>}
        {script.planStale && <p role="alert" className="text-xs text-amber-600 dark:text-amber-300">商品或方案已变更，请先更新口播脚本。</p>}
        {assets.some((asset) => asset.taskId && ['generating', 'uncertain'].includes(asset.status || '')) && <button type="button" disabled={disabled} onClick={() => onGenerate(undefined, true)} className="rounded-full border border-black/10 px-3 py-2 text-xs dark:border-white/15">继续查询原图片任务（不重新提交）</button>}
        {assets.length === 0 && <p className="text-sm">此方案无需额外绘图，确认素材后即可进入视频定稿。</p>}
      </section>
      <div className="grid gap-4 2xl:grid-cols-2">
        {assets.map((asset) => <AssetCard key={asset.id} asset={asset} assets={assets} disabled={disabled || Boolean(script.planStale)} modelReady={Boolean(imageModel)} onEdit={(prompt) => onEditPrompt(asset.id, prompt)} onGenerate={() => onGenerate(asset.id)} />)}
      </div>
      <p className="text-xs leading-6 text-slate-500">生成素材与视频定稿是独立操作。单项重新生成也可能计费；生成完成后不会自动提交视频。</p>
    </div>
  );
}

function AssetCard({ asset, assets, disabled, modelReady, onEdit, onGenerate }: { asset: SalesCreativeAsset; assets: SalesCreativeAsset[]; disabled: boolean; modelReady: boolean; onEdit: (prompt: string) => void; onGenerate: () => void }) {
  const dependencies = (asset.referenceAssetIds || []).map((id) => assets.find((item) => item.id === id));
  const dependencyMissing = dependencies.some((item) => !item?.url || item.status !== 'done' || item.validation !== 'passed');
  const inFlight = asset.status === 'generating';
  return (
    <article className={`${salesCardClass} space-y-3 p-4`}>
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{asset.label}</h3><span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] dark:bg-white/10">{KIND[asset.kind]} · {asset.required ? '必需' : '可选'}</span></div>
      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500" role="status"><span>{STATUS[asset.status || 'pending']}</span><span className={asset.validation === 'conflict' ? 'text-rose-500' : asset.validation === 'passed' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{VALIDATION[asset.validation || 'pending']}</span></div>
      {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" className="block rounded-xl bg-black/5 dark:bg-white/5" aria-label={`查看${asset.label}完整图片`}><img src={asset.url} alt={asset.label} className="max-h-80 w-full rounded-xl object-contain" /></a> : <div className="flex h-36 items-center justify-center gap-2 rounded-xl bg-black/5 text-xs text-slate-500 dark:bg-white/5">{inFlight && <Loader2 className="h-4 w-4 animate-spin" />}{inFlight ? '正在生成图片' : '待生成素材图'}</div>}
      <SalesPromptDetails title="绘图提示词" value={asset.prompt} disabled={disabled || inFlight} onChange={onEdit} initiallyOpen={asset.validation === 'conflict' || asset.status === 'failed'} />
      {dependencies.length > 0 && <p className="text-[11px] text-slate-500">参考依赖：{dependencies.map((item) => item?.label || '缺失参考').join('、')}{dependencyMissing ? ' · 请先生成并通过校验' : ''}</p>}
      {asset.usesProduct && <p className="text-[11px] text-slate-500">使用本次已确认的商品参考图</p>}
      {asset.validationReason && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">{asset.validationReason}</p>}
      {asset.error && <p role="alert" className="text-xs leading-5 text-rose-500">{asset.error}</p>}
      {asset.status === 'uncertain' && <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">提交结果未确认，请先核对服务商记录，重新提交可能重复计费。</p>}
      <button type="button" disabled={disabled || inFlight || dependencyMissing || !modelReady || !asset.prompt.trim()} onClick={onGenerate} className={`min-h-9 px-3 py-2 disabled:opacity-40 ${salesGhostButtonClass}`}><RotateCcw className="h-3.5 w-3.5" />{asset.url ? '重新生成此素材（可能计费）' : asset.status === 'failed' || asset.status === 'uncertain' ? '重试此素材（可能计费）' : '生成此素材（可能计费）'}</button>
    </article>
  );
}

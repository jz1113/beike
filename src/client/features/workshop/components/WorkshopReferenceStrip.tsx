import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { BatchProductItem } from '../model/batchTypes';

export function WorkshopReferenceStrip({ item }: { item: BatchProductItem }) {
  const shots = item.prompts.filter(shot => shot.sourceReferenceImageUrl).slice(0, 4);
  if (!shots.length) return null;
  return <section aria-label="实际生图参考" className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/5">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-100">商品身份 + 逐镜参考样本</h5>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">原图随提示词一起送入生图 · 旧商品按当前商品替换</p>
    </div>
    <div className="grid grid-cols-5 gap-2">
      <figure className="min-w-0">
        <img src={proxyMediaUrl(item.selectedProductImages[0] || item.coverImage)} alt="当前商品身份锚图" className="aspect-[3/4] w-full rounded-lg bg-white object-contain" />
        <figcaption className="mt-1 text-center text-[10px] text-slate-500 dark:text-slate-400">商品身份</figcaption>
      </figure>
      {shots.map(shot => <figure key={shot.shot_no} className="min-w-0">
        <img src={proxyMediaUrl(shot.sourceReferenceImageUrl!)} alt={`镜头${shot.shot_no}的参考原图`} className="aspect-[3/4] w-full rounded-lg bg-slate-100 object-cover dark:bg-white/10" />
        <figcaption className="mt-1 text-center text-[10px] text-slate-500 dark:text-slate-400">镜头 {shot.shot_no}</figcaption>
      </figure>)}
    </div>
    {item.appliedSkillSnapshot && <details className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer">本次使用技能：{item.appliedSkillSnapshot.name}</summary>
      <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap leading-6 select-text">{item.appliedSkillSnapshot.promptSnippet}</p>
    </details>}
    <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">构图、光线、动作与生活质感来自对应样本；人物、穿搭、场景仅在明确选择替换时改变。相似度仍需用实际成图核对。</p>
  </section>;
}

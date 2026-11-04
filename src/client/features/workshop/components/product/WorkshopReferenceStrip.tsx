import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { BatchProductItem } from '../../model/batchTypes';

export function WorkshopReferenceStrip({ item }: { item: BatchProductItem }) {
  const shots = item.prompts.filter(shot => shot.sourceReferenceImageUrl).slice(0, 4);
  const skill = item.appliedSkillSnapshot;
  if (!shots.length && !skill) return null;
  const version = skill?.libraryVersion;
  const versionLabel = version && /^[a-f0-9]{16,}$/i.test(version) ? version.slice(0, 8) : version;
  return <section aria-label="本次创作依据" className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/5">
    {shots.length > 0 && <>
      <h5 className="mb-2 text-xs font-semibold">历史参考图</h5>
      <div className="grid grid-cols-4 gap-2">
        {shots.map(shot => <figure key={shot.shot_no} className="min-w-0">
          <img src={proxyMediaUrl(shot.sourceReferenceImageUrl!)} alt={`镜头${shot.shot_no}的参考原图`} className="aspect-[3/4] w-full rounded-lg bg-slate-100 object-cover dark:bg-white/10" />
          <figcaption className="mt-1 text-center text-[10px] text-slate-500 dark:text-slate-400">镜头 {shot.shot_no}</figcaption>
        </figure>)}
      </div>
    </>}
    {skill && <details className="text-[11px] text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer">本次使用技能：{skill.id === '__category_skill__' && !skill.learningScopeId ? '基础创作技能' : skill.name}{versionLabel && ` · 版本 ${versionLabel}`}</summary>
      <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap leading-6 select-text">{skill.promptSnippet}</p>
    </details>}
  </section>;
}

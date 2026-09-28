import { WorkshopAppearanceSelection } from './WorkshopAppearanceSelection';
import { isAppearanceRotation } from '@shared/domain/assets/appearanceSelection';
import { parseGroupShotSkeleton } from '@shared/domain/workshop/workshopPipeline';
import { WorkshopAssetLockRow, type WorkshopAssetLockOption } from './WorkshopAssetLockRow';

type GroupOption = WorkshopAssetLockOption & { shotPromptsJson?: string; hasHuman?: boolean };
export function WorkshopAssetBindings(props: {
  groupId: string; onGroupChange: (id: string) => void; groups: GroupOption[];
  personaId: string; onPersonaChange: (id: string) => void; personas: WorkshopAssetLockOption[];
  sceneId: string; onSceneChange: (id: string) => void; scenes: WorkshopAssetLockOption[];
  outfitId: string; onOutfitChange: (id: string) => void; outfits: WorkshopAssetLockOption[];
}) {
  const group = props.groups.find((item) => item.id === props.groupId);
  const shots = parseGroupShotSkeleton(group?.shotPromptsJson);
  const hasPortrait = !group || (group.hasHuman !== false && shots.some(
    (shot) => shot.has_human !== false && shot.shot_type !== 'hand_held_only' && shot.shot_type !== 'pure_product',
  ));
  const replacementCount = Number(props.sceneId !== 'auto') + (hasPortrait ? Number(props.personaId !== 'auto') + Number(props.outfitId !== 'auto') : 0);
  return <section>
    <div className="rounded-lg bg-slate-50/70 p-3">
      <WorkshopAssetLockRow label="图组来源" autoLabel="自动轮换同类图组" prefix="R" value={props.groupId} onChange={props.onGroupChange} options={props.groups} />
      {props.groupId !== 'auto' && !group
        ? <p className="mt-2 text-xs text-amber-700">选定图组已失效或尚未加载，请重新选择。</p>
        : <p className="mt-2 text-[11px] leading-5 text-slate-500">{group
          ? '本批次全部商品使用此图组。保留逐镜顺序、构图、动作和出镜范围。'
          : '每款商品依次匹配同类四图母本，用完一轮后再重复。'}</p>}
      {shots.length > 0 && <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {shots.map((shot, index) => <li key={index} className="truncate" title={shot.title}>{index + 1}. {shot.title || '未命名镜头'} · {shot.shot_type === 'hand_held_only' ? '仅手部' : shot.has_human === false ? '静物' : '人物'}</li>)}
      </ol>}

    </div>
    <details className="mt-3 rounded-lg border border-slate-200/70 px-3 py-2.5" open={replacementCount > 0 ? true : undefined}>
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">自定义替换 <span className="ml-2 font-normal text-slate-500">{replacementCount ? `已替换 ${replacementCount} 项` : '可选 · 默认沿用母本'}</span></summary>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-700">替换哪些内容</span>
      <button type="button" className="text-[11px] text-indigo-600 hover:text-indigo-800" onClick={() => {
        props.onPersonaChange('auto'); props.onSceneChange('auto'); props.onOutfitChange('auto');
      }}>重置为沿用母本</button>
    </div>
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <WorkshopAssetLockRow label="场景" autoLabel="沿用母本逐镜场景" prefix="S" value={props.sceneId} onChange={props.onSceneChange} options={props.scenes} />
      {hasPortrait && <>
        <WorkshopAppearanceSelection value={props.personaId} onChange={props.onPersonaChange} options={props.personas} />
        <WorkshopAppearanceSelection outfit value={props.outfitId} onChange={props.onOutfitChange} options={props.outfits} />
      </>}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-500">仅在勾选范围内轮换，同款四镜保持一致。男性仅配男装或通用款；女性可配男装、女装或通用款。年龄段必须匹配，待分类素材不参与。</p>
    <details className="mt-4 rounded-lg border border-slate-200 px-3 py-2.5">
      <summary className="cursor-pointer text-xs font-medium text-slate-600">查看本批次替换规则</summary>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600">
        <li>场景：{props.sceneId === 'auto' ? '保留各镜头原场景与光线。' : `所有镜头替换为「${props.scenes.find(item => item.id === props.sceneId)?.title || '所选场景'}」，使用新场景光线。`}</li>
        <li>人物：{!hasPortrait ? '此组没有人物镜头，不应用人物替换。' : isAppearanceRotation(props.personaId) ? '每款商品轮换兼容人物，同款四镜保持一致。' : props.personaId === 'auto' ? '人物镜头保留母本人物。' : `人物镜头统一使用「${props.personas.find(item => item.id === props.personaId)?.name || '所选人物'}」，静物与仅手部镜头不加人脸。`}</li>
        <li>穿搭：{!hasPortrait ? '此组没有人物镜头，不应用穿搭替换。' : isAppearanceRotation(props.outfitId) ? '按人物性别和年龄段轮换适配穿搭，男性不匹配女装。' : props.outfitId === 'auto' ? '人物镜头保留母本穿搭。' : `人物镜头统一使用「${props.outfits.find(item => item.id === props.outfitId)?.title || '所选穿搭'}」，不改变原镜头出镜范围。`}</li>
      </ul>
    </details>
    <p className="mt-3 text-[11px] leading-5 text-slate-500">修改后需重新分析提示词并生成图片，已有图片不会改变。</p>
    </details>
  </section>;
}

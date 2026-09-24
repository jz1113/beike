import { parseGroupShotSkeleton } from '@beike/domain/workshopPipeline';
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
  return <section className="border-t border-slate-100 pt-3">
    <h3 className="text-sm font-black">图组与内容替换</h3>
    <p className="mt-1 text-[11px] leading-5 text-slate-500">先选图组，再决定替换哪些内容。商品始终使用你挑选的商品图，分镜顺序、机位和动作沿用母本。</p>
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <WorkshopAssetLockRow label="图组来源" autoLabel="同类图组依次轮换" prefix="R" value={props.groupId} onChange={props.onGroupChange} options={props.groups} />
      {props.groupId !== 'auto' && !group
        ? <p className="mt-2 text-xs text-amber-700">选定图组已失效或尚未加载，请重新选择。</p>
        : <p className="mt-2 text-[11px] leading-5 text-slate-500">{group
          ? '本批次全部商品使用此图组。保留逐镜顺序、构图、动作和出镜范围。'
          : '同类完整图组全部使用一遍后再重复；每款商品显示实际分配的图组。'}</p>}
      {shots.length > 0 && <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {shots.map((shot, index) => <li key={index} className="truncate" title={shot.title}>{index + 1}. {shot.title || '未命名镜头'} · {shot.shot_type === 'hand_held_only' ? '仅手部' : shot.has_human === false ? '静物' : '人物'}</li>)}
      </ol>}
      {props.groups.length === 0 && <p className="mt-2 text-xs text-amber-700">暂无可用的完整四图母本，请先导入并解构四图组。</p>}
    </div>
    <div className="mt-3 flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-700">替换哪些内容</span>
      <button type="button" className="text-[11px] text-indigo-600 hover:text-indigo-800" onClick={() => {
        props.onPersonaChange('auto'); props.onSceneChange('auto'); props.onOutfitChange('auto');
      }}>重置为沿用母本</button>
    </div>
    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <WorkshopAssetLockRow label="场景" autoLabel="沿用母本逐镜场景" prefix="S" value={props.sceneId} onChange={props.onSceneChange} options={props.scenes} />
      {hasPortrait && <>
        <WorkshopAssetLockRow label="人物" autoLabel="沿用母本人物" prefix="P" value={props.personaId} onChange={props.onPersonaChange} options={props.personas} />
        <WorkshopAssetLockRow label="穿搭" autoLabel="沿用母本穿搭" prefix="O" value={props.outfitId} onChange={props.onOutfitChange} options={props.outfits} />
      </>}
    </div>
    <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
      <p className="text-xs font-semibold text-slate-700">本批次执行方式</p>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600">
        <li>场景：{props.sceneId === 'auto' ? '保留各镜头原场景与光线。' : `所有镜头替换为「${props.scenes.find(item => item.id === props.sceneId)?.title || '所选场景'}」，使用新场景光线。`}</li>
        <li>人物：{!hasPortrait ? '此组没有人物镜头，不应用人物替换。' : props.personaId === 'auto' ? '人物镜头保留母本人物。' : `人物镜头统一使用「${props.personas.find(item => item.id === props.personaId)?.name || '所选人物'}」，静物与仅手部镜头不加人脸。`}</li>
        <li>穿搭：{!hasPortrait ? '此组没有人物镜头，不应用穿搭替换。' : props.outfitId === 'auto' ? '人物镜头保留母本穿搭。' : `人物镜头统一使用「${props.outfits.find(item => item.id === props.outfitId)?.title || '所选穿搭'}」，不改变原镜头出镜范围。`}</li>
      </ul>
    </div>
    <p className="mt-2 text-[11px] leading-5 text-amber-700">修改替换项后，请重新分析提示词，再生成图片；已有图片不会自动改变。四宫格与单张逐镜使用同一套替换结果。</p>
  </section>;
}

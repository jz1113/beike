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
    <h3 className="text-sm font-black">图组与替换规则</h3>
    <p className="mt-1 text-[11px] leading-5 text-slate-500">当前批次共用以下规则。商品始终使用选图步骤中的商品图，构图与动作来自图组母本。</p>
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <WorkshopAssetLockRow label="图组来源" autoLabel="按每款商品自动匹配" prefix="R" value={props.groupId} onChange={props.onGroupChange} options={props.groups} />
      {props.groupId !== 'auto' && !group
        ? <p className="mt-2 text-xs text-amber-700">选定图组已失效或尚未加载，请重新选择。</p>
        : <p className="mt-2 text-[11px] leading-5 text-slate-500">{group
          ? '本批次全部商品使用此图组。保留逐镜顺序、构图、动作和出镜范围。'
          : '分析时为每款商品匹配完整图组；匹配结果显示在商品分镜中。'}</p>}
      {shots.length > 0 && <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {shots.map((shot, index) => <li key={index} className="truncate" title={shot.title}>{index + 1}. {shot.title || '未命名镜头'} · {shot.shot_type === 'hand_held_only' ? '仅手部' : shot.has_human === false ? '静物' : '人物'}</li>)}
      </ol>}
      {props.groups.length === 0 && <p className="mt-2 text-xs text-amber-700">暂无可用的完整四图母本，请先导入并解构四图组。</p>}
    </div>
    <div className="mt-3 flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-700">可选替换</span>
      <button type="button" className="text-[11px] text-indigo-600 hover:text-indigo-800" onClick={() => {
        props.onPersonaChange('auto'); props.onSceneChange('auto'); props.onOutfitChange('auto');
      }}>全部沿用母本</button>
    </div>
    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <WorkshopAssetLockRow label="场景" autoLabel="沿用母本逐镜场景" prefix="S" value={props.sceneId} onChange={props.onSceneChange} options={props.scenes} />
      {hasPortrait && <>
        <WorkshopAssetLockRow label="人物" autoLabel="沿用母本人物" prefix="P" value={props.personaId} onChange={props.onPersonaChange} options={props.personas} />
        <WorkshopAssetLockRow label="穿搭" autoLabel="沿用母本穿搭" prefix="O" value={props.outfitId} onChange={props.onOutfitChange} options={props.outfits} />
      </>}
    </div>
    <p className="mt-2 text-[11px] leading-5 text-slate-500">{hasPortrait
      ? '替换项整组生效；人物与穿搭仅作用于人物镜头，静物和仅手部镜头保持原出镜范围。'
      : '此图组不含人物镜头，人物与穿搭绑定不生效；保留静物或仅手部出镜。'}</p>
  </section>;
}

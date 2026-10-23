import { appearanceAudience, audienceLabel, audienceOptions } from '@shared/domain/assets/appearanceAudience';
import { encodeAppearanceSelection, isAppearanceRotation, matchesAppearanceSelection, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { stableAssetCode } from '@shared/domain/assets/assetSampling';
import { WorkshopAssetLockRow, type WorkshopAssetLockOption } from './WorkshopAssetLockRow';

export function WorkshopAppearanceSelection({ outfit = false, value, onChange, options, onOpenLibrary }: {
  outfit?: boolean; value: string; onChange: (value: string) => void; options: WorkshopAssetLockOption[]; onOpenLibrary?: () => void;
}) {
  const rotating = isAppearanceRotation(value);
  const selected = parseAppearanceSelection(rotating ? value : 'rotate', outfit);
  const label = outfit ? '穿搭' : '人物';
  const classifiedOptions = options.filter(option => appearanceAudience({ ...option }, outfit) !== 'unknown');
  const unclassifiedCount = options.length - classifiedOptions.length;
  const candidates = classifiedOptions.filter(option => matchesAppearanceSelection({ ...option }, { audiences: selected.audiences }, outfit));
  return <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#18191c]">
    <WorkshopAssetLockRow label={label} prefix={outfit ? 'O' : 'P'} value={rotating ? 'rotate' : value}
      onChange={next => onChange(next === 'rotate' ? encodeAppearanceSelection({ audiences: ['adult_male', 'adult_female'] }) : next)}
      options={classifiedOptions} autoLabel={`沿用母本${label}`} rotationLabel="选择范围轮换（可单选/多选）"
      onOpenLibrary={onOpenLibrary} />
    {unclassifiedCount > 0 && <p className="mt-2 text-[11px] text-amber-700">另有 {unclassifiedCount} 项待分类，暂不参与{label}替换；可到资产库完善人群信息。</p>}
    {rotating && <>
      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">按人群限定轮换范围，未勾选的人群不参与。</p>
      <div className="mt-2 flex flex-wrap gap-2" aria-label={`${label}人群范围`}>
        {audienceOptions(outfit).filter(option => option.id !== 'unknown').map(option => <label key={option.id} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={selected.audiences.includes(option.id)} onChange={event => onChange(encodeAppearanceSelection({ ...selected,
            audiences: event.target.checked ? [...selected.audiences, option.id] : selected.audiences.filter(id => id !== option.id) }))} />{option.label}
        </label>)}
      </div>
      <details className="mt-3 rounded-lg bg-slate-50/80 px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300 dark:bg-white/5"><summary className="cursor-pointer font-medium">指定具体{label} · {selected.ids === undefined ? `范围内 ${candidates.length} 项` : `已选 ${selected.ids.length} 项`}</summary>
        <button type="button" onClick={() => onChange(encodeAppearanceSelection({ audiences: selected.audiences }))} className="my-2 text-indigo-600">使用范围内全部素材</button>
        <p className="mb-2 text-[11px]">不指定时使用范围内全部素材；勾选后只轮换勾选项。</p>
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {candidates.map(option => <label key={option.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 dark:bg-[#18191c]">
            <input type="checkbox" checked={selected.ids?.includes(option.id) ?? false} onChange={event => onChange(encodeAppearanceSelection({ ...selected,
              ids: event.target.checked ? [...(selected.ids || []), option.id] : (selected.ids || []).filter(id => id !== option.id) }))} />
            {(option.coverUrl || option.avatarUrl) && <img src={option.coverUrl || option.avatarUrl || ''} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md object-cover" />}
            <span className="min-w-0 flex-1 truncate">{option.name || option.title || '未命名资产'}</span>
            <span className="shrink-0 text-[10px] text-slate-400">#{String(option.code || stableAssetCode(outfit ? 'O' : 'P', option.id)).replace(/^#/, '')} · {audienceLabel({ ...option }, outfit)}</span>
          </label>)}
          {!candidates.length && <p className="py-2 text-center">所选范围暂无素材，请补充资产或调整范围。</p>}
        </div>
      </details>
      {(!selected.audiences.length || selected.ids?.length === 0) && <p className="mt-2 text-xs text-amber-700">尚未选择可用范围，分析时会提示补充，不会使用其他人群。</p>}
    </>}
  </div>;
}

import { audienceLabel, audienceOptions } from '@shared/domain/assets/appearanceAudience';
import { encodeAppearanceSelection, isAppearanceRotation, matchesAppearanceSelection, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { WorkshopAssetLockRow, type WorkshopAssetLockOption } from './WorkshopAssetLockRow';

export function WorkshopAppearanceSelection({ outfit = false, value, onChange, options }: {
  outfit?: boolean; value: string; onChange: (value: string) => void; options: WorkshopAssetLockOption[];
}) {
  const rotating = isAppearanceRotation(value);
  const selected = parseAppearanceSelection(rotating ? value : 'rotate', outfit);
  const label = outfit ? '穿搭' : '人物';
  const candidates = options.filter(option => matchesAppearanceSelection({ ...option }, { audiences: selected.audiences }, outfit));
  return <div className="space-y-2 rounded-lg border border-slate-200/70 p-3">
    <WorkshopAssetLockRow label={label} prefix={outfit ? 'O' : 'P'} value={rotating ? 'rotate' : value}
      onChange={next => onChange(next === 'rotate' ? encodeAppearanceSelection({ audiences: ['adult_male', 'adult_female'] }) : next)}
      options={options} autoLabel={`沿用母本${label}`} rotationLabel="选择范围轮换（可单选/多选）" />
    {rotating && <>
      <p className="text-[11px] text-slate-500">勾选一个或多个人群；未勾选的人群不参与轮换。</p>
      <div className="flex flex-wrap gap-2" aria-label={`${label}人群范围`}>
        {audienceOptions(outfit).filter(option => option.id !== 'unknown').map(option => <label key={option.id} className="flex items-center gap-1.5 text-xs text-slate-700">
          <input type="checkbox" checked={selected.audiences.includes(option.id)} onChange={event => onChange(encodeAppearanceSelection({ ...selected,
            audiences: event.target.checked ? [...selected.audiences, option.id] : selected.audiences.filter(id => id !== option.id) }))} />{option.label}
        </label>)}
      </div>
      <details className="text-xs text-slate-600"><summary className="cursor-pointer">指定具体{label}（可多选） · {selected.ids === undefined ? '范围内全部' : `已选 ${selected.ids.length} 项`}</summary>
        <button type="button" onClick={() => onChange(encodeAppearanceSelection({ audiences: selected.audiences }))} className="my-2 text-indigo-600">使用范围内全部素材</button>
        <p className="mb-2 text-[11px]">不指定时使用范围内全部素材；勾选后仅使用指定项。</p>
        <div className="max-h-36 space-y-2 overflow-y-auto">
          {candidates.map(option => <label key={option.id} className="flex items-center gap-2">
            <input type="checkbox" checked={selected.ids?.includes(option.id) ?? false} onChange={event => onChange(encodeAppearanceSelection({ ...selected,
              ids: event.target.checked ? [...(selected.ids || []), option.id] : (selected.ids || []).filter(id => id !== option.id) }))} />
            {option.name || option.title} · {audienceLabel({ ...option }, outfit)}
          </label>)}
          {!candidates.length && <p>所选范围暂无素材，请补充资产或调整范围。</p>}
        </div>
      </details>
      {(!selected.audiences.length || selected.ids?.length === 0) && <p className="text-xs text-amber-700">尚未选择可用范围，分析时会提示补充，不会使用其他人群。</p>}
    </>}
  </div>;
}

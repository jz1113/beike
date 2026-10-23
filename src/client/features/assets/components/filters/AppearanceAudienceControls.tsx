import { appearanceAudience, audienceOptions, setAudienceDimensions, type AppearanceAudience } from '@shared/domain/assets/appearanceAudience';

type Asset = Record<string, unknown>;
export function AppearanceAudienceFilter({ type, value, onChange, items }: {
  type: 'persona' | 'outfit'; value: AppearanceAudience | 'all';
  onChange: (value: AppearanceAudience | 'all') => void; items: Asset[];
}) {
  const outfit = type === 'outfit';
  const counts = new Map<AppearanceAudience, number>();
  for (const item of items) {
    const audience = appearanceAudience(item, outfit);
    counts.set(audience, (counts.get(audience) ?? 0) + 1);
  }
  // 只列出有素材的人群；当前选中的人群即使已清空也保留，方便切回全部。
  const visible = audienceOptions(outfit).filter(option => (counts.get(option.id) ?? 0) > 0 || option.id === value);
  // 只剩一种人群时，结果与「全部人群」相同，整行筛选不再显示。
  if (visible.length < 2 && value === 'all') return null;
  const options: { id: AppearanceAudience | 'all'; label: string; count: number }[] = [
    { id: 'all', label: '全部人群', count: items.length },
    ...visible.map(option => ({ id: option.id, label: option.label, count: counts.get(option.id) ?? 0 })),
  ];
  return <div aria-label="人群二级分类" className="mt-3 flex flex-wrap items-center gap-1.5">
    {options.map(option => <button key={option.id} type="button" aria-pressed={value === option.id}
      onClick={() => onChange(option.id)} className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${value === option.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-500 hover:bg-slate-100/70 dark:text-slate-400'}`}>
      {option.label}<span className="ml-1.5 opacity-60">{option.count}</span>
    </button>)}
  </div>;
}
export function AppearanceAudienceEditor({ item, type, onChange }: { item: Asset; type: 'persona' | 'outfit'; onChange: (dimensions: string) => void }) {
  return <label className="block space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
    <span className="font-bold">{type === 'persona' ? '人物人群' : '穿搭适用人群'}</span>
    <select aria-label="人群二级分类" className="soft-input w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10"
      value={appearanceAudience(item, type === 'outfit')}
      onChange={event => onChange(setAudienceDimensions(item.dimensions, event.target.value as AppearanceAudience))}>
      {audienceOptions(type === 'outfit').map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    <span className="block text-[11px] leading-5 text-slate-500 dark:text-slate-400">按素材实际人物或服装适用对象分类。自动轮换须同时匹配性别和年龄段；待分类素材不会参与。</span>
  </label>;
}

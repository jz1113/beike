export function AssetLifecycleFilter({
  value,
  onChange,
  items,
}: {
  items: Array<{ registry?: { status?: string } | null; lifecycleStatus?: string }>;
  value: 'all' | 'pending_review' | 'needs_fix' | 'published';
  onChange: (value: 'all' | 'pending_review' | 'needs_fix' | 'published') => void;
}) {
  const options = [
    { id: 'all', label: '全部状态' },
    { id: 'pending_review', label: '待审核' },
    { id: 'needs_fix', label: '待修复' },
    { id: 'published', label: '已发布' },
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${value === option.id ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
        >
          {option.label} <span className="ml-1 opacity-60">{option.id === 'all' ? items.length : items.filter((item) => (item.registry?.status || item.lifecycleStatus) === option.id).length}</span>
        </button>
      ))}
    </div>
  );
}

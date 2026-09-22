export function AssetLifecycleFilter({
  value,
  onChange,
}: {
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
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-lg px-2 py-1 text-[10px] font-bold ${value === option.id ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

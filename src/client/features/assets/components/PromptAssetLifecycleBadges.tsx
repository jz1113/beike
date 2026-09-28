const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  published: '已发布',
  needs_fix: '待修复',
  disabled: '已停用',
  archived: '已归档',
};

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_review: 'bg-amber-50 text-amber-700',
  published: 'bg-emerald-50 text-emerald-700',
  needs_fix: 'bg-rose-50 text-rose-700',
  disabled: 'bg-slate-200 text-slate-500',
  archived: 'bg-slate-100 text-slate-400',
};

const PROVENANCE_LABEL: Record<string, string> = {
  deconstructed: '拆解入库',
  seed: '内置素材',
  manual: '手动创建',
};

export function PromptAssetLifecycleBadges({ item }: { item: Record<string, unknown> }) {
  const registry = (item.registry || {}) as Record<string, unknown>;
  const status = String(registry.status || item.lifecycleStatus || '');
  const quality = registry.qualityScore as number | null | undefined;
  const version = registry.version as number | undefined;
  const provenance = String(registry.provenance || item.provenance || '');
  const accept = registry.firstPassAcceptRate as number | undefined;
  const retry = registry.retryRate as number | undefined;
  if (!status && quality == null && !provenance) return null;
  const details = [
    quality != null ? `质量 ${Math.round(quality)}` : '',
    typeof accept === 'number' ? `首轮 ${(accept * 100).toFixed(0)}%` : '',
    typeof retry === 'number' ? `重试 ${(retry * 100).toFixed(0)}%` : '',
    provenance ? PROVENANCE_LABEL[provenance] || provenance : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap" title={details || undefined}>
      {status ? (
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[status] || 'bg-slate-100 text-slate-600'}`}>
          {STATUS_LABEL[status] || status}
        </span>
      ) : null}
      {status && status !== 'published' ? (
        <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">分析不召回</span>
      ) : null}
      {version ? <span className="shrink-0 text-[10px] font-medium text-slate-400">v{version}</span> : null}
    </div>
  );
}

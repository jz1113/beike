import { audienceLabel } from '@shared/domain/assets/appearanceAudience';
import { stableAssetCode } from '@shared/domain/assets/assetSampling';
import { ArrowUpRight, Check, ChevronDown, Image as ImageIcon, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface WorkshopAssetLockOption {
  id: string;
  title?: string | null;
  description?: string | null;
  name?: string | null;
  code?: string;
  dimensions?: string | null;
  appearanceAudience?: string;
  coverUrl?: string | null;
  avatarUrl?: string | null;
  tags?: string | null;
  category?: string | null;
  spatialType?: string | null;
  sceneSourceKey?: string | null;
}

function assetCode(option: WorkshopAssetLockOption, prefix: 'S' | 'O' | 'P'): string {
  return String(option.code || stableAssetCode(prefix, option.id)).replace(/^#/, '');
}

export function WorkshopAssetLockRow({
  label, value, onChange, options, prefix, autoLabel = '智能轮循', rotationLabel,
  specialOptions, optionLabel, optionSuffix, onOpenLibrary,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: WorkshopAssetLockOption[];
  prefix: 'S' | 'O' | 'P';
  autoLabel?: string;
  rotationLabel?: string;
  specialOptions?: Array<{ id: string; label: string }>;
  optionLabel?: (option: WorkshopAssetLockOption) => string;
  optionSuffix?: (option: WorkshopAssetLockOption) => string;
  onOpenLibrary?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const builtInOptions = specialOptions || [{ id: 'auto', label: autoLabel }, ...(rotationLabel ? [{ id: 'rotate', label: rotationLabel }] : [])];
  const selectedAsset = options.find((option) => option.id === value);
  const selectedPreset = builtInOptions.find((option) => option.id === value);
  const selectedLabel = selectedPreset?.label || (selectedAsset && (optionLabel?.(selectedAsset) || selectedAsset.name || selectedAsset.title)) || '原选择已失效，请重新选择';
  const selectedImage = selectedAsset?.coverUrl || selectedAsset?.avatarUrl;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visiblePresets = builtInOptions.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
  const visibleAssets = options.filter((option) => {
    const audience = prefix === 'P' || prefix === 'O' ? audienceLabel({ ...option }, prefix === 'O') : '';
    const searchText = [assetCode(option, prefix), optionLabel?.(option), option.name, option.title, option.tags, option.category, audience]
      .filter(Boolean).join(' ').toLocaleLowerCase();
    return searchText.includes(normalizedQuery);
  });

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return <div ref={rootRef} className="min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</span>
      <div className="flex items-center gap-2.5 text-[11px]">
        <span className="text-slate-400">{options.length} 项可选</span>
        {onOpenLibrary && <button type="button" onClick={onOpenLibrary} className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-800">
          去资产库挑选 <ArrowUpRight className="h-3 w-3" />
        </button>}
      </div>
    </div>
    <button ref={triggerRef} type="button" aria-label={`${label}：${selectedLabel}`} aria-expanded={open} aria-controls={panelId}
      onClick={() => { setQuery(''); setOpen(!open); }}
      className="mt-2 flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left transition-colors hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:border-white/10 dark:bg-[#18191c]">
      {selectedImage ? <img src={selectedImage} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 dark:bg-white/5"><ImageIcon className="h-4 w-4" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">{selectedLabel}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{selectedAsset
          ? `#${assetCode(selectedAsset, prefix)}${prefix === 'P' || prefix === 'O' ? ` · ${audienceLabel({ ...selectedAsset }, prefix === 'O')}` : ''}`
          : selectedPreset ? '从已发布资产中选择，或保留母本' : '此资产已不在可选列表'}</span>
      </span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id={panelId} className="mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-[#18191c]">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-slate-400 dark:border-white/10">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input ref={searchRef} type="search" aria-label={`搜索${label}资产`} placeholder={`搜索${label}名称、编号或标签`} value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const first = visiblePresets[0]?.id || visibleAssets[0]?.id;
              if (first) { event.preventDefault(); choose(first); }
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500" />
      </div>
      <div className="mt-2 max-h-60 space-y-0.5 overflow-y-auto" role="listbox" aria-label={`可选${label}资产`}>
        {visiblePresets.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value}
          onClick={() => choose(option.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${option.id === value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 dark:text-slate-200'}`}>
          <span>{option.label}</span>{option.id === value && <Check className="h-3.5 w-3.5 shrink-0" />}
        </button>)}
        {visibleAssets.length > 0 && <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">资产库 · {visibleAssets.length} 项</p>}
        {visibleAssets.map((option) => {
          const image = option.coverUrl || option.avatarUrl;
          const title = optionLabel?.(option) || option.name || option.title || '未命名资产';
          return <button key={option.id} type="button" role="option" aria-selected={option.id === value}
            onClick={() => choose(option.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${option.id === value ? 'bg-indigo-50' : ''}`}>
            {image ? <img src={image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 dark:bg-white/5"><ImageIcon className="h-4 w-4" /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">{title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">#{assetCode(option, prefix)}{prefix === 'P' || prefix === 'O' ? ` · ${audienceLabel({ ...option }, prefix === 'O')}` : ''}{optionSuffix?.(option)}</span>
            </span>
            {option.id === value && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
          </button>;
        })}
        {visiblePresets.length === 0 && visibleAssets.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-500 dark:text-slate-400">没有匹配的{label}资产</p>}
      </div>
    </div>}
  </div>;
}

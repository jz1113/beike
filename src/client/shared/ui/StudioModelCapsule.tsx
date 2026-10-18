import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Sparkles, ExternalLink } from 'lucide-react';
import {
  modalityPickerSelections,
  readEffectiveModalityModels,
  readStoredApiProviders,
  type ModalityStorageKind,
  type StoredApiProviderCredentials,
  type StoredModalityModelItem,
} from '@shared/domain/models/modalityStorage';
import { queueSettingsSection } from '@shared/domain/settings/settingsNavigationStorage';
import { ModelIcon } from './ModelIcons';

interface Props {
  modality: ModalityStorageKind;
  value: string;
  onChange: (value: string, item?: StoredModalityModelItem) => void;
  label?: string;
  placeholder?: string;
  emptyHint?: string;
  filter?: (item: StoredModalityModelItem) => boolean;
  onOpenSettings?: () => void;
  className?: string;
}

export function StudioModelCapsule({
  modality,
  value,
  onChange,
  label,
  placeholder = '选择模型',
  emptyHint = '暂无已同步模型',
  filter,
  onOpenSettings,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<StoredModalityModelItem[]>([]);
  const [providers, setProviders] = useState<StoredApiProviderCredentials[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => {
      const read = readEffectiveModalityModels(modality);
      const list = (read.configured ? read.models : []).filter((item) => (filter ? filter(item) : true));
      setModels(list);
      setProviders(readStoredApiProviders());
      const matched = value ? list.find((item) => item.modelId === value || item.id === value) : undefined;
      if (!matched && list.length > 0) {
        const defaultItem = list.find((item) => item.isDefault) || list[0];
        onChange(defaultItem.id, defaultItem);
      } else if (!matched && value) {
        onChange('', undefined);
      }
    };
    load();
    window.addEventListener('modality_models_updated', load);
    window.addEventListener('models_updated', load);
    return () => {
      window.removeEventListener('modality_models_updated', load);
      window.removeEventListener('models_updated', load);
    };
  }, [modality, value, onChange, filter]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const activeModel = models.find((m) => m.modelId === value || m.id === value);
  const channelLabel = (item: StoredModalityModelItem) => {
    if (!item.channelId) return '';
    return providers.find((provider) => provider.id === item.channelId)?.name || '渠道已移除';
  };
  const activeChannel = activeModel ? channelLabel(activeModel) : '';
  const displayName = activeModel
    ? `${activeModel.name || activeModel.modelId}${activeChannel ? ` · ${activeChannel}` : ''}`
    : placeholder;

  const selectionId = (item: StoredModalityModelItem) => (
    modalityPickerSelections(modality)?.find((option) => option.entryId === item.id)?.id || item.modelId || item.id
  );

  const handleSelect = (item: StoredModalityModelItem) => {
    onChange(selectionId(item), item);
    setOpen(false);
  };

  const handleGoSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    queueSettingsSection(modality);
    onOpenSettings?.();
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#1C1C20]/80 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs backdrop-blur-md transition-all hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-[#242429]"
        title={`切换${label || '模型'}`}
      >
        <Sparkles className="h-3 w-3 text-indigo-500 shrink-0" />
        {label && <span className="text-slate-400 dark:text-slate-500">{label}:</span>}
        <div className="flex items-center gap-1 max-w-[140px] sm:max-w-[180px] truncate">
          {activeModel && (
            <span className="shrink-0">
              <ModelIcon modelId={activeModel.modelId} className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="truncate">{displayName}</span>
        </div>
        <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 z-50 w-64 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#18181C]/95 p-1.5 shadow-xl backdrop-blur-xl animate-fade-in"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 border-b border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between">
            <span>已同步 {label || '模型'} ({models.length})</span>
            <button
              type="button"
              onClick={handleGoSettings}
              className="inline-flex items-center gap-0.5 text-indigo-500 hover:text-indigo-600 transition-colors"
            >
              配置与同步 <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>

          <div className="py-1 space-y-0.5">
            {models.length === 0 ? (
              <div className="px-3 py-3 text-xs text-center text-slate-400">
                {emptyHint}
                <button
                  type="button"
                  onClick={handleGoSettings}
                  className="mt-1 block mx-auto text-indigo-500 hover:underline"
                >
                  前往同步
                </button>
              </div>
            ) : (
              models.map((item) => {
                const isSelected = item.modelId === value || item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelect(item)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0">
                        <ModelIcon modelId={item.modelId} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 truncate">
                        <div className="truncate font-medium">{item.name || item.modelId}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {item.modelId}{channelLabel(item) ? ` · ${channelLabel(item)}` : ''}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 ml-1.5 text-indigo-600 dark:text-indigo-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

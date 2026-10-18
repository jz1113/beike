import React, { useEffect, useState, useMemo } from 'react';
import type {
  ModalityKind,
  ModalityModelItem,
} from '../model/modalityModelTypes';
import { inferVendorFromModelId, isModelMatchModality } from '../model/modalityMeta';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import {
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';

interface Props {
  kind: ModalityKind;
  model: ModalityModelItem;
  inheritedBaseUrl: string;
  inheritedApiKey: string;
  channelName?: string;
  channelMissing?: boolean;
  remoteModelCandidates: string[];
  onUpdate: (updates: Partial<ModalityModelItem>) => void;
  onSetDefault: () => void;
  onRemove?: () => void;
}

export function ModalityModelCard({
  kind,
  model,
  inheritedBaseUrl,
  inheritedApiKey,
  channelName,
  channelMissing = false,
  remoteModelCandidates,
  onUpdate,
  onSetDefault,
  onRemove,
}: Props) {
  const [showKey, setShowKey] = useState(false);
  const [showIdDropdown, setShowIdDropdown] = useState(false);

  useEffect(() => {
    if (!showIdDropdown) return;
    const close = () => setShowIdDropdown(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [showIdDropdown]);

  const inheritLabel = channelMissing
    ? '渠道已移除，已继承全局'
    : model.channelId
      ? `已继承渠道 ${channelName || '未命名渠道'}`
      : '';
  const inheritedKeyPlaceholder = inheritedApiKey
    ? `${inheritedApiKey.slice(0, 3)}••••••••${inheritedApiKey.slice(-4)} (${inheritLabel || '已继承全局'})`
    : `sk-... (${inheritLabel || '未设置全局Key'})`;
  const inheritedUrlPlaceholder = inheritedBaseUrl
    ? `${inheritedBaseUrl} (${inheritLabel || '已继承全局'})`
    : `https://... (${inheritLabel || '未设置全局地址'})`;

  // 按模态智能过滤，避免跨模态混杂（如在绘画卡片内出现视频模型）
  const relevantCandidates = useMemo(() => {
    return remoteModelCandidates.filter((candidate) => {
      if (!isModelMatchModality(candidate, kind)) return false;
      return inferVendorFromModelId(candidate, kind) === model.vendor;
    });
  }, [remoteModelCandidates, kind, model.vendor]);

  const idOptions = useMemo(() => {
    return Array.from(new Set([
      model.modelId,
      ...relevantCandidates,
    ])).filter(Boolean);
  }, [model.modelId, relevantCandidates]);

  return (
    <div className={`relative rounded-2xl border transition-all p-4.5 text-xs ${
      model.isDefault
        ? 'bg-gradient-to-b from-indigo-50/40 via-white to-white dark:from-indigo-950/20 dark:via-[#1a1c20] dark:to-[#1a1c20] border-indigo-400/80 dark:border-indigo-500/60 shadow-xs ring-1 ring-indigo-400/20'
        : 'bg-white dark:bg-[#1a1c20] border-slate-200/90 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 shadow-2xs'
    } text-slate-800 dark:text-slate-200`}>
      {/* 顶部标题行 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-slate-100 dark:bg-white/10 border border-slate-200/60 dark:border-white/5">
            <ModelIcon modelId={model.modelId || model.vendor} className="w-4 h-4 object-contain" />
          </div>
          {model.isCustom ? (
            <input
              type="text"
              value={model.name}
              aria-label="模型名称"
              onChange={(event) => onUpdate({ name: event.target.value, namePinned: true })}
              className="min-w-0 max-w-[16rem] bg-transparent font-semibold text-sm tracking-wide text-slate-900 outline-none dark:text-slate-100"
            />
          ) : (
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate tracking-wide">
              {model.name}
            </span>
          )}
          {model.isDefault && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/40">
              <CheckCircle2 className="w-3 h-3" />
              当前默认
            </span>
          )}
          {model.isCustom && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/40">
              已同步
            </span>
          )}
          {(model.isCustom || model.channelId) && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
              channelMissing
                ? 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40'
                : 'bg-slate-100 text-slate-600 border-slate-200/80 dark:bg-white/10 dark:text-slate-300 dark:border-white/10'
            }`}>
              {channelMissing ? '渠道已移除' : (channelName || '全局默认')}
            </span>
          )}
        </div>

        {/* 右上角操作区 */}
        <div className="flex items-center gap-2.5 shrink-0">
          {!model.isDefault && (
            <button
              type="button"
              onClick={onSetDefault}
              className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
            >
              设为默认
            </button>
          )}

          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              title="解除该模型的同步接入"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">解除同步</span>
            </button>
          )}
        </div>
      </div>

      {/* 表单参数区 */}
      <div className="mt-3.5 space-y-2.5">
        {/* 行 1: MODEL ID */}
        <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
          <label className="text-right text-[11px] font-medium leading-none text-slate-500 select-none dark:text-slate-400">
            模型 ID
          </label>
          <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
            <input
              type="text"
              value={model.modelId}
              onChange={(e) => onUpdate({ modelId: e.target.value })}
              className="h-8 w-full rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 pr-8 font-mono text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:bg-transparent"
              placeholder="例如 gemini-3-flash"
            />
            {idOptions.length > 1 && (
              <button
                type="button"
                onClick={() => setShowIdDropdown((open) => !open)}
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title="展开当前厂商模型"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showIdDropdown ? 'rotate-180' : ''}`} />
              </button>
            )}

            {showIdDropdown && idOptions.length > 0 && (
              <div className="absolute left-0 top-full z-30 mt-1.5 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#202328]">
                <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-medium text-slate-400 dark:border-white/5">
                  当前厂商候选 {idOptions.length}
                </div>
                {idOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={() => {
                      onUpdate({ modelId: opt });
                      setShowIdDropdown(false);
                    }}
                    className={`w-full truncate px-3 py-1.5 text-left font-mono text-xs transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-indigo-300 ${
                      opt === model.modelId ? 'bg-indigo-50/70 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 行 2: API KEY */}
        <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
          <label className="text-right text-[11px] font-medium leading-none text-slate-500 select-none dark:text-slate-400">
            密钥
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={model.apiKey || ''}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              className="h-8 w-full rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 pr-8 font-mono text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:bg-transparent"
              placeholder={inheritedKeyPlaceholder}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              title={showKey ? '隐藏密钥' : '显示密钥'}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* 行 3: BASE URL */}
        <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
          <label className="text-right text-[11px] font-medium leading-none text-slate-500 select-none dark:text-slate-400">
            地址
          </label>
          <div className="relative">
            <input
              type="text"
              value={model.baseUrl || ''}
              onChange={(e) => onUpdate({ baseUrl: e.target.value })}
              className="w-full h-8 px-3 rounded-lg bg-slate-50/80 dark:bg-white/5 border border-slate-200/90 dark:border-white/10 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none text-slate-900 dark:text-slate-100 font-mono text-xs pr-8 transition-colors placeholder:text-slate-400"
              placeholder={inheritedUrlPlaceholder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

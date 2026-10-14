import React, { useState } from 'react';
import { RefreshCw, Plus, Search, Trash2 } from 'lucide-react';
import { type ApiProvider } from '../model/apiProviderTypes';
import type { WorkflowModel } from './settingsShared';
import { ModelIcon } from '@client/shared/ui/ModelIcons';

interface Props {
  provider: ApiProvider;
  models: WorkflowModel[];
  onFetchModels: () => void;
  onAddManualModel: () => void;
  onToggleModelEnabled: (modelId: string, enabled: boolean) => void;
  onRemoveModel: (modelId: string) => void;
  isFetchingModels: boolean;
}

export function ProviderModelsCard({
  provider,
  models,
  onFetchModels,
  onAddManualModel,
  onToggleModelEnabled,
  onRemoveModel,
  isFetchingModels,
}: Props) {
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'chat' | 'image' | 'video'>('all');
  const [query, setQuery] = useState('');

  const filteredModels = models.filter(m => {
    if (capabilityFilter === 'chat' && !m.isAssistant && !m.isMultimodal) return false;
    if (capabilityFilter === 'image' && !m.isImage) return false;
    if (capabilityFilter === 'video' && !m.isVideo) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.desc && m.desc.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="bg-white dark:bg-[#1a1c20] rounded-2xl border border-slate-200/80 dark:border-white/10 p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
            模型
          </span>
          <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded-md bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
            {models.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onFetchModels}
          disabled={isFetchingModels || !provider.apiKey.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
          {isFetchingModels ? '正在获取…' : '获取模型列表'}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        已保存的是模型配置，未验证生成。启用后，在画布模型列表的“自定义”中选择「{provider.name}」。绘画可选 Images API、Gemini 原生生图或自定义 HTTP；仅选择 Responses 服务商类型不会改变绘画协议。
      </p>

      {/* 筛选与操作条 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={capabilityFilter}
          onChange={e => setCapabilityFilter(e.target.value as typeof capabilityFilter)}
          className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-slate-200 outline-none"
        >
          <option value="all">全部能力</option>
          <option value="chat">对话 / 视觉</option>
          <option value="image">绘画</option>
          <option value="video">视频</option>
        </select>

        <button
          type="button"
          onClick={onAddManualModel}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          手动添加模型
        </button>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索模型名称或 ID"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 列表区 / 图4空状态 */}
      {filteredModels.length === 0 ? (
        <div className="py-12 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl flex flex-col items-center justify-center text-center p-6 space-y-3">
          <button
            type="button"
            onClick={onAddManualModel}
            className="w-12 h-12 rounded-full border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-500 transition-colors bg-slate-50 dark:bg-white/5"
            title="添加或获取模型"
          >
            <Plus className="w-6 h-6" />
          </button>
          <div className="text-xs text-slate-400 dark:text-slate-500">
            获取服务商模型列表，或手动添加一个模型。
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filteredModels.map(model => (
            <div
              key={model.id}
              className="p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 shadow-xs flex items-center justify-center shrink-0">
                  <ModelIcon modelId={model.id} className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {model.name}
                    </span>
                    {model.badge && (
                      <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                        {model.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono mt-0.5">
                    {model.id}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleModelEnabled(model.id, model.enabled === false)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    model.enabled !== false
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'
                  }`}
                >
                  {model.enabled !== false ? '已启用' : '已停用'}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveModel(model.id)}
                  title="删除此模型"
                  className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

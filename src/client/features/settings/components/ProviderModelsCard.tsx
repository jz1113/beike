import React, { useState, useMemo } from 'react';
import { RefreshCw, Plus, Search, Trash2, Copy, Check, Info, HelpCircle, ChevronDown, ChevronUp, Sparkles, MessageSquare, Image as ImageIcon, Video, CheckSquare, XSquare, X } from 'lucide-react';
import { type ApiProvider } from '../model/apiProviderTypes';
import type { WorkflowModel } from './settingsShared';
import { ModelIcon } from '@client/shared/ui/ModelIcons';

interface Props {
  provider: ApiProvider;
  models: WorkflowModel[];
  onFetchModels: () => void;
  onAddManualModel: () => void;
  onToggleModelEnabled: (modelId: string, enabled: boolean) => void;
  onBatchToggleEnabled?: (enabled: boolean) => void;
  onRemoveModel: (modelId: string) => void;
  isFetchingModels: boolean;
  onGoToConfig?: () => void;
}

export function ProviderModelsCard({
  provider,
  models,
  onFetchModels,
  onAddManualModel,
  onToggleModelEnabled,
  onBatchToggleEnabled,
  onRemoveModel,
  isFetchingModels,
  onGoToConfig,
}: Props) {
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'chat' | 'image' | 'video'>('all');
  const [query, setQuery] = useState('');
  const [showDocTip, setShowDocTip] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 统计各类能力数量
  const counts = useMemo(() => {
    let chat = 0;
    let image = 0;
    let video = 0;
    for (const m of models) {
      if (m.isImage) image++;
      else if (m.isVideo) video++;
      else if (m.isAssistant || m.isMultimodal || m.isVision) chat++;
    }
    return { all: models.length, chat, image, video };
  }, [models]);

  const filteredModels = useMemo(() => {
    return models.filter(m => {
      if (capabilityFilter === 'chat' && !m.isAssistant && !m.isMultimodal && !m.isVision) return false;
      if (capabilityFilter === 'image' && !m.isImage) return false;
      if (capabilityFilter === 'video' && !m.isVideo) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        return (
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.badge && m.badge.toLowerCase().includes(q)) ||
          (m.desc && m.desc.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [models, capabilityFilter, query]);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getModelCapabilityTag = (model: WorkflowModel) => {
    if (model.isImage) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40">
          <ImageIcon className="w-2.5 h-2.5" />
          绘画
        </span>
      );
    }
    if (model.isVideo) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-900/40">
          <Video className="w-2.5 h-2.5" />
          视频
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-900/40">
        <MessageSquare className="w-2.5 h-2.5" />
        对话/视觉
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-[#1a1c20] rounded-2xl border border-slate-200/80 dark:border-white/10 p-5 space-y-4 shadow-sm">
      {/* 顶部轻量引导横条：精简文案 + 可展开折叠的技术说明 */}
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 p-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              已启用模型会自动同步至画布对应的生成节点中供即时调用。
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowDocTip(!showDocTip)}
            className="text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1 shrink-0 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>调用协议说明</span>
            {showDocTip ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showDocTip && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed space-y-1">
            <p>• 绘画支持标准 OpenAI Images API (`/v1/images/generations`)、Gemini 原生生图及兼容协议。</p>
            <p>• 聚合服务商（如 Comfly、OneAPI）默认走标准 OpenAI 格式分发。</p>
            <p>• 若未探测到特定模型，可随时点击右侧「手动添加模型」输入自定义 ID。</p>
          </div>
        )}
      </div>

      {/* 筛选与操作集成工具栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* 左侧：分类药丸 Pills */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setCapabilityFilter('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
              capabilityFilter === 'all'
                ? 'bg-white dark:bg-[#25282e] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            全部 <span className="opacity-70 text-[10px]">({counts.all})</span>
          </button>
          <button
            type="button"
            onClick={() => setCapabilityFilter('chat')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
              capabilityFilter === 'chat'
                ? 'bg-white dark:bg-[#25282e] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            对话 <span className="opacity-70 text-[10px]">({counts.chat})</span>
          </button>
          <button
            type="button"
            onClick={() => setCapabilityFilter('image')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
              capabilityFilter === 'image'
                ? 'bg-white dark:bg-[#25282e] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            绘画 <span className="opacity-70 text-[10px]">({counts.image})</span>
          </button>
          <button
            type="button"
            onClick={() => setCapabilityFilter('video')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
              capabilityFilter === 'video'
                ? 'bg-white dark:bg-[#25282e] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            视频 <span className="opacity-70 text-[10px]">({counts.video})</span>
          </button>
        </div>

        {/* 中间搜索框 + 右侧聚合操作组 */}
        <div className="flex items-center gap-2 flex-1 md:justify-end">
          <div className="relative flex-1 md:max-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索模型名称或 ID"
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-500 transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 统一模型录入与操作组 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onFetchModels}
              disabled={isFetchingModels || !provider.apiKey.trim()}
              title={!provider.apiKey.trim() ? '需先在“服务商配置”中填写 API Key' : '从远程端点探测并同步可用模型'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
              <span>{isFetchingModels ? '同步中…' : '同步模型'}</span>
            </button>

            <button
              type="button"
              onClick={onAddManualModel}
              title="手动录入新模型 ID"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>手动添加</span>
            </button>
          </div>
        </div>
      </div>

      {/* 批量操作工具条（当过滤结果大于 1 时显示） */}
      {filteredModels.length > 0 && onBatchToggleEnabled && (
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-white/5">
          <span>共找到 {filteredModels.length} 个模型</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onBatchToggleEnabled(true)}
              className="inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <CheckSquare className="w-3 h-3" />
              全部启用
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              type="button"
              onClick={() => onBatchToggleEnabled(false)}
              className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <XSquare className="w-3 h-3" />
              全部停用
            </button>
          </div>
        </div>
      )}

      {/* 列表区 / 空状态 */}
      {filteredModels.length === 0 ? (
        <div className="py-14 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl flex flex-col items-center justify-center text-center p-6 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {query || capabilityFilter !== 'all' ? '未找到符合条件的模型' : '当前暂无可用模型'}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
              {query || capabilityFilter !== 'all'
                ? '可以尝试清除搜索词或重置筛选条件。'
                : '点击「同步模型」获取服务商目录，或「手动添加」自定义模型名称。'}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            {!provider.apiKey.trim() && onGoToConfig ? (
              <button
                type="button"
                onClick={onGoToConfig}
                className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:text-white transition-colors"
              >
                前往配置 API 密钥
              </button>
            ) : (
              <button
                type="button"
                onClick={onFetchModels}
                disabled={isFetchingModels}
                className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
              >
                立即获取模型列表
              </button>
            )}
            <button
              type="button"
              onClick={onAddManualModel}
              className="px-3.5 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
            >
              手动录入
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 settings-page-scroll">
          {filteredModels.map(model => (
            <div
              key={model.id}
              className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                model.enabled !== false
                  ? 'border-slate-200/90 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-800/60'
                  : 'border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.01] opacity-75'
              }`}
            >
              {/* 左侧：图标 + 名称 + 能力标签 + ID */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/10 shadow-2xs flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-white/5">
                  <ModelIcon modelId={model.id} className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {model.name}
                    </span>
                    {getModelCapabilityTag(model)}
                    {model.badge && (
                      <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 shrink-0">
                        {model.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[280px]">
                      {model.id}
                    </span>
                    <button
                      type="button"
                      onClick={e => handleCopy(model.id, e)}
                      title="复制模型 ID"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-0.5"
                    >
                      {copiedId === model.id ? (
                        <Check className="w-2.5 h-2.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-2.5 h-2.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 右侧：开关状态 + 删除操作 */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={model.enabled !== false}
                  onClick={() => onToggleModelEnabled(model.id, model.enabled === false)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                    model.enabled !== false
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 hover:bg-emerald-100'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-white/10 hover:bg-slate-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${model.enabled !== false ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>{model.enabled !== false ? '已启用' : '已停用'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveModel(model.id)}
                  title="删除此模型"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
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

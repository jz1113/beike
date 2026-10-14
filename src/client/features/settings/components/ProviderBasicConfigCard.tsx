import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { type ApiProvider, PROTOCOL_OPTIONS, type ApiProviderProtocol } from '../model/apiProviderTypes';

interface Props {
  provider: ApiProvider;
  onUpdate: (updates: Partial<ApiProvider>) => void;
  onSave: () => void;
  onTest: () => void;
  isTesting: boolean;
  isSaving: boolean;
}

export function ProviderBasicConfigCard({
  provider,
  onUpdate,
  onSave,
  onTest,
  isTesting,
  isSaving,
}: Props) {
  const [showKey, setShowKey] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const currentProtocol = PROTOCOL_OPTIONS.find(p => p.id === provider.providerType) || PROTOCOL_OPTIONS[0];

  const handleTypeChange = (type: ApiProviderProtocol) => {
    const opt = PROTOCOL_OPTIONS.find(p => p.id === type);
    onUpdate({
      providerType: type,
      catalogPath: opt?.defaultCatalog || provider.catalogPath,
    });
  };

  return (
    <div className="bg-white dark:bg-[#1a1c20] rounded-2xl border border-slate-200/80 dark:border-white/10 p-5 space-y-4 shadow-sm">
      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
        基础配置
      </div>

      <div className="space-y-4">
        {/* 服务商名称 */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            服务商名称
          </label>
          <input
            type="text"
            value={provider.name}
            onChange={e => onUpdate({ name: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
            placeholder="例如：Google"
          />
        </div>

        {/* 服务商类型 */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            服务商类型
          </label>
          <select
            value={provider.providerType}
            onChange={e => handleTypeChange(e.target.value as ApiProviderProtocol)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
          >
            {PROTOCOL_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id} className="dark:bg-slate-800">
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            新建模型的调用协议模板（系统原生走标准 OpenAI 兼容协议，支持各类聚合网关与中转服务）。
          </p>
        </div>

        {/* API 密钥 */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            API 密钥
          </label>
          <p className="mb-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            独立域名必须填写该服务商密钥；仅同一中转地址可留空沿用全局 Key
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type={showKey ? 'text' : 'password'}
                value={provider.apiKey}
                onChange={e => onUpdate({ apiKey: e.target.value })}
                placeholder="输入 API Key"
                className="w-full pl-3 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={onTest}
              disabled={isTesting || !provider.apiKey.trim()}
              className="px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-all shrink-0 inline-flex items-center gap-1.5"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {isTesting ? '检测中…' : '检测'}
            </button>
          </div>
        </div>

        {/* 接口地址 (Base URL) */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            接口地址 (Base URL)
          </label>
          <input
            type="text"
            value={provider.baseUrl}
            onChange={e => onUpdate({ baseUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
          />
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            目录只用于发现模型；不提供目录的接口也可手动添加模型。
          </p>
        </div>

        {/* 接口格式说明提示 */}
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          接口格式: {currentProtocol.formatHint}
        </div>

        {/* 模型目录设置折叠面板 */}
        <div className="border border-slate-200/60 dark:border-white/5 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setCatalogOpen(!catalogOpen)}
            className="w-full px-3 py-2.5 flex items-center justify-between text-left text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              {catalogOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              模型目录设置
            </span>
            <span className="text-[10px] text-slate-400">
              {provider.catalogPath || '默认端点'}
            </span>
          </button>
          {catalogOpen && (
            <div className="p-3 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-200/60 dark:border-white/5 space-y-2">
              <label className="block text-[11px] text-slate-500 dark:text-slate-400">
                获取模型目录端点相对路径 (例如 /v1/models 或 /v1beta/models)
              </label>
              <input
                type="text"
                value={provider.catalogPath || ''}
                onChange={e => onUpdate({ catalogPath: e.target.value })}
                placeholder={currentProtocol.defaultCatalog}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        {/* 保存配置与提示行 */}
        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-medium rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSaving ? '保存中…' : '保存配置'}
          </button>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            新模型默认使用服务商地址和密钥
          </span>
        </div>
      </div>
    </div>
  );
}

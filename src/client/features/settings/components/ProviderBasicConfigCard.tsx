import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, ChevronRight, ChevronDown, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { type ApiProvider, PROTOCOL_OPTIONS, type ApiProviderProtocol } from '../model/apiProviderTypes';

interface Props {
  provider: ApiProvider;
  onUpdate: (updates: Partial<ApiProvider>) => void;
  onSave: () => void;
  onTest: () => void;
  isTesting: boolean;
  isSaving: boolean;
  testOutcome?: { ok: boolean; message: string; timestamp: number };
}

export function ProviderBasicConfigCard({
  provider,
  onUpdate,
  onSave,
  onTest,
  isTesting,
  isSaving,
  testOutcome,
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
      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
          连接配置
        </div>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          修改后点击「保存配置」即时生效
        </span>
      </div>

      <div className="space-y-4">
        {/* 1. 服务商名称 */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            服务商名称
          </label>
          <input
            type="text"
            value={provider.name}
            onChange={e => onUpdate({ name: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
            placeholder="例如：Comfly 网关 / OpenAI"
          />
        </div>

        {/* 2. API 地址 (Base URL) */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            API 地址
          </label>
          <input
            type="text"
            value={provider.baseUrl}
            onChange={e => onUpdate({ baseUrl: e.target.value })}
            placeholder="https://api.example.com"
            className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
          />
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            可粘贴基础地址或常见完整接口地址，保存时会自动规范端点。
          </p>
        </div>

        {/* 3. API 密钥 (API Key) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              API 密钥
            </label>
            {testOutcome && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                testOutcome.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {testOutcome.ok ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    连接正常
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    连接异常
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type={showKey ? 'text' : 'password'}
                value={provider.apiKey}
                onChange={e => onUpdate({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full pl-3 pr-9 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
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
              title="测试当前地址与密钥连通性"
              className="px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-all shrink-0 inline-flex items-center gap-1.5"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {isTesting ? '检测中…' : '检测连接'}
            </button>
          </div>
          {testOutcome && !testOutcome.ok && (
            <p className="mt-1 text-[11px] text-rose-500 dark:text-rose-400 leading-tight">
              {testOutcome.message}
            </p>
          )}
        </div>

        {/* 4. 服务商类型 / 调用协议 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              服务商类型
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              {currentProtocol.formatHint}
            </span>
          </div>
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
        </div>

        {/* 模型目录设置高级折叠面板 */}
        <div className="border border-slate-200/60 dark:border-white/5 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setCatalogOpen(!catalogOpen)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-left text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              {catalogOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              高级设置：模型目录端点路径
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {provider.catalogPath || '默认 (/v1/models)'}
            </span>
          </button>
          {catalogOpen && (
            <div className="p-3.5 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-200/60 dark:border-white/5 space-y-2">
              <label className="block text-[11px] text-slate-500 dark:text-slate-400">
                获取模型目录的相对路径（通常为 `/v1/models` 或 `/v1beta/models`）：
              </label>
              <input
                type="text"
                value={provider.catalogPath || ''}
                onChange={e => onUpdate({ catalogPath: e.target.value })}
                placeholder={currentProtocol.defaultCatalog}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        {/* 保存配置与提示行：右对齐操作按钮 */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            保存后该服务商下的所有接口请求将自动使用新配置
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-all shadow-xs inline-flex items-center justify-center gap-1.5 shrink-0 self-end sm:self-auto"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSaving ? '保存中…' : '保存配置'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

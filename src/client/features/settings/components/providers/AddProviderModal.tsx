import React, { useState } from 'react';
import { X, Plus, Server } from 'lucide-react';
import { PROTOCOL_OPTIONS, type ApiProviderProtocol, type ApiProvider } from '../../model/apiProviderTypes';
import { isDashScopeBase } from '@shared/domain/media/imageCapabilities';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (provider: Omit<ApiProvider, 'id' | 'isRemovable'>) => void;
}

export function AddProviderModal({ isOpen, onClose, onAdd }: Props) {
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<ApiProviderProtocol>('openai');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com');
  const [apiKey, setApiKey] = useState('');
  const [catalogPath, setCatalogPath] = useState('/v1/models');

  if (!isOpen) return null;

  const handleTypeChange = (type: ApiProviderProtocol) => {
    setProviderType(type);
    const opt = PROTOCOL_OPTIONS.find(o => o.id === type);
    if (opt) {
      setCatalogPath(opt.defaultCatalog);
      if (type === 'gemini') {
        setBaseUrl('https://generativelanguage.googleapis.com');
      } else if (type === 'anthropic') {
        setBaseUrl('https://api.anthropic.com');
      } else if (type === 'openai') {
        setBaseUrl('https://api.openai.com');
      } else if (type === 'dashscope') {
        setBaseUrl('https://maas.qianwenaiapi.com');
      }
    }
  };

  const handleBaseUrl = (value: string) => {
    setBaseUrl(value);
    if (isDashScopeBase(value) && providerType !== 'template') {
      setProviderType('dashscope');
      setCatalogPath('/compatible-mode/v1/models');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      providerType,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
      catalogPath: catalogPath.trim(),
      isCustom: true,
      description: PROTOCOL_OPTIONS.find(o => o.id === providerType)?.label || '自定义服务商',
    });
    setName('');
    setApiKey('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-[#1a1c20] text-slate-900 dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Server className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-semibold">添加服务商</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              服务商名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：Google、自建中转站"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              服务商协议类型
            </label>
            <select
              value={providerType}
              onChange={e => handleTypeChange(e.target.value as ApiProviderProtocol)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
            >
              {PROTOCOL_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id} className="dark:bg-slate-800">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              接口地址 (Base URL) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={baseUrl}
              onChange={e => handleBaseUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              API 密钥 (API Key)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="可选，可在添加后配置"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !baseUrl.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              创建服务商
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

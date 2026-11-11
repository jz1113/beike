import React, { useState } from 'react';
import { X, Plus, Server } from 'lucide-react';
import { PROTOCOL_OPTIONS, type ApiProviderProtocol, type ApiProvider } from '../../model/apiProviderTypes';
import { isDashScopeBase } from '@shared/domain/media/imageCapabilities';

interface ProviderPreset {
  name: string;
  protocol: ApiProviderProtocol;
  baseUrl: string;
}

/** 手动选择后才填入表单，不改已配置的渠道或密钥。 */
const providerPresets: readonly ProviderPreset[] = [
  { name: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com' },
  { name: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  { name: 'Google Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  { name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com' },
  { name: '阿里云百炼', protocol: 'dashscope', baseUrl: 'https://dashscope.aliyuncs.com' },
  { name: 'fal', protocol: 'fal', baseUrl: 'https://queue.fal.run' },
  { name: '火山方舟', protocol: 'custom', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { name: '可灵官方', protocol: 'custom', baseUrl: 'https://api-singapore.klingai.com' },
  { name: '硅基流动', protocol: 'openai', baseUrl: 'https://api.siliconflow.cn' },
  { name: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (provider: Omit<ApiProvider, 'id' | 'isRemovable'>) => string | false;
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
      } else if (type === 'fal') {
        setBaseUrl('https://queue.fal.run');
      }
    }
  };

  const selectPreset = (value: string) => {
    const preset = providerPresets.find(item => item.name === value);
    if (!preset) return;
    handleTypeChange(preset.protocol);
    setBaseUrl(preset.baseUrl);
    setName(preset.name);
    setApiKey('');
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
    const added = onAdd({
      name: name.trim(),
      providerType,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
      catalogPath: catalogPath.trim(),
      isCustom: true,
      description: PROTOCOL_OPTIONS.find(o => o.id === providerType)?.label || '自定义服务商',
    });
    if (!added) return;
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
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            从服务商预设填写
            <select value="" onChange={e => selectPreset(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-[#24262b]">
              <option value="">选择预设，或手动填写下方信息</option>
              {providerPresets.map(preset => <option key={preset.name}>{preset.name}</option>)}
            </select>
          </label>
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

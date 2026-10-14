import React, { useState } from 'react';
import { X, Layers } from 'lucide-react';
import { loadStoredProviders, type ApiProvider } from '../model/apiProviderTypes';
import type { WorkflowModel } from './settingsShared';
import { useSettingsDialogFocus } from '../hooks/useSettingsDialogFocus';

interface Props {
  initialChannel?: string;
  onClose: () => void;
  onAdd: (model: WorkflowModel) => boolean;
  existingRouteIds?: Set<string>;
}

export const API_TEMPLATE_OPTIONS = [
  { id: 'chat_completions', label: 'Chat Completions 兼容接口', desc: '使用 Chat Completions (/v1/chat/completions) 请求格式。每个模型可单独配置地址和 Key，选择模型时自动使用对应协议。' },
  { id: 'responses', label: 'Responses 兼容接口', desc: '使用 OpenAI Responses 协议 (/v1/responses) 格式。' },
  { id: 'gemini', label: 'Gemini 原生接口', desc: '使用 Gemini generateContent 格式。' },
  { id: 'anthropic', label: 'Anthropic Messages 原生接口', desc: '使用 Anthropic (/v1/messages) 格式。' },
  { id: 'azure', label: 'Azure OpenAI 原生接口', desc: '使用 Azure 专有部署端点。' },
];

export default function AddModelModal({
  initialChannel = 'comfly',
  onClose,
  onAdd,
}: Props) {
  const dialogRef = useSettingsDialogFocus<HTMLFormElement>(true, onClose);
  const providers: ApiProvider[] = loadStoredProviders();

  // 当前选中的服务商
  const currentProvider = providers.find(p => p.id === initialChannel) || providers[0];
  const [selectedProviderId, setSelectedProviderId] = useState<string>(currentProvider?.id || 'comfly_gateway');

  const provider = providers.find(p => p.id === selectedProviderId) || currentProvider;

  const [displayName, setDisplayName] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiTemplate, setApiTemplate] = useState('chat_completions');
  const [capability, setCapability] = useState<'chat' | 'image' | 'video'>('chat');
  const [useProviderCreds, setUseProviderCreds] = useState(true);
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedId = modelId.trim();
    if (!trimmedId) {
      setError('请填写模型 ID');
      return;
    }

    const trimmedName = displayName.trim() || trimmedId;
    const isImage = capability === 'image';
    const isVideo = capability === 'video';
    const isMultimodal = capability === 'chat';

    const model: WorkflowModel = {
      id: trimmedId,
      name: trimmedName,
      shortName: trimmedName.slice(0, 10),
      channel: provider?.id || 'comfly',
      providerId: provider?.id,
      customBaseUrl: !useProviderCreds && customBaseUrl.trim() ? customBaseUrl.trim() : (provider?.baseUrl || undefined),
      customApiKey: !useProviderCreds && customApiKey.trim() ? customApiKey.trim() : (provider?.apiKey || undefined),
      apiTemplate,
      enabled: true,
      isCustom: true,
      isImage,
      isVideo,
      isMultimodal,
      isVision: isMultimodal,
      isAssistant: isMultimodal,
      badge: provider?.name ? provider.name.slice(0, 8) : '自定义',
      desc: `接入自 ${provider?.name || '自定义服务商'}`,
    };

    if (onAdd(model)) {
      onClose();
    } else {
      setError('未能添加：可能已有同名模型 ID，或本地存储不可用。');
    }
  };

  const selectedTemplateDesc = API_TEMPLATE_OPTIONS.find(t => t.id === apiTemplate)?.desc;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-fade-in">
      <form
        ref={dialogRef}
        tabIndex={-1}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-model-title"
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1a1c20] text-slate-900 dark:text-slate-100 shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
      >
        <header className="p-5 border-b border-slate-100 dark:border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </span>
            <h2 id="add-model-title" className="text-sm font-bold">
              添加自定义模型
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭添加模型"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* 显示名称 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              显示名称
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="例如：Gemini 2.5 Flash 或 自定义对话模型"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              仅用于界面显示；收起时最多显示 8 个字符，展开可查看完整名称。
            </p>
          </div>

          {/* 模型 ID */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              模型 ID <span className="text-rose-500">*</span>
            </label>
            <input
              required
              value={modelId}
              onChange={e => {
                setModelId(e.target.value);
                setError('');
              }}
              placeholder="例如：gemini-2.5-flash 或 claude-3-7-sonnet"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              实际发送给服务商的 model，请与服务商模型列表保持一致；修改显示名称不会改变它。
            </p>
          </div>

          {/* 接口模板 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              接口模板
            </label>
            <select
              value={apiTemplate}
              onChange={e => setApiTemplate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-indigo-500"
            >
              {API_TEMPLATE_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id} className="dark:bg-slate-800">
                  {opt.label}
                </option>
              ))}
            </select>
            {selectedTemplateDesc && (
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {selectedTemplateDesc}
              </p>
            )}
          </div>

          {/* 模型能力选择 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              模型能力类型
            </label>
            <div className="flex gap-2">
              {[
                { id: 'chat', label: '对话 / 视觉分析' },
                { id: 'image', label: '绘画 (生图/图生图)' },
                { id: 'video', label: '视频 (文/图生视频)' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCapability(item.id as typeof capability)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
                    capability === item.id
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                      : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 所属服务商 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              所属服务商
            </label>
            <select
              value={selectedProviderId}
              onChange={e => setSelectedProviderId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-indigo-500"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id} className="dark:bg-slate-800">
                  {p.name} ({p.baseUrl})
                </option>
              ))}
            </select>
          </div>

          {/* 使用服务商的地址和密钥 */}
          <div className="pt-2 border-t border-slate-100 dark:border-white/10 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={useProviderCreds}
                onChange={e => setUseProviderCreds(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>使用「{provider?.name || '当前服务商'}」的地址和密钥</span>
            </label>

            {!useProviderCreds && (
              <div className="space-y-3 pl-5 border-l-2 border-indigo-200 dark:border-indigo-900/50 py-1">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    接口地址 (Base URL)
                  </label>
                  <input
                    value={customBaseUrl}
                    onChange={e => setCustomBaseUrl(e.target.value)}
                    placeholder={provider?.baseUrl || 'https://...'}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    API Key (留空沿用全局 Key)
                  </label>
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={e => setCustomApiKey(e.target.value)}
                    placeholder="可选，留空则沿用服务商默认密钥"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-600">
              {error}
            </p>
          )}
        </div>

        <footer className="p-4 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/10 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-sm"
          >
            保存模型
          </button>
        </footer>
      </form>
    </div>
  );
}

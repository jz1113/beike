import React, { useState } from 'react';
import { ExternalLink, Trash2, Globe } from 'lucide-react';
import { type ApiProvider } from '../model/apiProviderTypes';
import { ProviderBasicConfigCard } from './ProviderBasicConfigCard';
import { ProviderModelsCard } from './ProviderModelsCard';
import type { WorkflowModel } from './settingsShared';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { ComflyLogo, LianchiLogo } from '@client/shared/icons';

interface Props {
  provider: ApiProvider;
  models: WorkflowModel[];
  onUpdateProvider: (updates: Partial<ApiProvider>) => void;
  onSaveProvider: () => void;
  onRemoveProvider: (id: string) => void;
  onTestProvider: () => void;
  onFetchModels: () => void;
  onAddManualModel: () => void;
  onToggleModelEnabled: (modelId: string, enabled: boolean) => void;
  onRemoveModel: (modelId: string) => void;
  isTesting: boolean;
  isSaving: boolean;
  isFetchingModels: boolean;
}

export function ApiProviderDetailPanel({
  provider,
  models,
  onUpdateProvider,
  onSaveProvider,
  onRemoveProvider,
  onTestProvider,
  onFetchModels,
  onAddManualModel,
  onToggleModelEnabled,
  onRemoveModel,
  isTesting,
  isSaving,
  isFetchingModels,
}: Props) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const renderBigLogo = () => {
    const cls = "w-6 h-6";
    if (provider.id === 'google' || provider.iconType === 'google') {
      return <ModelIcon modelId="gemini-3.1-pro-preview" className={cls} />;
    }
    if (provider.id === 'openai_official' || provider.iconType === 'openai') {
      return <ModelIcon modelId="gpt-6-luna" className={cls} />;
    }
    if (provider.id === 'deepseek_official' || provider.iconType === 'deepseek') {
      return <ModelIcon modelId="deepseek-flash" className={cls} />;
    }
    if (provider.id === 'comfly_gateway' || provider.iconType === 'comfly') {
      return <ComflyLogo className={cls} />;
    }
    if (provider.id === 'lianchi_images' || provider.iconType === 'lianchi') {
      return <LianchiLogo className={cls} />;
    }
    if (provider.id === 'mita' || provider.iconType === 'mita') {
      return (
        <span className="w-6 h-6 rounded-full bg-[#185a9d] text-white flex items-center justify-center text-xs font-bold">
          秘
        </span>
      );
    }
    if (provider.id === 'soonstudio' || provider.iconType === 'soonstudio') {
      return (
        <span className="w-6 h-6 rounded-full bg-[#f4b400] text-black flex items-center justify-center text-xs font-black">
          S
        </span>
      );
    }
    return <Globe className="w-6 h-6 text-slate-500" />;
  };

  const handleConfirmRemove = () => {
    onRemoveProvider(provider.id);
    setConfirmDeleteOpen(false);
  };

  return (
    <div className="w-full space-y-4">
      {/* 顶部 Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
            {renderBigLogo()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {provider.name}
              </h2>
              {provider.websiteUrl && (
                <a
                  href={provider.websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="访问官方平台"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 capitalize">
              {provider.description || provider.providerType}
            </div>
          </div>
        </div>

        {/* 整个服务商启用开关 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={provider.enabled}
            onClick={() => onUpdateProvider({ enabled: !provider.enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              provider.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-white/20'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                provider.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 卡片1：基础配置 */}
      <ProviderBasicConfigCard
        provider={provider}
        onUpdate={onUpdateProvider}
        onSave={onSaveProvider}
        onTest={onTestProvider}
        isTesting={isTesting}
        isSaving={isSaving}
      />

      {/* 卡片2：模型列表与空状态 */}
      <ProviderModelsCard
        provider={provider}
        models={models}
        onFetchModels={onFetchModels}
        onAddManualModel={onAddManualModel}
        onToggleModelEnabled={onToggleModelEnabled}
        onRemoveModel={onRemoveModel}
        isFetchingModels={isFetchingModels}
      />

      {/* 底部危险操作区：移除服务商 */}
      <div className="pt-2 flex items-center justify-between">
        {confirmDeleteOpen ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-xs">
            <span className="text-rose-700 dark:text-rose-300">
              确定移除「{provider.name}」吗？相关配置及模型将一并清理。
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors"
              >
                确定移除
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors inline-flex items-center gap-1.5 py-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            移除服务商
          </button>
        )}
      </div>
    </div>
  );
}

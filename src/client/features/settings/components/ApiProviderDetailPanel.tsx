import React, { useState } from 'react';
import { Trash2, Globe } from 'lucide-react';
import { type ApiProvider } from '../model/apiProviderTypes';
import { ProviderBasicConfigCard } from './ProviderBasicConfigCard';
import { ComflyLogo, LianchiLogo, OpenAILogo, DeepSeekLogo } from '@client/shared/icons';

interface Props {
  provider: ApiProvider;
  onUpdateProvider: (updates: Partial<ApiProvider>) => void;
  onSaveProvider: () => void;
  onRemoveProvider: (id: string) => void;
  onTestProvider: () => void;
  isTesting: boolean;
  isSaving: boolean;
  testOutcome?: { ok: boolean; message: string; timestamp: number };
}

export function ApiProviderDetailPanel({
  provider,
  onUpdateProvider,
  onSaveProvider,
  onRemoveProvider,
  onTestProvider,
  isTesting,
  isSaving,
  testOutcome,
}: Props) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const renderBigLogo = () => {
    const cls = "w-7 h-7";
    if (provider.id === 'openai_official' || provider.iconType === 'openai') {
      return <OpenAILogo className={cls} />;
    }
    if (provider.id === 'deepseek_official' || provider.iconType === 'deepseek') {
      return <DeepSeekLogo className={cls} />;
    }
    if (provider.id === 'comfly_gateway' || provider.iconType === 'comfly') {
      return <ComflyLogo className={cls} />;
    }
    if (provider.id === 'lianchi_images' || provider.iconType === 'lianchi') {
      return <LianchiLogo className={cls} />;
    }
    return <Globe className="w-7 h-7 text-slate-500 dark:text-slate-400" />;
  };

  const handleConfirmRemove = () => {
    onRemoveProvider(provider.id);
    setConfirmDeleteOpen(false);
  };

  return (
    <div className="w-full space-y-4">
      {/* 顶部 Header：服务商基本信息 + 总开关 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            {renderBigLogo()}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {provider.name}
            </h2>
          </div>
        </div>

        {/* 整个服务商启用开关 */}
        <div className="flex items-center gap-2.5 self-end sm:self-center">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {provider.enabled ? '服务商已启用' : '服务商已停用'}
          </span>
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

      {/* 核心卡片：直出基础与连接配置 */}
      <ProviderBasicConfigCard
        provider={provider}
        onUpdate={onUpdateProvider}
        onSave={onSaveProvider}
        onTest={onTestProvider}
        isTesting={isTesting}
        isSaving={isSaving}
        testOutcome={testOutcome}
      />

      {/* 底部危险操作区：移除服务商 (右对齐) */}
      <div className="pt-2 flex items-center justify-end">
        {confirmDeleteOpen ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-xs">
            <span className="text-rose-700 dark:text-rose-300">
              确定移除「{provider.name}」吗？相关配置及关联模型将一并清理。
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

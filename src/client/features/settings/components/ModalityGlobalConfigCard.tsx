import React, { useState, useRef, useEffect } from 'react';
import type { ModalityGlobalConfig } from '../model/modalityModelTypes';
import { Eye, EyeOff, ChevronDown, X } from 'lucide-react';

interface Props {
  globalConfig: ModalityGlobalConfig;
  updateGlobalConfig: (updates: Partial<ModalityGlobalConfig>) => void;
  saveGlobalConfig: () => void;
  selectBaseUrl: (url: string) => void;
  removeBaseUrlFromHistory: (url: string) => void;
  selectApiKey: (key: string) => void;
  removeApiKeyFromHistory: (key: string) => void;
  onSyncModels: () => void;
  isSyncingModels: boolean;
}

export function ModalityGlobalConfigCard({
  globalConfig,
  updateGlobalConfig,
  saveGlobalConfig,
  selectBaseUrl,
  removeBaseUrlFromHistory,
  selectApiKey,
  removeApiKeyFromHistory,
  onSyncModels,
  isSyncingModels,
}: Props) {
  const [showGlobalKey, setShowGlobalKey] = useState(false);
  const [showGlobalUrl, setShowGlobalUrl] = useState(false);
  const [showUrlDropdown, setShowUrlDropdown] = useState(false);
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);

  const urlDropdownRef = useRef<HTMLDivElement>(null);
  const keyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (urlDropdownRef.current && !urlDropdownRef.current.contains(event.target as Node)) {
        setShowUrlDropdown(false);
      }
      if (keyDropdownRef.current && !keyDropdownRef.current.contains(event.target as Node)) {
        setShowKeyDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <section className="rounded-2xl bg-white dark:bg-[#1a1c20] border border-slate-200/90 dark:border-white/10 p-5 space-y-4 shadow-xs">
      <div className="space-y-3">
        {/* 全局地址（带图3下拉快切） */}
        <div className="grid grid-cols-[80px_1fr] sm:grid-cols-[90px_1fr] items-center gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 select-none">
            全局地址
          </label>
          <div className="relative" ref={urlDropdownRef}>
            <input
              type={showGlobalUrl ? 'text' : 'password'}
              value={globalConfig.baseUrl}
              onChange={(e) => updateGlobalConfig({ baseUrl: e.target.value })}
              onFocus={() => setShowUrlDropdown(true)}
              className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-100 font-mono text-xs pr-16 transition-colors placeholder:text-slate-400"
              placeholder="https://ai.comfly.org"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowUrlDropdown(!showUrlDropdown)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="常用与历史服务商地址"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowGlobalUrl(!showGlobalUrl)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title={showGlobalUrl ? '隐藏' : '显示'}
              >
                {showGlobalUrl ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* 图3：下拉地址列表 */}
            {showUrlDropdown && (
              <div className="absolute left-0 top-full mt-1.5 w-full rounded-xl bg-white dark:bg-[#202328] border border-slate-200 dark:border-white/10 shadow-xl z-50 py-1 max-h-56 overflow-y-auto">
                <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5">
                  常用服务商与历史地址
                </div>
                {globalConfig.baseUrlHistory.length > 0 ? (
                  globalConfig.baseUrlHistory.map((url) => (
                    <div
                      key={url}
                      className={`flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors ${
                        url === globalConfig.baseUrl
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                      onClick={() => {
                        selectBaseUrl(url);
                        setShowUrlDropdown(false);
                      }}
                    >
                      <span className="truncate pr-2">{url}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBaseUrlFromHistory(url);
                        }}
                        className="p-0.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                        title="从历史记录删除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-400">暂无历史地址</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 全局默认Key（带下拉快切） */}
        <div className="grid grid-cols-[80px_1fr] sm:grid-cols-[90px_1fr] items-center gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 select-none">
            全局默认Key
          </label>
          <div className="relative" ref={keyDropdownRef}>
            <input
              type={showGlobalKey ? 'text' : 'password'}
              value={globalConfig.apiKey}
              onChange={(e) => updateGlobalConfig({ apiKey: e.target.value })}
              onFocus={() => {
                if (globalConfig.apiKeyHistory.length > 0) setShowKeyDropdown(true);
              }}
              className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:bg-white dark:focus:bg-transparent focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-100 font-mono text-xs pr-16 transition-colors placeholder:text-slate-400"
              placeholder="sk-..."
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {globalConfig.apiKeyHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowKeyDropdown(!showKeyDropdown)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="切换已保存的密钥"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGlobalKey(!showGlobalKey)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title={showGlobalKey ? '隐藏' : '显示'}
              >
                {showGlobalKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* 下拉 Key 列表 */}
            {showKeyDropdown && globalConfig.apiKeyHistory.length > 0 && (
              <div className="absolute left-0 top-full mt-1.5 w-full rounded-xl bg-white dark:bg-[#202328] border border-slate-200 dark:border-white/10 shadow-xl z-50 py-1 max-h-56 overflow-y-auto">
                <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5">
                  已保存的密钥记录
                </div>
                {globalConfig.apiKeyHistory.map((key) => {
                  const masked = key.length > 10 ? `${key.slice(0, 4)}••••••••${key.slice(-4)}` : '••••••••';
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors ${
                        key === globalConfig.apiKey
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                      onClick={() => {
                        selectApiKey(key);
                        setShowKeyDropdown(false);
                      }}
                    >
                      <span className="truncate pr-2">{masked}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeApiKeyFromHistory(key);
                        }}
                        className="p-0.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                        title="从历史记录删除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部保存与提示行 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          修改后将自动作为各模型的默认 Base URL 与 Key，单模型内填写的专属配置具备更高优先级。
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onSyncModels}
            disabled={isSyncingModels}
            className="h-8.5 px-4 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            title="从生效的 Base URL 拉取远端模型目录"
          >
            {isSyncingModels ? '正在同步…' : '同步模型'}
          </button>
          <button
            type="button"
            onClick={() => saveGlobalConfig()}
            className="h-8.5 px-4 rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            保存全局配置
          </button>
        </div>
      </div>
    </section>
  );
}

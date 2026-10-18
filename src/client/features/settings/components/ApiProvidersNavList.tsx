import React from 'react';
import { Search, Plus, Globe } from 'lucide-react';
import { type ApiProvider } from '../model/apiProviderTypes';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { ComflyLogo, LianchiLogo, OpenAILogo, DeepSeekLogo, OneBoundLogo, ApiaLogo, QiyunLogo } from '@client/shared/icons';

interface Props {
  providers: ApiProvider[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenAddModal: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  testResults?: Record<string, { ok: boolean; message: string; timestamp: number }>;
}

export function ApiProvidersNavList({
  providers,
  selectedId,
  onSelect,
  onOpenAddModal,
  searchQuery,
  onSearchChange,
  testResults = {},
}: Props) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = providers.filter(p =>
    !q || p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))
  );

  const renderProviderIcon = (provider: ApiProvider) => {
    const iconCls = "w-5 h-5";
    if (provider.id === 'google' || provider.iconType === 'google') {
      return <ModelIcon modelId="gemini-3.1-pro-preview" className={iconCls} />;
    }
    if (provider.id === 'openai_official' || provider.iconType === 'openai') {
      return <OpenAILogo className={iconCls} />;
    }
    if (provider.id === 'deepseek_official' || provider.iconType === 'deepseek') {
      return <DeepSeekLogo className={iconCls} />;
    }
    if (provider.id === 'comfly_gateway' || provider.iconType === 'comfly') {
      return <ComflyLogo className={iconCls} />;
    }
    if (provider.id === 'lianchi_images' || provider.iconType === 'lianchi') {
      return <LianchiLogo className={iconCls} />;
    }
    if (provider.id === 'mita' || provider.iconType === 'mita') {
      return (
        <span className="w-5 h-5 rounded-full bg-[#185a9d] text-white flex items-center justify-center text-[10px] font-bold">
          秘
        </span>
      );
    }
    if (provider.id === 'soonstudio' || provider.iconType === 'soonstudio') {
      return (
        <span className="w-5 h-5 rounded-full bg-[#f4b400] text-black flex items-center justify-center text-[10px] font-black">
          S
        </span>
      );
    }
    return <Globe className="w-5 h-5 text-slate-500 dark:text-slate-400" />;
  };

  const renderStatusDot = (provider: ApiProvider) => {
    const res = testResults[provider.id];
    if (res) {
      return res.ok ? (
        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title="连接正常" />
      ) : (
        <span className="w-2 h-2 rounded-full bg-rose-500 shadow-xs" title={res.message || "连接异常"} />
      );
    }
    if (!provider.apiKey) {
      return (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" title="待配置 Key" />
      );
    }
    return (
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-white/20" title="已配置 Key，未测试" />
    );
  };

  return (
    <aside
      className="settings-service-nav hidden @[840px]/settings-modal:flex w-52 lg:w-56 border-r border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-[#141619] p-3 flex-col shrink-0 min-h-0"
      aria-label="服务商与渠道列表"
    >
      <div className="flex items-center gap-1.5 mb-3">
        <label className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input
            aria-label="搜索服务商"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索服务商"
            className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-white/5 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-indigo-500 transition-colors"
          />
        </label>
        <button
          type="button"
          onClick={onOpenAddModal}
          title="添加服务商"
          aria-label="添加服务商"
          className="p-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div>
          <div className="px-2 mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-500">
            <span>服务商 · {filtered.length}</span>
          </div>

          <div className="space-y-1">
            {filtered.map(item => {
              const active = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSelect(item.id)}
                  className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2.5 transition-all ${
                    active
                      ? 'bg-white dark:bg-[#202328] text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-white/15'
                      : 'hover:bg-white/60 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="w-7 h-7 shrink-0 flex items-center justify-center">
                    {renderProviderIcon(item)}
                  </span>
                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate">{item.name}</span>
                    {item.isPromoted && (
                      <span className="px-1 py-0.2 text-[9px] font-medium rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shrink-0">
                        推广
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center pl-1">
                    {renderStatusDot(item)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 传统扩展服务（电商采集、内容解析） */}
        <div className="pt-2 border-t border-slate-200/60 dark:border-white/5">
          <div className="px-2 mb-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            集成服务
          </div>
          <div className="space-y-1">
            {[
              { id: 'wanbang_ecommerce', name: '万邦电商采集', icon: <OneBoundLogo className="w-4 h-4" /> },
              { id: 'apia_parser', name: 'APIA 图集解析', icon: <ApiaLogo className="w-4 h-4" /> },
              { id: 'qiyun_parser', name: '奇云解析', icon: <QiyunLogo className="w-4 h-4" /> },
            ].map(svc => {
              const active = selectedId === svc.id;
              return (
                <button
                  key={svc.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSelect(svc.id)}
                  className={`w-full text-left p-2 rounded-xl flex items-center gap-2.5 transition-all ${
                    active
                      ? 'bg-white dark:bg-[#202328] text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-white/15'
                      : 'hover:bg-white/60 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                    {svc.icon}
                  </span>
                  <span className="text-xs truncate">{svc.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

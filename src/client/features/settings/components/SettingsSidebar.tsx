import { useMemo, useState } from 'react';
import { House, Search, X } from 'lucide-react';
import { SETTINGS_NAV_GROUPS, type SettingsNavSection } from '../model/settingsNavigation';

export function SettingsSidebar({ onBack, navSection, setNavSection, gatewayBalanceFormatted }: {
  onBack: () => void; navSection: SettingsNavSection; setNavSection: (section: SettingsNavSection) => void; gatewayBalanceFormatted?: number;
}) {
  const [navSearchQuery, setNavSearchQuery] = useState('');
  const filteredGroups = useMemo(() => {
    const query = navSearchQuery.trim().toLowerCase();
    return SETTINGS_NAV_GROUPS.map(group => ({ ...group,
      items: group.items.filter(item => !query || item.label.toLowerCase().includes(query) || item.keywords.some(keyword => keyword.toLowerCase().includes(query))),
    })).filter(group => group.items.length > 0);
  }, [navSearchQuery]);
  return (
        <aside
          data-settings-sidebar
          className="settings-sidebar hidden md:flex w-52 xl:w-56 shrink-0 h-full bg-slate-50 border-r border-slate-200/60 flex flex-col justify-between overflow-hidden relative z-20"
        >
          <div className="flex flex-col pt-3 sm:pt-4 px-3 sm:px-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="返回首页"
              className="h-10 w-10 rounded-xl bg-white hover:bg-slate-100/90 active:bg-slate-200/80 border border-slate-200/80 shadow-2xs flex items-center justify-center text-slate-600 hover:text-slate-950 transition-all cursor-pointer"
              title="返回首页"
            >
              <House className="h-4 w-4" />
            </button>

            {/* 搜索框（对标图 2 搜索设置...） */}
            <div className="relative mt-3 mb-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={navSearchQuery}
                onChange={(e) => setNavSearchQuery(e.target.value)}
                aria-label="搜索设置"
                placeholder="搜索设置"
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white/90 hover:bg-white focus:bg-white border border-slate-200/80 focus:border-indigo-500 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-all"
              />
              {navSearchQuery && (
                <button
                  type="button"
                  aria-label="清空设置搜索"
                  onClick={() => setNavSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* 分组导航列表（对标图 2） */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 space-y-4">
            {filteredGroups.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">未找到相关设置项</div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.groupTitle} className="space-y-1">
                  <div className="px-2.5 text-[11px] font-bold text-slate-600 tracking-wider">
                    {group.groupTitle}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = navSection === item.id;
                      const isUsage = item.id === 'usage';

                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => setNavSection(item.id)}
                          className={`w-full px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer group ${
                            isActive
                              ? 'bg-slate-200/80 text-slate-950 font-bold shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-700'
                              }`}
                            />
                            <span className="text-left leading-5 whitespace-nowrap">{item.label}</span>
                          </div>

                          {isUsage && gatewayBalanceFormatted !== undefined && (
                            <span
                              className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              }`}
                            >
                              {gatewayBalanceFormatted > 999
                                ? (gatewayBalanceFormatted / 1000).toFixed(1) + 'k'
                                : gatewayBalanceFormatted.toFixed(1)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-5 text-xs text-slate-400">贝壳 · 设置中心</div>
        </aside>
  );
}

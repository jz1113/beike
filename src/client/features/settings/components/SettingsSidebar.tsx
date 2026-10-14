import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  CANVAS_SETTINGS_PAGES,
  SETTINGS_NAV_ITEMS,
  type CanvasSettingsPage,
  type SettingsNavSection,
} from '../model/settingsNavigation';

export function SettingsSidebar({
  navSection,
  setNavSection,
  canvasPage,
  setCanvasPage,
  gatewayBalanceFormatted,
}: {
  navSection: SettingsNavSection;
  setNavSection: (section: SettingsNavSection) => void;
  canvasPage: CanvasSettingsPage;
  setCanvasPage: (page: CanvasSettingsPage) => void;
  gatewayBalanceFormatted?: number;
}) {
  const [navSearchQuery, setNavSearchQuery] = useState('');
  const query = navSearchQuery.trim().toLowerCase();
  const items = useMemo(() => SETTINGS_NAV_ITEMS.filter(item => {
    if (!query) return true;
    if (item.label.toLowerCase().includes(query) || item.keywords.some(keyword => keyword.toLowerCase().includes(query))) return true;
    return item.id === 'canvas' && CANVAS_SETTINGS_PAGES.some(page => page.label.toLowerCase().includes(query) || page.keywords.some(keyword => keyword.toLowerCase().includes(query)));
  }), [query]);
  const canvasPages = useMemo(() => CANVAS_SETTINGS_PAGES.filter(page => {
    if (!query) return true;
    return page.label.toLowerCase().includes(query) || page.keywords.some(keyword => keyword.toLowerCase().includes(query)) || '画布功能'.includes(query);
  }), [query]);

  return (
    <aside data-settings-sidebar className="settings-sidebar hidden md:flex w-52 xl:w-56 shrink-0 h-full flex-col overflow-hidden">
      <div className="px-4 pt-5 pb-2">
        <div className="px-2 text-[13px] font-medium text-slate-500">全局设置</div>
        <div className="relative mt-3">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={navSearchQuery}
            onChange={(event) => setNavSearchQuery(event.target.value)}
            aria-label="搜索设置"
            placeholder="搜索设置"
            className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white/80 border border-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 focus:bg-white"
          />
          {navSearchQuery && (
            <button type="button" aria-label="清空设置搜索" onClick={() => setNavSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {items.length === 0 ? <div className="py-8 text-center text-xs text-slate-400">未找到相关设置项</div> : items.map(item => {
          const Icon = item.icon;
          const active = navSection === item.id;
          const profileBadge = item.id === 'profile' && gatewayBalanceFormatted !== undefined;
          return (
            <div key={item.id}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setNavSection(item.id)}
                className="w-full px-2.5 py-2 rounded-full text-[13px] flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {profileBadge && (
                  <span className="text-[10px] font-mono text-emerald-700">{gatewayBalanceFormatted > 999 ? `${(gatewayBalanceFormatted / 1000).toFixed(1)}k` : gatewayBalanceFormatted.toFixed(1)}</span>
                )}
              </button>
              {item.id === 'canvas' && active && (
                <div className="mt-1 mb-2 ml-2 space-y-0.5">
                  {canvasPages.map(page => (
                    <button
                      key={page.id}
                      type="button"
                      aria-current={canvasPage === page.id ? 'page' : undefined}
                      onClick={() => setCanvasPage(page.id)}
                      className="w-full px-2.5 py-1.5 rounded-full text-[13px] flex items-center justify-between"
                    >
                      <span>{page.label}</span>
                      {page.count !== undefined && <span className="text-[11px] text-slate-400">{page.count}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

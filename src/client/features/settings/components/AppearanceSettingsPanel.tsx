import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { BACKGROUND_CATALOG } from '@client/shared/media/backgrounds/backgroundCatalog';
import { AppearanceThemeCard } from './AppearanceThemeCard';
import { BackgroundStudioView } from './BackgroundStudioView';

export function AppearanceSettingsPanel() {
  const { isDark, backgroundStyle, setBackgroundStyle } = useAppTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return BACKGROUND_CATALOG;
    return BACKGROUND_CATALOG.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        item.keywords.some((entry) => entry.toLowerCase().includes(keyword)),
    );
  }, [query]);

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 overflow-y-auto lg:grid-cols-[152px_minmax(0,1fr)_248px] lg:grid-rows-1 lg:overflow-hidden xl:grid-cols-[180px_minmax(0,1fr)_280px]">
      <aside className="flex max-h-52 min-h-0 flex-col border-b border-slate-200/80 bg-[#f6f7f9] dark:border-white/[0.06] dark:bg-[#101012] lg:h-full lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="shrink-0 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="搜索背景"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索 ${BACKGROUND_CATALOG.length} 个背景`}
              className="studio-control-input h-8 w-full rounded-lg border border-slate-200/90 bg-white pl-8 pr-2 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-[#161619] dark:text-[#EDEDED]"
            />
          </div>
          {query.trim() ? (
            <p className="px-1 pt-2 text-[11px] text-slate-400">{filtered.length} 个结果</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500 dark:text-[#8E8E93]">没有匹配的主题</p>
          ) : (
            filtered.map((item) => (
              <AppearanceThemeCard
                key={item.id}
                item={item}
                selected={backgroundStyle === item.id}
                isDark={isDark}
                onSelect={() => setBackgroundStyle(item.id)}
              />
            ))
          )}
        </div>
      </aside>
      <BackgroundStudioView
        style={backgroundStyle}
        onStyleChange={setBackgroundStyle}
      />
    </div>
  );
}

export default AppearanceSettingsPanel;

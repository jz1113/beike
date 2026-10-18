import type { BackgroundCatalogItem } from '@client/shared/media/backgrounds/backgroundCatalog';
import { BackgroundPreviewArt } from './BackgroundPreviewArt';

export function AppearanceThemeCard({
  item,
  selected,
  isDark,
  onSelect,
}: {
  item: BackgroundCatalogItem;
  selected: boolean;
  isDark: boolean;
  onSelect: () => void;
}) {
  const accent = isDark ? item.darkAccent : item.lightAccent;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors ${
        selected
          ? 'bg-white text-slate-900 shadow-sm dark:bg-[#1F1F24] dark:text-white'
          : 'text-slate-600 hover:bg-white/80 dark:text-[#C7C7CC] dark:hover:bg-white/[0.05]'
      }`}
    >
      <span className="relative h-[30px] w-12 shrink-0 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
        <BackgroundPreviewArt style={item.id} isDark={isDark} accent={accent} />
      </span>
      <span className="min-w-0 truncate text-xs font-medium">{item.name}</span>
    </button>
  );
}

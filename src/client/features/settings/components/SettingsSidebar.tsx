import { SETTINGS_NAV_ITEMS, type SettingsNavSection } from '../model/settingsNavigation';
import { useI18n } from '@client/shared/i18n';
import {
  Activity, AudioLines, Bot, Box, HardDrive, Languages, LayoutGrid, MessageSquare,
  Music, Palette, Plug, SunMedium, UserRound, Video,
} from 'lucide-react';

const SECTION_ICONS = {
  profile: Activity,
  appearance: SunMedium,
  api: Plug,
  chat: MessageSquare,
  image: Palette,
  video: Video,
  three_d: Box,
  music: Music,
  avatar: UserRound,
  voice: AudioLines,
  canvas: LayoutGrid,
  pet: Bot,
  language: Languages,
  storage: HardDrive,
} satisfies Record<SettingsNavSection, typeof LayoutGrid>;

export function SettingsSidebar({
  navSection,
  setNavSection,
  gatewayBalanceFormatted,
  modalityCounts,
}: {
  navSection: SettingsNavSection;
  setNavSection: (section: SettingsNavSection) => void;
  gatewayBalanceFormatted?: number;
  modalityCounts?: Partial<Record<SettingsNavSection, number>>;
}) {
  const { t } = useI18n();

  return (
    <aside data-settings-sidebar className="settings-sidebar hidden md:flex w-52 xl:w-56 shrink-0 h-full flex-col overflow-hidden">
      <div className="px-4 pt-5 pb-2">
        <div className="px-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">{t('settings.globalSettings')}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {SETTINGS_NAV_ITEMS.map(item => {
          const Icon = SECTION_ICONS[item.id];
          const active = navSection === item.id;
          const profileBadge = item.id === 'profile' && gatewayBalanceFormatted !== undefined;
          const countBadge = modalityCounts?.[item.id];
          const displayLabel = t(`settings.nav.${item.id}`) || item.label;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setNavSection(item.id)}
              className="w-full px-2.5 py-2 rounded-full text-[13px] flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{displayLabel}</span>
              </span>
              {profileBadge ? (
                <span className="text-[10px] font-mono text-emerald-700">{gatewayBalanceFormatted > 999 ? `${(gatewayBalanceFormatted / 1000).toFixed(1)}k` : gatewayBalanceFormatted.toFixed(1)}</span>
              ) : countBadge !== undefined ? (
                <span className="text-[11px] font-mono text-slate-400 font-normal">{countBadge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

import { Check } from 'lucide-react';
import { useI18n, type SupportedLocale } from '@client/shared/i18n';

export function LanguageSettingsPanel() {
  const { locale, setLocale, t, locales } = useI18n();

  const handleSelectLocale = (targetLocale: SupportedLocale) => {
    setLocale(targetLocale);
  };

  return (
    <div className="w-full max-w-3xl animate-fade-in">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {t('settings.interfaceLanguage')}
        </h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed dark:text-[#8E8E93]">
          {t('settings.interfaceLanguageDesc')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {locales.map((item) => {
          const isSelected = locale === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectLocale(item.id)}
              className={`group flex items-center justify-between h-13 px-4 rounded-xl text-sm transition-all duration-150 text-left select-none border ${
                isSelected
                  ? 'bg-[#eef1eb] border-slate-300 text-slate-900 font-medium shadow-xs dark:bg-[#26262B] dark:border-white/20 dark:text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/70 dark:bg-[#1B1B1E] dark:border-white/[0.08] dark:text-[#EDEDED] dark:hover:border-white/20 dark:hover:bg-[#222226]'
              }`}
            >
              <span className="text-[13.5px] tracking-wide">{item.nativeLabel}</span>
              {isSelected ? (
                <Check className="h-4 w-4 text-slate-800 stroke-[2.2] shrink-0 dark:text-white" />
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-400 leading-relaxed dark:text-[#636366]">
        {t('settings.unmodifiedNotice')}
      </p>
    </div>
  );
}

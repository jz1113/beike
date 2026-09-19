import { settingsNavWidth } from '@/shared/ui/layoutClasses';
import {
  Layers,
  Activity,
  HardDrive,
  Palette,
  Info,
} from 'lucide-react';

export type SettingsNavSection =
  | 'api_services'
  | 'defaults'
  | 'usage'
  | 'local_storage'
  | 'appearance'
  | 'about';

interface SettingsNavProps {
  navSection: SettingsNavSection;
  setNavSection: (sec: SettingsNavSection) => void;
  gatewayBalanceFormatted?: number;
  isConfigured?: boolean;
}

export default function SettingsNav({
  navSection,
  setNavSection,
  gatewayBalanceFormatted,
}: SettingsNavProps) {
  const items: { id: SettingsNavSection; label: string; icon: typeof Layers }[] = [
    { id: 'api_services', label: '服务接口配置', icon: Layers },
    { id: 'usage', label: '用量统计', icon: Activity },
    { id: 'local_storage', label: '本地存储', icon: HardDrive },
    { id: 'appearance', label: '外观偏好', icon: Palette },
    { id: 'about', label: '关于系统', icon: Info },
  ];

  return (
    <div
      className={`${settingsNavWidth} border-r border-slate-100/90 bg-slate-50/60 p-2.5 flex flex-col flex-shrink-0 overflow-y-auto text-xs transition-[width] duration-200`}
    >
      <div className="space-y-1">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const isActive = navSection === item.id;
          const isUsage = item.id === 'usage';

          return (
            <div key={item.id}>
              {idx === 3 && <div className="h-px bg-slate-200/50 my-1.5 mx-1" />}
              <button
                onClick={() => setNavSection(item.id)}
                className={`w-full px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80 ring-1 ring-slate-900/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                title={item.label}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                      isActive
                        ? 'text-indigo-600'
                        : 'text-slate-400 group-hover:text-slate-700'
                    }`}
                  />
                  <span className="whitespace-nowrap truncate">{item.label}</span>
                </div>

                {isUsage && gatewayBalanceFormatted !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 transition-colors ${
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

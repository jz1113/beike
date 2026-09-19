import { settingsPanelPad } from '@/shared/ui/layoutClasses';

export default function AboutTab() {
  return (
              <div className={`${settingsPanelPad} text-center space-y-4 max-w-md mx-auto my-auto animate-fade-in`}>
                <div className="w-20 h-20 mx-auto flex items-center justify-center">
                  <img 
                    src="/app_logo.png" 
                    alt="贝壳云图" 
                    draggable={false}
                    className="w-full h-full object-contain filter drop-shadow-[0_8px_24px_rgba(239,68,68,0.25)] hover:scale-105 transition-transform duration-300" 
                  />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">贝壳云图</h3>
                </div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  专注电商全场景的 AI 视觉策划与高保真商业生图工作台
                </p>
                <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-center">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 font-bold text-slate-600">v0.0.2</span>
                </div>
              </div>
  );
}

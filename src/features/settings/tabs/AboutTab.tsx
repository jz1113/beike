'use client';

export default function AboutTab() {
  return (
              <div className="p-8 text-center space-y-4 max-w-md mx-auto my-auto animate-fade-in">
                <div className="w-20 h-20 mx-auto flex items-center justify-center">
                  <img 
                    src="/app_logo.png" 
                    alt="贝壳云图" 
                    draggable={false}
                    className="w-full h-full object-contain filter drop-shadow-[0_8px_24px_rgba(239,68,68,0.25)] hover:scale-105 transition-transform duration-300" 
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">贝壳云图</h3>
                  <p className="text-xs font-semibold text-indigo-600">电商商业视觉与智能生图平台</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  基于多模态大模型的电商商业视觉智能策划、真实手机实拍与 4K 高保真生图工作台
                </p>
                <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-600">v1.0.0</span>
                  <span>·</span>
                  <span>APIA / Comfly 驱动</span>
                </div>
              </div>
  );
}

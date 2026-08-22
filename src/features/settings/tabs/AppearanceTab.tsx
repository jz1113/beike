'use client';

export default function AppearanceTab() {
  return (
              <div className="p-6 sm:p-8 space-y-6 max-w-3xl animate-fade-in">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">外观与界面偏好</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    调整控制台主题风格、界面缩放与紧凑度
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">主题模式</div>
                      <div className="text-xs text-slate-500 mt-0.5">选择您喜爱的工作台视觉主题</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                        ☀️ 浅色极简 (默认)
                      </span>
                    </div>
                  </div>

                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">瀑布流卡片密度</div>
                      <div className="text-xs text-slate-500 mt-0.5">首页生图作品与历史记录的间隙紧凑度</div>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                      紧凑无缝 (Ultra Compact)
                    </span>
                  </div>
                </div>
              </div>
  );
}

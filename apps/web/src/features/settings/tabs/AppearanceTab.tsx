import { useEffect, useState } from 'react';
import { settingsPanelPad } from '@/shared/ui/layoutClasses';
import {
  getUiScaleOverride,
  setUiScaleOverride,
  UI_SCALE_OVERRIDE_KEY,
} from '@/shared/hooks/useMediaQuery';
import { usePerformanceMode } from '@/shared/utils/performancePreference';

const SCALE_OPTIONS = [
  { value: 0.85, label: '85% 极简' },
  { value: 0.9, label: '90% 紧凑' },
  { value: 1, label: '100% 标准' },
  { value: 1.1, label: '110% 放大' },
] as const;

export default function AppearanceTab() {
  const [uiScale, setUiScale] = useState(() => getUiScaleOverride());
  const [perfMode, setPerfMode] = usePerformanceMode();

  useEffect(() => {
    const stored = localStorage.getItem(UI_SCALE_OVERRIDE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (Number.isFinite(parsed)) {
        setUiScale(parsed);
      }
    }
  }, []);

  const handleScaleChange = (value: number) => {
    setUiScale(value);
    setUiScaleOverride(value);
  };

  return (
    <div className={`${settingsPanelPad} space-y-6 max-w-3xl animate-fade-in pb-10`}>
      <div>
        <h3 className="text-lg md:text-xl font-bold text-slate-900">外观与界面偏好</h3>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          调整控制台主题风格、界面缩放、动效与首页流光穿梭隧道
        </p>
      </div>

      <div className="space-y-3.5">
        <div className="p-4 sm:p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-bold text-slate-900 text-sm">主题模式</div>
            <div className="text-xs text-slate-500 mt-0.5">选择您喜爱的工作台视觉主题</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs font-semibold text-slate-800 shadow-2xs">
              浅色极简 (默认)
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-bold text-slate-900 text-sm">界面缩放</div>
            <div className="text-xs text-slate-500 mt-0.5">
              在自动窗口密度之上手动微调字号与控件大小
            </div>
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/70 border border-slate-200/60 rounded-xl shadow-2xs">
            {SCALE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleScaleChange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  uiScale === opt.value
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-bold text-slate-900 text-sm">瀑布流卡片密度</div>
            <div className="text-xs text-slate-500 mt-0.5">首页生图作品与历史记录的间隙紧凑度</div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs font-semibold text-slate-800 shadow-2xs">
            紧凑无缝 (Ultra Compact)
          </span>
        </div>

        <div className="p-4 sm:p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
              <span>动效与渲染流畅度</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200/80 rounded-md">
                防掉帧
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              根据您的设备硬件配置调整 3D 物理模拟与 WebGL 着色器能耗
            </div>
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/70 border border-slate-200/60 rounded-xl shadow-2xs">
            {[
              { id: 'eco', label: '极速流畅', desc: '休眠粒子背景，120fps' },
              { id: 'balanced', label: '均衡流畅', desc: '标准动效与适度光影' },
              { id: 'fidelity', label: '极致视效', desc: '全效 3D 粒子与着色器' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPerfMode(item.id as any)}
                title={item.desc}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  perfMode === item.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


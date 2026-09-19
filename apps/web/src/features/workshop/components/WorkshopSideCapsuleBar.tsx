import React from 'react';
import type { WorkshopTab } from '@/types/store';
import { 
  Sparkles, 
  Type, 
  Camera, 
  Package, 
  Settings2 
} from 'lucide-react';
import { useAppStore } from '@/store';

export interface WorkshopSideCapsuleBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  className?: string;
}

interface NavItem {
  id: WorkshopTab;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function WorkshopSideCapsuleBar({
  activeTab,
  onSelectTab,
  className = '',
}: WorkshopSideCapsuleBarProps) {
  const setIsWorkshopConfigOpen = useAppStore((s) => s.setIsWorkshopConfigOpen);

  const navItems: NavItem[] = [
    {
      id: 'studio',
      label: '创作工作台',
      desc: '批量采编与AI流水线',
      icon: Sparkles,
    },
    {
      id: 'prompt_assets',
      label: '提示词资产库',
      desc: '行业高转化爆款提示词',
      icon: Type,
    },
    {
      id: 'recipes',
      label: '类目拍摄架构',
      desc: '珠宝/服饰/数码镜头模版',
      icon: Camera,
    },
    {
      id: 'products',
      label: '商品主体库',
      desc: '已采编入库商品资产',
      icon: Package,
    },
  ];

  return (
    <aside
      aria-label="工作台侧边导航胶囊"
      className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center py-2 px-1.5 rounded-full bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_10px_30px_-4px_rgba(15,23,42,0.08),0_2px_8px_rgba(0,0,0,0.03)] select-none transition-all ${className}`}
    >
      {/* 核心工作台功能导航项 */}
      <div className="flex flex-col items-center gap-1.5">
        {navItems.map((item) => {
          const isSelected = activeTab === item.id;
          const Icon = item.icon;

          return (
            <div key={item.id} className="relative group">
              <button
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-label={item.label}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-90 ${
                  isSelected
                    ? 'bg-slate-900 text-white font-bold shadow-md shadow-slate-900/25'
                    : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100/90'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
              </button>

              {/* 悬停浮动说明气泡 */}
              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-xl text-white opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 flex flex-col whitespace-nowrap">
                <span className="text-xs font-bold leading-tight tracking-wide">{item.label}</span>
                <span className="text-[10px] text-slate-300 font-normal leading-tight mt-0.5">{item.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 分割线 */}
      <div className="w-5 h-[1px] bg-slate-200/90 my-1.5" />

      {/* 辅助工具栏：工坊全局生产预设 */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative group">
          <button
            type="button"
            onClick={() => setIsWorkshopConfigOpen(true)}
            aria-label="工坊生产预设"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100/90 flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-90"
          >
            <Settings2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2]" />
          </button>

          {/* 悬停浮动说明气泡 */}
          <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-xl text-white opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 flex flex-col whitespace-nowrap">
            <span className="text-xs font-bold leading-tight tracking-wide">工坊生产预设</span>
            <span className="text-[10px] text-slate-300 font-normal leading-tight mt-0.5">并发与大模型画幅配置</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

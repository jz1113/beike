'use client';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles, Users, ArrowLeft, ChevronRight } from 'lucide-react';

interface NavbarProps {
  currentView?: 'hub' | 'buyer_show';
  currentStep?: number;
  onBackToHub?: () => void;
  onOpenHistory?: () => void;
  onOpenPromptHistory?: () => void;
  onOpenSettings?: () => void;
  onSelectStep?: (step: number) => void;
  savedCount?: number;
}

export default function Navbar({ 
  currentView = 'hub',
  onBackToHub,
}: NavbarProps) {
  const { 
    workshopMode, 
    setWorkshopMode, 
    generatedPrompts, 
    generationTasks 
  } = useAppStore();

  const promptsCount = generatedPrompts.length;
  const finishedTasksCount = generationTasks.filter(t => t.status === 'SUCCESS' && t.resultUrl).length;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 h-15 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="flex items-center justify-between w-full gap-4">
        
        {/* Left: Breadcrumbs / Studio Navigation & Mode Selector */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {currentView === 'buyer_show' ? (
            <div className="flex items-center gap-3">
              <button
                onClick={onBackToHub}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-[13px] font-bold transition-all cursor-pointer active:scale-95"
                title="返回 AI 造梦展馆"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回展馆</span>
              </button>

              {/* 制作方向切换药丸：爆款复刻 vs 原创生成 */}
              <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-inner">
                <button
                  type="button"
                  onClick={() => setWorkshopMode('social_face_product_swap')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition-all cursor-pointer ${
                    workshopMode === 'social_face_product_swap'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="爆款复刻：复刻社媒构图，换人换品"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>爆款复刻</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWorkshopMode('storyboard_generate')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition-all cursor-pointer ${
                    workshopMode === 'storyboard_generate'
                      ? 'bg-white text-indigo-700 shadow-2xs border border-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="原创生成：基于商品实物图和高颜值桌搭/生活场景，AI 自动规划多机位连续分镜"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>原创生成</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-black text-[#EE2726] tracking-tight text-base sm:text-lg">
                贝壳云图
              </h1>
            </div>
          )}
        </div>

        {/* Center: Hub 公告；工坊步进改由 WorkshopTopBar 独占，避免双步进 */}
        {currentView !== 'buyer_show' && (
          <div className="hidden md:flex items-center gap-2 bg-blue-50/70 hover:bg-blue-50 border border-blue-200/70 px-4 py-1.5 rounded-full text-xs sm:text-[13px] text-blue-900 font-medium transition-colors cursor-pointer group shadow-sm">
            <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-bold font-mono">
              PRO
            </span>
            <span>4 大 AI 核心引擎全量在线 · 4K Ultra-HD 超清生图就绪</span>
            <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}

        {/* Right: 工坊显示轻量进度徽标；Hub 显示引擎状态 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {currentView === 'buyer_show' ? (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
              {promptsCount > 0 && (
                <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                  提示词 {promptsCount}
                </span>
              )}
              {generationTasks.length > 0 && (
                <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                  成图 {finishedTasksCount}/{generationTasks.length}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-[13px] font-bold whitespace-nowrap shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
              <span>4K 引擎就绪</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

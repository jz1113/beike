'use client';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles, Users, CheckCircle2, ArrowLeft, ChevronRight } from 'lucide-react';
import { JdIcon } from '@/components/common/BrandIcons';

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
  currentStep = 1, 
  onBackToHub,
  onOpenHistory, 
  onOpenPromptHistory, 
  onOpenSettings, 
  onSelectStep, 
  savedCount = 0 
}: NavbarProps) {
  const { 
    workshopMode, 
    setWorkshopMode, 
    images, 
    generatedPrompts, 
    generationTasks 
  } = useAppStore();

  const selectedImagesCount = images.filter(img => img.selected).length;
  const promptsCount = generatedPrompts.length;
  const finishedTasksCount = generationTasks.filter(t => t.status === 'SUCCESS' && t.resultUrl).length;

  const steps = [
    { 
      num: 1, 
      label: '素材采编', 
      badge: selectedImagesCount > 0 ? `${selectedImagesCount}张` : null,
      isReady: true 
    },
    { 
      num: 2, 
      label: '视觉策划', 
      badge: promptsCount > 0 ? `${promptsCount}组` : null,
      isReady: selectedImagesCount > 0 
    },
    { 
      num: 3, 
      label: 'AI 矩阵生图', 
      badge: generationTasks.length > 0 ? `${finishedTasksCount}/${generationTasks.length}` : null,
      isReady: promptsCount > 0 
    },
    { 
      num: 4, 
      label: '成套交付', 
      badge: finishedTasksCount > 0 ? `${finishedTasksCount}张` : null,
      isReady: finishedTasksCount > 0 
    },
  ];

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
                      ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="爆款复刻：从小红书/抖音采集爆款图，复刻姿态构图，换模特新人脸并替换为本店商品"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>爆款复刻</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    workshopMode === 'social_face_product_swap' ? 'bg-white/25 text-white' : 'bg-pink-100 text-pink-700'
                  }`}>HOT</span>
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
            <div className="flex items-center gap-2.5">
              <h1 className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                贝壳云图
              </h1>
            </div>
          )}
        </div>

        {/* Center: 公告横幅 (在 Hub 模式) OR 4 步工作流步骤条 (在 Studio 模式) */}
        {currentView === 'buyer_show' ? (
          <nav aria-label="工作流步骤" className="hidden lg:flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/90 shadow-inner">
            {steps.map((s, idx) => {
              const isActive = currentStep === s.num;
              const isCompleted = currentStep > s.num;
              const isClickable = s.isReady || s.num < currentStep;

              return (
                <div key={s.num} className="flex items-center">
                  <button
                    disabled={!isClickable}
                    onClick={() => {
                      if (isClickable) onSelectStep?.(s.num);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-white text-indigo-700 font-bold shadow-sm border border-indigo-200 scale-[1.02] cursor-pointer'
                        : isCompleted
                        ? 'text-emerald-700 hover:text-emerald-900 hover:bg-white/60 cursor-pointer'
                        : isClickable
                        ? 'text-slate-700 hover:text-slate-900 hover:bg-white/60 cursor-pointer'
                        : 'text-slate-400 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold font-mono transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : isCompleted
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.num}
                    </div>
                    <span>{s.label}</span>
                    {s.badge && (
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          : isCompleted
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200/80 text-slate-600'
                      }`}>
                        {s.badge}
                      </span>
                    )}
                  </button>

                  {idx < steps.length - 1 && (
                    <div className={`w-3 h-[1.5px] mx-1 transition-colors ${
                      isCompleted ? 'bg-emerald-400' : 'bg-slate-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </nav>
        ) : (
          /* 顶部公告条 (Top Announcement Ribbon) */
          <div className="hidden md:flex items-center gap-2 bg-blue-50/70 hover:bg-blue-50 border border-blue-200/70 px-4 py-1.5 rounded-full text-xs sm:text-[13px] text-blue-900 font-medium transition-colors cursor-pointer group shadow-sm">
            <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-bold font-mono">
              PRO
            </span>
            <span>4 大 AI 核心引擎全量在线 · 4K Ultra-HD 超清生图就绪</span>
            <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}

        {/* Right: Clean minimal status indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-[13px] font-bold whitespace-nowrap shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
            <span>4K 引擎就绪</span>
          </div>
        </div>
      </div>
    </header>
  );
}

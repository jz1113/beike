'use client';

import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export type WorkshopStepId = 1 | 2 | 3 | 4;

const STEPS: { id: WorkshopStepId; label: string }[] = [
  { id: 1, label: '素材' },
  { id: 2, label: '提示词' },
  { id: 3, label: '生图' },
  { id: 4, label: '导出' },
];

export interface WorkshopPrimaryAction {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

interface Props {
  currentStep: WorkshopStepId;
  /** 已完成且允许回退的最大步骤（含）；未完成的步骤不可跳 */
  maxReachableStep: WorkshopStepId;
  onStepChange: (step: WorkshopStepId) => void;
  primaryAction?: WorkshopPrimaryAction | null;
}

export default function WorkshopTopBar({
  currentStep,
  maxReachableStep,
  onStepChange,
  primaryAction,
}: Props) {
  const { images, clonedSocialImages, workshopMode, generatedPrompts, generationTasks } = useAppStore();
  const selectedSocial = clonedSocialImages.filter((i) => i.selected).length;
  const selectedImages = images.filter((i) => i.selected).length;
  const promptCount = generatedPrompts.length;
  const successCount = generationTasks.filter((t) => t.status === 'SUCCESS' && t.resultUrl).length;

  const badgeFor = (id: WorkshopStepId): string | null => {
    if (id === 1) {
      const n = workshopMode === 'social_face_product_swap' ? selectedSocial : selectedImages;
      return n > 0 ? `${n}` : null;
    }
    if (id === 2) return promptCount > 0 ? `${promptCount}` : null;
    if (id === 3 && generationTasks.length > 0) return `${successCount}/${generationTasks.length}`;
    if (id === 4 && successCount > 0) return `${successCount}`;
    return null;
  };

  return (
    <header className="h-14 flex-shrink-0 px-4 lg:px-5 border-b border-slate-200/80 bg-white flex items-center justify-between gap-3 z-20">
      <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-none" aria-label="种草工坊步骤">
        {STEPS.map((step, idx) => {
          const isActive = currentStep === step.id;
          const isDone = step.id < currentStep;
          const canJump = step.id <= maxReachableStep;
          const badge = badgeFor(step.id);
          return (
            <div key={step.id} className="flex items-center gap-0.5 flex-shrink-0">
              {idx > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 mx-0.5 flex-shrink-0" />
              )}
              <button
                type="button"
                disabled={!canJump}
                onClick={() => canJump && onStepChange(step.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : canJump
                    ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent cursor-pointer'
                    : 'text-slate-300 border border-transparent cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isDone && !isActive ? <Check className="w-3 h-3" /> : step.id}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
                {badge && (
                  <span className={`hidden md:inline px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {primaryAction && (
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled || primaryAction.loading}
          className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
        >
          {primaryAction.loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : null}
          <span>{primaryAction.label}</span>
        </button>
      )}
    </header>
  );
}

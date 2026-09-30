import React, { createContext, useMemo, useRef } from 'react';
import { getGenerationProgress } from '@client/shared/utils/generationProgress';

interface AIGeneratingCardProps {
  task?: {
    id?: string;
    model?: string;
    mediaType?: string;
    size?: string;
    quality?: string;
    videoDuration?: number;
    videoResolution?: string;
    progress?: string;
    prompt?: string;
    referenceImageUrl?: string;
    referenceImages?: string[];
    submissionRecoveryRequired?: boolean;
    failReason?: string;
  };
  progressNumber?: number;
  showProgressBadge?: boolean;
  badgePosition?: 'left' | 'right';
  isVideo?: boolean;
  className?: string;
  embedded?: boolean;
  /** lite=轻量 CSS 动效；premium=高级动效 */
  variant?: 'lite' | 'premium';
}

type PremiumSlotContextValue = {
  claimPremium: (id: string) => boolean;
  releasePremium: (id: string) => void;
};

const PremiumSlotContext = createContext<PremiumSlotContextValue | null>(null);

/** 包裹生成任务列表，限制全局并发动画实例 */
export function GeneratingEffectsProvider({ children }: { children: React.ReactNode }) {
  const activeIdsRef = useRef<Set<string>>(new Set());

  const value = useMemo<PremiumSlotContextValue>(
    () => ({
      claimPremium: (id: string) => {
        if (activeIdsRef.current.has(id)) return true;
        if (activeIdsRef.current.size < 4) {
          activeIdsRef.current.add(id);
          return true;
        }
        return false;
      },
      releasePremium: (id: string) => {
        activeIdsRef.current.delete(id);
      },
    }),
    [],
  );

  return <PremiumSlotContext.Provider value={value}>{children}</PremiumSlotContext.Provider>;
}

/**
 * 🌟 即梦原版浅天蓝水漾柔光生成中卡片（像素级还原即梦原版）
 * 包含：柔和天蓝渐变、呼吸光晕、表面流动扫光、微细进度光条、左上角进度胶囊
 */
function SoftSkyGeneratingCard({
  className = '',
  formattedProgress,
  showProgressBadge = false,
  badgePosition = 'left',
  statusHint,
}: {
  className?: string;
  formattedProgress: string;
  showProgressBadge?: boolean;
  badgePosition?: 'left' | 'right';
  statusHint?: string;
}) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#E6F1FE] via-[#D8E8FD] to-[#EDF4FE] select-none border border-sky-200/60 shadow-2xs ${className}`.trim()}
    >
      {/* 1. 柔和呼吸微光光晕 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-4/5 h-4/5 rounded-full bg-sky-200/50 blur-2xl animate-pulse" />
        <div className="absolute -bottom-1/4 -right-1/4 w-4/5 h-4/5 rounded-full bg-indigo-200/40 blur-2xl animate-pulse [animation-delay:1.2s]" />
      </div>

      {/* 2. 表面白光流动扫光 (Shimmer) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="w-full h-full bg-gradient-to-r from-transparent via-white/35 to-transparent -translate-x-full animate-[shimmerMove_3s_ease-in-out_infinite]" />
      </div>

      {/* 3. 底部极细动态进度光条 */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-sky-200/40 overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-sky-400 to-indigo-400 rounded-full animate-[shimmerMove_2s_ease-in-out_infinite]" />
      </div>

      {/* 4. 根据真实进度展示百分比 */}
      {showProgressBadge && (
        <div className={`absolute top-2.5 ${badgePosition === 'right' ? 'right-2.5' : 'left-2.5'} z-20 px-2 py-0.5 rounded-lg bg-white/80 backdrop-blur-md border border-white/80 shadow-2xs select-none pointer-events-none animate-in fade-in zoom-in-95 duration-150`}>
          <span className="text-slate-800 font-semibold text-[11px] leading-tight font-sans tracking-tight">
            {formattedProgress}
          </span>
        </div>
      )}
      {statusHint && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-lg bg-white/85 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600" role="status">
          {statusHint}
        </div>
      )}
    </div>
  );
}

/**
 * 🌟 AI 生成中卡片入口组件
 */
function AIGeneratingCard({
  task,
  progressNumber,
  showProgressBadge = false,
  badgePosition = 'left',
  className = '',
}: AIGeneratingCardProps) {
  const progress = getGenerationProgress(progressNumber ?? task?.progress);

  return (
    <SoftSkyGeneratingCard
      className={className}
      formattedProgress={progress === undefined ? '' : `${progress}%`}
      showProgressBadge={showProgressBadge && progress !== undefined}
      badgePosition={badgePosition}
      statusHint={task?.submissionRecoveryRequired ? '正在核对原任务，请勿重复提交' : task?.failReason}
    />
  );
}

export default React.memo(AIGeneratingCard);

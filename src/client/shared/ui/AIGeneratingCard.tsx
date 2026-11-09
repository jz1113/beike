import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentHidden, useViewVisibility } from '@client/shared/hooks/useSafeTimeout';
import './aiGeneratingCard.css';

/** Textual stages and counters must not masquerade as a percentage. */
function getGenerationProgress(raw: unknown): number | undefined {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+(?:\.\d+)?\s*%?\s*$/.test(raw) ? Number(raw.replace('%', '').trim()) : NaN;
  return Number.isFinite(value) ? Math.min(99, Math.max(0, Math.round(value))) : undefined;
}

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
  statusText?: string;
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

/** 画布同款黑底粒子扫光；离开可见区域或切到后台时暂停。 */
function CanvasGeneratingCard({
  className = '',
  formattedProgress,
  showProgressBadge = false,
  badgePosition = 'left',
  statusHint,
  embedded,
  statusText,
}: {
  className?: string;
  formattedProgress: string;
  showProgressBadge?: boolean;
  badgePosition?: 'left' | 'right';
  statusHint?: string;
  embedded?: boolean;
  statusText?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const hidden = useDocumentHidden();
  const visible = useViewVisibility();
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={rootRef}
      className={`ai-generating-card${embedded ? ' ai-generating-card--embedded' : ''} ${className}`.trim()}
      data-active={inView && visible && !hidden}
      role="status"
      aria-busy="true"
      aria-label={statusText || '正在生成'}
    >
      <div className="ai-generating-decoration" aria-hidden="true">
        <div className="ai-generating-empty" />
        <div className="ai-generating-shadow-layer-empty" />
        <div className="ai-generating-motion">
          <div className="ai-generating-grid-stars" />
          <div className="ai-generating-grid-sweep" />
          <div className="ai-generating-sweep-glow" />
          <div className="ai-generating-burst" />
          <div className="ai-generating-dither" />
        </div>
      </div>
      {showProgressBadge && (
        <div className={`ai-generating-progress ai-generating-progress--${badgePosition}`}>
          <span>
            {formattedProgress}
          </span>
        </div>
      )}
      {(statusText || statusHint) && (
        <div className="ai-generating-caption">
          {statusText && <span>{statusText}</span>}
          {statusHint && <span>{statusHint}</span>}
        </div>
      )}
    </div>
  );
}

/** 跨功能共用的生成预览。 */
function AIGeneratingCard({
  task,
  progressNumber,
  showProgressBadge = false,
  badgePosition = 'left',
  className = '',
  embedded,
  statusText,
}: AIGeneratingCardProps) {
  const progress = getGenerationProgress(progressNumber ?? task?.progress);

  return (
    <CanvasGeneratingCard
      className={className}
      embedded={embedded}
      statusText={statusText}
      formattedProgress={progress === undefined ? '' : `${progress}%`}
      showProgressBadge={showProgressBadge && progress !== undefined}
      badgePosition={badgePosition}
      statusHint={task?.submissionRecoveryRequired ? '正在核对原任务，请勿重复提交' : task?.failReason}
    />
  );
}

export default React.memo(AIGeneratingCard);

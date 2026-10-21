import { useEffect, useRef, useState } from 'react';
import type { VideoSalesScript } from '@shared/domain/video-sales';
import type { VideoSalesStudioState } from '../model/salesStudioDraft';
import { initialSalesNavigation, navigateSalesWorkspace, restoreSalesNavigation, type SalesWorkflowStep } from '../model/salesWorkspaceView';

export function useSalesNavigation({ state, script, hasResult, isPlanning, isFinalizing, isRendering, updateState }: {
  state: VideoSalesStudioState;
  script?: VideoSalesScript;
  hasResult: boolean;
  isPlanning: boolean;
  isFinalizing: boolean;
  isRendering: boolean;
  updateState: (patch: Partial<VideoSalesStudioState>) => void;
}) {
  const [navigation, setNavigation] = useState(() => restoreSalesNavigation(state.workspaceNavigation, Boolean(script?.shots.length), hasResult));
  const seen = useRef({ isPlanning, isFinalizing, isRendering, scriptId: script?.id, finalizedRevision: script?.finalizedRevision });
  useEffect(() => {
    const previous = seen.current;
    // An old script/prompt may still exist after failure or cancellation.
    if (previous.isPlanning && !isPlanning && script?.id && script.id !== previous.scriptId) setNavigation((current) => navigateSalesWorkspace(current, 'plan'));
    if (previous.isFinalizing && !isFinalizing && script?.finalizedRevision && script.finalizedRevision !== previous.finalizedRevision) setNavigation((current) => navigateSalesWorkspace(current, 'video'));
    if (!previous.isRendering && isRendering) setNavigation((current) => navigateSalesWorkspace(current, 'result'));
    // Keep the pre-operation values until the operation ends, including intermediate commits.
    seen.current = { isPlanning, isFinalizing, isRendering,
      scriptId: isPlanning ? previous.scriptId : script?.id,
      finalizedRevision: isFinalizing ? previous.finalizedRevision : script?.finalizedRevision };
  }, [script?.id, script?.finalizedRevision, isPlanning, isFinalizing, isRendering]);
  useEffect(() => { updateState({ workspaceNavigation: navigation }); }, [navigation, updateState]);
  return {
    ...navigation,
    navigate: (step: SalesWorkflowStep) => setNavigation((previous) => navigateSalesWorkspace(previous, step)),
    resetNavigation: () => setNavigation(initialSalesNavigation(false, false)),
  };
}

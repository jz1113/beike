import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, GenerationTask } from '@client/store';
import { useQuickRefMediaDrop } from '@client/shared/hooks/useQuickRefMediaDrop';
import PromptActionBar from '@client/shared/prompt-bar/PromptActionBar';
import { GenerateTaskFeed } from './components/GenerateTaskFeed';
import {
  groupTasksIntoBatches,
  groupBatchesByDate,
  flattenDateBatches,
} from './model/generateWorkspaceLayout';
import { pageRoot } from '@client/shared/ui/layoutClasses';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';
import { useGenerateFeedHistory } from './hooks/useGenerateFeedHistory';

interface Props {
  onOpenSettings?: () => void;
}

export default function GenerateWorkspace({
  onOpenSettings,
}: Props) {
  void onOpenSettings;
  const {
    sessions,
    currentSessionId,
    previewTask,
  } = useAppStore(
    useShallow((s) => ({
      sessions: s.sessions,
      currentSessionId: s.currentSessionId,
      previewTask: s.previewTask,
    })),
  );

  // 吐司提示状态
  const { setSafeTimeout } = useSafeTimeout();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 2500);
  }, [setSafeTimeout]);

  useEffect(() => {
    const handleStorageError = (event: Event) => {
      const message = (event as CustomEvent<unknown>).detail;
      if (typeof message === 'string') showToast(message);
    };
    window.addEventListener('beike:generation-storage-error', handleStorageError);
    return () => window.removeEventListener('beike:generation-storage-error', handleStorageError);
  }, [showToast]);

  const { dropZoneProps: pageMediaDropProps, toastMsg: dropToastMsg } = useQuickRefMediaDrop();
  const combinedToast = toastMsg || dropToastMsg;

  // 底部吸底提示词控制栏折叠与展开状态（参考画布常态设计）
  const [isDockExpanded, setIsDockExpanded] = useState(false);

  const promptDockRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 动态测量底部 PromptActionBar 高度，避免滚动内容被遮挡
  useEffect(() => {
    const dock = promptDockRef.current;
    const scroll = scrollContainerRef.current;
    if (!dock || !scroll) return;

    const updateDockHeight = () => {
      scroll.style.setProperty('--prompt-dock-h', `${dock.offsetHeight}px`);
      document.documentElement.style.setProperty('--prompt-dock-h', `${dock.offsetHeight}px`);
    };

    updateDockHeight();
    const ro = new ResizeObserver(updateDockHeight);
    ro.observe(dock);
    return () => ro.disconnect();
  }, []);

  const activeSession = sessions.find(s => s.id === currentSessionId);
  const taskList = useMemo(() => {
    const rawTasks = activeSession?.tasks || [];
    const map = new Map<string, GenerationTask>();
    rawTasks.forEach(t => {
      if (t && (t.id || t.taskId)) {
        const key = t.id || t.taskId!;
        if (!map.has(key)) map.set(key, t);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tA - tB;
    });
  }, [activeSession]);

  const taskBatches = useMemo(
    () => groupTasksIntoBatches(taskList),
    [taskList],
  );

  const dateGroupedBatches = useMemo(
    () => groupBatchesByDate(taskBatches),
    [taskBatches],
  );

  const flatBatches = useMemo(
    () => flattenDateBatches(dateGroupedBatches),
    [dateGroupedBatches],
  );

  const { visibleFlatBatches, hasMoreBatches, loadMoreSentinelRef, pinToLatest } = useGenerateFeedHistory(
    flatBatches,
    currentSessionId,
    scrollContainerRef,
  );

  return (
    <div className={`${pageRoot} bg-transparent select-none relative`}>
      {/* 全局浮动操作提示 (Toast) */}
      {combinedToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold shadow-2xl border border-white/10 animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{combinedToast}</span>
        </div>
      )}

        <GenerateTaskFeed
          scrollContainerRef={scrollContainerRef}
          pageMediaDropProps={pageMediaDropProps}
          taskBatches={taskBatches}
          visibleFlatBatches={visibleFlatBatches}
          hasMoreBatches={hasMoreBatches}
          loadMoreSentinelRef={loadMoreSentinelRef}
          onPinToLatest={pinToLatest}
          onShowToast={showToast}
        />

        {/* 🌟 3. 底部吸底提示词控制栏 (画布同款常态折叠与展开：常态 max-w-[560px]，展开 max-w-5xl 2xl:max-w-6xl) */}
        <div ref={promptDockRef} className={`absolute bottom-4 inset-x-4 sm:inset-x-6 ${previewTask ? 'z-55' : 'z-30'} pointer-events-none min-w-0 transition-all duration-300 ease-out`}>
          <div className={`w-full mx-auto pointer-events-auto min-w-0 overflow-visible transition-all duration-300 ease-out ${
            isDockExpanded ? 'max-w-5xl 2xl:max-w-6xl' : 'max-w-[560px] 2xl:max-w-[620px]'
          }`}>
            <PromptActionBar 
              dropdownPlacement="up"
              collapsible={true}
              onExpandChange={setIsDockExpanded}
            />
          </div>
        </div>

    </div>
  );
}

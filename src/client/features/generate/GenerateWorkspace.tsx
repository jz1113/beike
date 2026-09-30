import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, GenerationTask } from '@client/store';
import { useQuickRefMediaDrop } from '@client/shared/hooks/useQuickRefMediaDrop';
import { X } from 'lucide-react';
import PromptActionBar from '@client/shared/prompt-bar';
import { GenerateWorkspaceToolbar } from './components/GenerateWorkspaceToolbar';
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
    createSession,
    switchSession,
    deleteSession,
    deleteAllSessions,
    renameSession,
    previewTask,
  } = useAppStore(
    useShallow((s) => ({
      sessions: s.sessions,
      currentSessionId: s.currentSessionId,
      createSession: s.createSession,
      switchSession: s.switchSession,
      deleteSession: s.deleteSession,
      deleteAllSessions: s.deleteAllSessions,
      renameSession: s.renameSession,
      previewTask: s.previewTask,
    })),
  );

  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'single'; id: string; title: string } | { type: 'all' } | null
  >(null);

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

  const handleRequestDeleteSession = useCallback(
    (id: string, title?: string) => {
      const target = sessions.find((s) => s.id === id);
      const resolvedTitle = title || target?.title || '未命名对话';
      setDeleteTarget({ type: 'single', id, title: resolvedTitle });
    },
    [sessions],
  );

  const handleConfirmDeleteSession = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'all') {
      deleteAllSessions();
      showToast('已删除全部创作对话');
    } else {
      deleteSession(deleteTarget.id);
      showToast(`已删除对话「${deleteTarget.title}」`);
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteSession, deleteAllSessions, showToast]);

  // Buttons own Enter activation, so confirming cannot override a focused Cancel button.
  useEffect(() => {
    if (!deleteTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeleteTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, handleConfirmDeleteSession]);

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

  const activeSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
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

  const { visibleFlatBatches, hasMoreBatches, loadMoreSentinelRef } = useGenerateFeedHistory(
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

      {/* 🌟 顶部工具栏（含即梦同款会话下拉菜单） */}
      <GenerateWorkspaceToolbar
        activeSessionTitle={activeSession?.title}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onCreateSession={createSession}
        onSwitchSession={switchSession}
        onDeleteSession={handleRequestDeleteSession}
        onDeleteAllSessions={() => setDeleteTarget({ type: 'all' })}
        onRenameSession={renameSession}
      />
        <GenerateTaskFeed
          scrollContainerRef={scrollContainerRef}
          pageMediaDropProps={pageMediaDropProps}
          taskBatches={taskBatches}
          visibleFlatBatches={visibleFlatBatches}
          hasMoreBatches={hasMoreBatches}
          loadMoreSentinelRef={loadMoreSentinelRef}
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

      {/* 🌟 4. 居中弹出确认删除对话框（即梦同款设计） */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in select-none"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 max-w-[440px] w-full relative animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 右上角关闭 X */}
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="absolute top-6 right-6 p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="取消 (Esc)"
            >
              <X className="w-4 h-4 stroke-[2.2]" />
            </button>

            {/* 标题 */}
            <h3 className="text-[16px] font-bold text-slate-900 pr-7 truncate">
              {deleteTarget.type === 'all' ? `确认删除全部 ${sessions.length} 个对话` : `确认删除「${deleteTarget.title}」`}
            </h3>

            {/* 说明文案 */}
            <p className="mt-3 text-[13px] text-slate-500 leading-relaxed font-normal">
              {deleteTarget.type === 'all'
                ? '将清空「最近」中的全部创作对话。此操作无法撤回，已生成的内容仍保留在「资产」中。'
                : '此操作无法撤回，删除对话后，仍可在「资产」中找回已生成的内容，确认删除么？'}
            </p>

            {/* 底部按钮栏 */}
            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-5 py-2 rounded-xl bg-[#F2F3F5] hover:bg-[#E5E6EB] text-slate-800 text-[13px] font-medium transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                取消
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteSession}
                className="px-5 py-2 rounded-xl bg-black hover:bg-slate-800 text-white text-[13px] font-medium transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                {deleteTarget.type === 'all' ? '全部删除' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

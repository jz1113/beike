import { useAssistantReasoning } from '@client/shared/hooks/useAssistantReasoning';
import '../assistantWorkspace.css';
import { normalizeReasoningEffort } from '@shared/domain/assistant/reasoning';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type MediaAttachment } from '@client/store';
import { COPY_FEEDBACK_DURATION_MS, useToast } from '@client/shared/hooks/useToast';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import AssistantMessageList from '@client/features/assistant/components/message/AssistantMessageList';
import AssistantInputArea from '@client/features/assistant/components/AssistantInputArea';
import AssistantDrawerHeader from '@client/features/assistant/components/AssistantDrawerHeader';
import BrandKitModal from '@client/features/assistant/components/brand-kit/BrandKitModal';
import {
  DEFAULT_ASSISTANT_MODELS,
  getAssistantSuggestions,
  useAssistantDialog,
} from '@client/features/assistant/model/assistantConstants';
import { useAssistantModels } from '@client/features/assistant/hooks/useAssistantModels';
import { useAssistantMediaUpload } from '@client/features/assistant/hooks/useAssistantMediaUpload';
import { useAssistantChatStream } from '@client/features/assistant/hooks/useAssistantChatStream';
import {
  getCanvasWorkspaceAttachments,
  getCanvasWorkspaceSnapshot,
  useCanvasWorkspaceSelection,
} from '@client/shared/workspace/canvasWorkspace';
import { visibleMarkdownText } from '@client/shared/ui/markdown/visibleMarkdownText';
import { Sparkles, UploadCloud, X } from 'lucide-react';

export interface ChatPreviewState {
  url: string;
  type: 'image' | 'video';
  poster?: string;
}

interface MemoryView {
  enabled: boolean;
  summary: string;
  updatedAt: number;
  coveredCount: number;
  pendingCount: number;
}

function AssistantMemoryPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const dialogRef = useAssistantDialog(true, onClose);
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const url = `/api/assistant/threads/${encodeURIComponent(sessionId)}/memory`;
  useEffect(() => {
    const controller = new AbortController();
    setMemory(null);
    setError('');
    apiFetch(url, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || '读取失败');
        if (!controller.signal.aborted) setMemory(data.memory);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [url]);
  const update = async (body: { enabled?: boolean; clear?: boolean }) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存失败');
      setMemory(data.memory);
      setConfirmClear(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="会话记忆"
        className="flex max-h-[80%] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#18191c]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">会话记忆</h2>
          <button aria-label="关闭会话记忆" onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          仅用于当前会话，重启后保留。超过 30 条待处理消息时，将较早消息增量摘要，保留最近 20 条；较长历史会提前触发。采集时只保存文本，后续对话再整理。摘要会额外调用当前模型。
        </p>
        {error && <p role="alert" className="mb-3 text-sm text-orange-700">{error}</p>}
        {!memory && !error && <p className="text-sm">正在读取记忆…</p>}
        {memory && (
          <>
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={memory.enabled} disabled={busy} onChange={(e) => void update({ enabled: e.target.checked })} />
              自动整理并使用本会话记忆
            </label>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              已摘要 {memory.coveredCount} 条 · 待处理及近期原文 {memory.pendingCount} 条
              {memory.updatedAt ? ` · 更新于 ${new Date(memory.updatedAt).toLocaleString()}` : ''}
            </p>
            <div className="min-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-6 select-text dark:bg-white/5">
              {memory.summary || '尚未形成摘要。对话积累后会自动整理，不需要手动复制历史消息。'}
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              摘要可能遗漏细节，可在对话中纠正。关闭后不再积累或使用记忆，已有摘要保留。
            </p>
            {confirmClear ? (
              <div className="mt-3 text-sm">
                <p>清除摘要和待处理文本，保留聊天记录。清除前的消息不会再次自动记入摘要。</p>
                <div className="mt-2 flex gap-3">
                  <button disabled={busy} onClick={() => void update({ clear: true })} className="text-red-600">
                    确认清除
                  </button>
                  <button disabled={busy} onClick={() => setConfirmClear(false)}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button disabled={busy} onClick={() => setConfirmClear(true)} className="mt-3 self-start text-sm text-slate-500 hover:text-red-600 dark:text-slate-400">
                清除本会话记忆
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AssistantMediaLightbox({
  preview,
  onClose,
  resolveAssistantMediaSrc,
}: {
  preview: ChatPreviewState | null;
  onClose: () => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
}) {
  const dialogRef = useAssistantDialog(Boolean(preview), onClose);
  if (!preview) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in pointer-events-auto"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={preview.type === 'video' ? '视频预览' : '图片预览'}
        tabIndex={-1}
        className="relative max-w-4xl max-h-[90vh] w-full bg-transparent flex flex-col items-center justify-center cursor-default"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {preview.type === 'video' ? (
          <video
            key={preview.url}
            src={resolveAssistantMediaSrc(preview.url, true)}
            poster={preview.poster ? resolveAssistantMediaSrc(preview.poster, false) : undefined}
            controls
            autoPlay
            playsInline
            preload="auto"
            controlsList="nodownload"
            className="max-w-full max-h-[85vh] w-auto rounded-2xl shadow-2xl border border-white/20 bg-black"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            key={preview.url}
            src={resolveAssistantMediaSrc(preview.url, false)}
            alt="图片大图预览"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.hasRetried && preview.url && !/^(data:|blob:)/.test(preview.url)) {
                target.dataset.hasRetried = 'true';
                target.src = proxyMediaUrl(preview.url);
              }
            }}
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20 cursor-zoom-out"
          />
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 px-5 py-2 rounded-full bg-slate-900/90 text-white text-xs font-bold border border-white/10 hover:bg-slate-800 transition-colors shadow-lg cursor-pointer dark:hover:bg-slate-200"
        >
          关闭预览
        </button>
      </div>
    </div>
  );
}

type OutputLanguage = '中文' | 'English' | '双语';
const isOutputLanguage = (value: unknown): value is OutputLanguage => value === '中文' || value === 'English' || value === '双语';

function useAssistantOutputLanguage() {
  const [language, setLanguage] = useState<OutputLanguage>(() => {
    try {
      const saved = localStorage.getItem('beike_assistant_output_lang');
      if (isOutputLanguage(saved)) return saved;
    } catch { /* Storage can be unavailable in restricted browser sessions. */ }
    return '中文';
  });
  useEffect(() => {
    const onChange = (event: Event) => {
      const value = (event as CustomEvent<{ lang?: unknown }>).detail?.lang;
      if (isOutputLanguage(value)) setLanguage(value);
    };
    window.addEventListener('assistant_lang_changed', onChange);
    return () => window.removeEventListener('assistant_lang_changed', onChange);
  }, []);
  return language;
}

function useAssistantNarrowViewport() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

/** Build the small active-workspace context sent with a new assistant turn. */
function buildAssistantWorkspaceSnapshot(currentView: string, productTitle?: string): Record<string, unknown> {
  if (currentView === 'canvas') return getCanvasWorkspaceSnapshot();
  if (currentView === 'workshop') {
    return {
      workspaceType: 'workshop',
      title: productTitle || '电商图文',
      summary: productTitle ? `当前已加载商品「${productTitle}」。` : '当前尚未加载商品。',
    };
  }
  return { workspaceType: ['generate', 'assets', 'home'].includes(currentView) ? currentView : 'other' };
}

interface Props {
  onOpenSettings?: () => void;
}

export { DEFAULT_ASSISTANT_MODELS };

export default function AIAssistantDrawer({ onOpenSettings }: Props) {
  const { activeNodeId: activeCanvasNodeId, activeProject: activeCanvasProject } = useCanvasWorkspaceSelection();
  const {
    isAssistantOpen,
    setIsAssistantOpen,
    assistantSessions,
    currentAssistantSessionId,
    createAssistantSession,
    addAssistantMessage,
    updateAssistantMessage,
    assistantModel,
    setAssistantModel,
    assistantHistoryLimit,
    assistantAttachments,
    assistantInputDraft,
    setAssistantInputDraft,
    addAssistantAttachment,
    removeAssistantAttachment,
    clearAssistantAttachments,
    currentView,
    setCurrentView,
    setProductData,
    getActiveBrandKit,
    product,
    selectedArchId,
    getActiveAssistantSkill,
  } = useAppStore(
    useShallow((s) => ({
      isAssistantOpen: s.isAssistantOpen,
      setIsAssistantOpen: s.setIsAssistantOpen,
      assistantSessions: s.assistantSessions,
      currentAssistantSessionId: s.currentAssistantSessionId,
      createAssistantSession: s.createAssistantSession,
      addAssistantMessage: s.addAssistantMessage,
      updateAssistantMessage: s.updateAssistantMessage,
      assistantModel: s.assistantModel,
      setAssistantModel: s.setAssistantModel,
      assistantHistoryLimit: s.assistantHistoryLimit,
      assistantAttachments: s.assistantAttachments,
      assistantInputDraft: s.assistantInputDraft,
      setAssistantInputDraft: s.setAssistantInputDraft,
      addAssistantAttachment: s.addAssistantAttachment,
      removeAssistantAttachment: s.removeAssistantAttachment,
      clearAssistantAttachments: s.clearAssistantAttachments,
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      setProductData: s.setProductData,
      getActiveBrandKit: s.getActiveBrandKit,
      product: s.product,
      selectedArchId: s.selectedArchId,
      getActiveAssistantSkill: s.getActiveAssistantSkill,
    }))
  );

  const [hasClientMounted, setHasClientMounted] = useState(false);
  useEffect(() => {
    setHasClientMounted(true);
  }, []);

  // 当前会话
  const currentSession = useMemo(() => {
    return (
      assistantSessions.find((s) => s.id === currentAssistantSessionId) ||
      assistantSessions[0] || {
        id: 'default',
        title: '全新对话',
        messages: [],
        createdAt: Date.now(),
        allowedTools: undefined as string[] | undefined,
      }
    );
  }, [assistantSessions, currentAssistantSessionId]);

  const messages = currentSession?.messages || [];

  // 本地 UI 状态
  const [inputContent, setInputContent] = useState(() => useAppStore.getState().assistantInputDraft || '');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [chatPreview, setChatPreview] = useState<ChatPreviewState | null>(null);
  const [isBrandKitModalOpen, setIsBrandKitModalOpen] = useState(false);
  const [isHistoryMenuOpen, setIsHistoryMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [reasoningEffort, handleEffortChange] = useAssistantReasoning(assistantModel);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNarrowViewport = useAssistantNarrowViewport();
  const drawerRef = useAssistantDialog(isAssistantOpen && hasClientMounted, () => {
    if (isExpanded) setIsExpanded(false); else setIsAssistantOpen(false);
  }, { trapFocus: isExpanded || isNarrowViewport, initialFocusSelector: 'textarea[aria-label="消息内容"]' });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { message: toastMsg, show: showToast } = useToast(2600);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // 🌟 草稿单向同步守卫：记录最近一次已同步内容，彻底阻断双向 Effect 引发的高频振荡与死循环
  const lastSyncedDraftRef = useRef(assistantInputDraft || '');

  const handleInputChange = useCallback((val: string) => {
    setInputContent(val);
    lastSyncedDraftRef.current = val;
    if (useAppStore.getState().assistantInputDraft !== val) {
      setAssistantInputDraft(val);
    }
  }, [setAssistantInputDraft]);

  // 当外部导入新草稿（如主页 Agent 模式跳转或画板快捷提问）时，单向同步给本地并更新守卫
  useEffect(() => {
    if (assistantInputDraft !== undefined && assistantInputDraft !== lastSyncedDraftRef.current) {
      lastSyncedDraftRef.current = assistantInputDraft;
      setInputContent(assistantInputDraft);
    }
  }, [assistantInputDraft]);

  const selectedLang = useAssistantOutputLanguage();

  // 1. 模型列表与当前模型管理 Hook
  const {
    availableAssistantModels,
    currentModelObj,
    showModelMenu,
    setShowModelMenu,
    modelMenuRef,
  } = useAssistantModels({
    assistantModel,
    setAssistantModel,
  });

  // 2. 媒体上传与剪贴板处理 Hook
  const {
    fileInputRef,
    handleFiles,
    handlePaste,
    dropZoneProps,
    isDragging,
    isUploading,
  } = useAssistantMediaUpload({
    isAssistantOpen,
    sessionId: currentSession.id,
    addAssistantAttachment,
    showToast,
  });

  // 3. 聊天流式发送与调度 Hook
  const activeBrandKit = getActiveBrandKit();
  // 只在发送时读取精简画布摘要：让助手知道当前项目状态，同时避免把图片 URL、
  // 完整提示词或画布坐标塞入上下文。
  const getWorkspaceSnapshot = useCallback(() => buildAssistantWorkspaceSnapshot(currentView, product?.title),
    [currentView, product?.title]);

  // 仅将“当前选中”的可视节点作为本轮参考附件带入模型；画布里其他素材仍以摘要传递。
  // 这样既能让视觉模型真正看见用户正在讨论的图，也不会把整张画布重复上传。
  const getWorkspaceAttachments = useCallback((): MediaAttachment[] => {
    if (currentView !== 'canvas') return [];
    return getCanvasWorkspaceAttachments();
  }, [currentView]);

  const canvasAssistantContext = useMemo(() => {
    if (currentView !== 'canvas') return undefined;
    if (!activeCanvasProject) return { label: '画布上下文', detail: '当前未打开画布' };
    const selected = activeCanvasProject.nodes.find((node) => node.id === activeCanvasNodeId);
    return {
      label: selected ? '已引用画布选中节点' : '当前画布',
      detail: selected
        ? (selected.title || selected.content || '未命名节点').replace(/\s+/g, ' ').trim().slice(0, 36)
        : `${activeCanvasProject.title} · ${activeCanvasProject.nodes.length} 个可见节点`,
    };
  }, [activeCanvasNodeId, activeCanvasProject, currentView]);

  const {
    sendingSessionId,
    streamingAssistantMsgId,
    livePendingApprovals,
    setLivePendingApprovals,
    isSending,
    isSendingCurrent,
    handleSendMessage,
    handleStopGeneration,
    handleApprovalDecision,
  } = useAssistantChatStream({
    currentSession,
    assistantModel,
    assistantHistoryLimit,
    sessionAllowedTools: currentSession.allowedTools,
    reasoningEffort: normalizeReasoningEffort(assistantModel, reasoningEffort),
    selectedLang,
    assistantAttachments,
    clearAssistantAttachments,
    addAssistantMessage,
    updateAssistantMessage,
    currentView,
    product,
    selectedArchId,
    activeBrandKit,
    getWorkspaceSnapshot,
    getWorkspaceAttachments,
    getActiveAssistantSkill,
    showToast,
  });

  const activeSuggestionChips = useMemo(() => getAssistantSuggestions(currentView, { productTitle: product?.title, attachmentTypes: assistantAttachments.map(attachment => attachment.type) }), [currentView, product?.title, assistantAttachments]);

  const resolveAssistantMediaSrc = useCallback((rawUrl?: string | null, asVideo = false) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('/')) {
      return rawUrl;
    }
    return proxyMediaUrl(rawUrl, asVideo ? { asVideo: true } : undefined);
  }, []);

  const submitDraft = () => {
    if (isSending || isUploading || (!inputContent.trim() && assistantAttachments.length === 0)) return;
    const submittedDraft = inputContent;
    const submittedSessionId = currentSession.id;
    void handleSendMessage(submittedDraft, { onSubmitted: () => {
      const state = useAppStore.getState();
      if (state.currentAssistantSessionId === submittedSessionId && state.assistantInputDraft === submittedDraft) handleInputChange('');
    } });
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!e.repeat) submitDraft();
    }
  };
  useEffect(() => {
    if (isAssistantOpen) return;
    setIsHistoryMenuOpen(false); setIsMemoryOpen(false); setIsBrandKitModalOpen(false); setChatPreview(null); setShowModelMenu(false);
  }, [isAssistantOpen, setShowModelMenu]);

  const handleCopyText = async (content: string, id: string) => {
    try { await navigator.clipboard.writeText(visibleMarkdownText(content));
    setCopiedMsgId(id);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setCopiedMsgId(null);
    }, COPY_FEEDBACK_DURATION_MS);
    } catch { showToast('复制失败，请选中文字手动复制'); }
  };

  if (!hasClientMounted) return null;

  return (
    <div
      className={`agent-shell fixed inset-0 z-50 flex justify-end select-none pointer-events-none ${
        isAssistantOpen ? '' : 'invisible opacity-0'
      }`}
      inert={isAssistantOpen ? undefined : true}

    >
      {isExpanded && <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[3px] pointer-events-auto" onClick={() => setIsExpanded(false)} aria-hidden="true" />}

      {/* 🌟 核心明亮轻奢全站统一侧滑工作台抽屉 */}
      <div
        {...(isAssistantOpen ? dropZoneProps : {})}
        className="agent-panel"
        data-expanded={isExpanded}
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
        aria-modal={isExpanded || isNarrowViewport}
        aria-label="贝壳 Agent 助手"
      >
        {isDragging && <div className="agent-drop-overlay"><UploadCloud size={28} /><strong>松开以添加附件</strong><span>图片、视频或文档</span></div>}
        {/* 🌟 1. 顶部操作栏 */}
        <AssistantDrawerHeader
          sessionTitle={currentSession.title}
          sessionsCount={assistantSessions.length}
          isExpanded={isExpanded}
          onCreateSession={() => {
            if (isSending) handleStopGeneration();
            createAssistantSession();
            handleInputChange('');
            setIsHistoryMenuOpen(false); setIsMemoryOpen(false); setIsBrandKitModalOpen(false); setChatPreview(null); setCopiedMsgId(null);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          isCreatingDisabled={isUploading}
          isHistoryOpen={isHistoryMenuOpen}
          onToggleHistory={() => setIsHistoryMenuOpen(open => !open)}
          onCloseHistory={() => setIsHistoryMenuOpen(false)}
          onOpenMemory={() => setIsMemoryOpen(true)}
          onOpenSettings={onOpenSettings ? () => { setIsAssistantOpen(false); onOpenSettings(); } : undefined}
          isWorking={isSendingCurrent}
          onToggleExpanded={() => setIsExpanded(!isExpanded)}
          onCloseAssistant={() => setIsAssistantOpen(false)}
        />

        {isAssistantOpen && isMemoryOpen && <AssistantMemoryPanel key={currentSession.id} sessionId={currentSession.id} onClose={() => setIsMemoryOpen(false)} />}

        {/* 🌟 2. 消息流列表 */}
        {isAssistantOpen && <AssistantMessageList
          isOpen={isAssistantOpen}
          onUpload={() => fileInputRef.current?.click()}
          sessionId={currentSession.id}
          messages={messages}
          isExpanded={isExpanded}
          activeSuggestionChips={activeSuggestionChips}
          currentSessionMessages={currentSession?.messages || []}
          isSendingCurrent={isSendingCurrent}
          sendingSessionId={sendingSessionId}
          streamingAssistantMsgId={streamingAssistantMsgId}
          livePendingApprovals={livePendingApprovals}
          onApprovalDecision={(approvalId, decision) => {
            void handleApprovalDecision(approvalId, decision, (patch) => {
              if (patch.pendingApprovals) setLivePendingApprovals(patch.pendingApprovals);
            }).catch((error: unknown) => showToast(error instanceof Error ? error.message : '审批提交失败，请重试'));
          }}
          copiedMsgId={copiedMsgId}
          messagesEndRef={messagesEndRef}
          textareaRef={textareaRef}
          setInputContent={handleInputChange}
          resolveAssistantMediaSrc={resolveAssistantMediaSrc}
          handleSendMessage={handleSendMessage}
          handleStopGeneration={handleStopGeneration}
          handleCopyText={handleCopyText}
          showToast={showToast}
          setChatPreview={setChatPreview}
          addAssistantAttachment={addAssistantAttachment}
          setProductData={setProductData}
          setCurrentView={setCurrentView}
          setIsAssistantOpen={setIsAssistantOpen}
        />}

        {/* 🌟 3. 输入交互区 */}
        {isAssistantOpen && <AssistantInputArea
          key={currentSession.id}
          assistantAttachments={assistantAttachments}
          removeAssistantAttachment={removeAssistantAttachment}
          showToast={showToast}
          inputContent={inputContent}
          setInputContent={handleInputChange}
          textareaRef={textareaRef}
          handleKeyDown={handleKeyDown}
          handlePaste={handlePaste}
          handleSendMessage={submitDraft}
          handleStopGeneration={handleStopGeneration}
          isSending={isSending || isUploading}
          isUploading={isUploading}
          isSendingCurrent={isSendingCurrent}
          fileInputRef={fileInputRef}
          handleFiles={handleFiles}
          showModelMenu={showModelMenu}
          setShowModelMenu={setShowModelMenu}
          modelMenuRef={modelMenuRef}
          availableAssistantModels={availableAssistantModels}
          currentModelObj={currentModelObj}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={handleEffortChange}
          assistantModel={assistantModel}
          setAssistantModel={setAssistantModel}
          resolveAssistantMediaSrc={resolveAssistantMediaSrc}
          setChatPreview={setChatPreview}
          onOpenBrandKitModal={() => setIsBrandKitModalOpen(true)}
          addAssistantAttachment={addAssistantAttachment}
          workspaceContext={canvasAssistantContext}
        />}



      </div>

      {/* 🌟 4. 全屏高清附件 Lightbox */}
      <AssistantMediaLightbox
        preview={chatPreview}
        onClose={() => setChatPreview(null)}
        resolveAssistantMediaSrc={resolveAssistantMediaSrc}
      />

      {/* 🌟 5. Brand Kit 品牌资产与专属模特记忆库模态框 */}
      <BrandKitModal
        isOpen={isBrandKitModalOpen}
        onClose={() => setIsBrandKitModalOpen(false)}
        showToast={showToast}
      />

      {/* Toast 提示 */}
      {toastMsg && (
        <div role="status" className="fixed top-8 left-1/2 -translate-x-1/2 z-70 px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-xl animate-fade-in flex items-center gap-2 border border-white/10 pointer-events-none">
          <Sparkles className="w-4 h-4 text-red-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

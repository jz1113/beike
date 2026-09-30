import { buildAssistantWorkspaceSnapshot } from '../utils/assistantWorkspaceContext';
import { useAssistantDialog } from './useAssistantDialog';
import { useAssistantNarrowViewport } from './useAssistantViewport';
import { useAssistantOutputLanguage } from './useAssistantOutputLanguage';
import { getAssistantSuggestions } from '../utils/assistantSuggestions';
import { useAssistantReasoning } from '../hooks/useAssistantReasoning';
import '../assistantWorkspace.css';
import { normalizeReasoningEffort } from '@shared/domain/assistant/reasoning';
import AssistantMemoryPanel from './AssistantMemoryPanel';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type MediaAttachment } from '@client/store';
import { useToast } from '@client/shared/hooks/useToast';
import { COPY_FEEDBACK_DURATION_MS } from '@client/shared/constants/timing';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import AssistantMessageList from '@client/features/assistant/components/AssistantMessageList';
import AssistantInputArea from '@client/features/assistant/components/AssistantInputArea';
import AssistantDrawerHeader from '@client/features/assistant/components/AssistantDrawerHeader';
import AssistantMediaLightbox, { ChatPreviewState } from '@client/features/assistant/components/AssistantMediaLightbox';
import BrandKitModal from '@client/features/assistant/components/BrandKitModal';
import { DEFAULT_ASSISTANT_MODELS } from '@client/features/assistant/utils/assistantConstants';
import { useAssistantModels } from '@client/features/assistant/hooks/useAssistantModels';
import { useAssistantMediaUpload } from '@client/features/assistant/hooks/useAssistantMediaUpload';
import { useAssistantChatStream } from '@client/features/assistant/hooks/useAssistantChatStream';
import {
  getCanvasWorkspaceAttachments,
  useCanvasWorkspaceSelection,
} from '@client/shared/workspace/canvasWorkspace';
import { Sparkles, UploadCloud } from 'lucide-react';

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
    setStep,
    getActiveBrandKit,
    currentStep,
    product,
    selectedArchId,
    workshopMode,
    activeWorkshopTab,
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
      setStep: s.setStep,
      getActiveBrandKit: s.getActiveBrandKit,
      currentStep: s.currentStep,
      product: s.product,
      selectedArchId: s.selectedArchId,
      workshopMode: s.workshopMode,
      activeWorkshopTab: s.activeWorkshopTab,
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

  const [selectedLang] = useAssistantOutputLanguage();

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
  const getWorkspaceSnapshot = useCallback(() => buildAssistantWorkspaceSnapshot(currentView, currentStep, product?.title),
    [currentStep, currentView, product?.title]);

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
      label: selected ? '已引用画布选中节点' : '已读取当前画布',
      detail: selected
        ? (selected.title || selected.content || '未命名节点').replace(/\s+/g, ' ').trim().slice(0, 36)
        : `${activeCanvasProject.title} · ${activeCanvasProject.nodes.length} 个节点`,
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
    currentStep,
    product,
    selectedArchId,
    workshopMode,
    activeWorkshopTab,
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
    try { await navigator.clipboard.writeText(content);
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
          setStep={setStep}
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

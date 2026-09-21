import AssistantMemoryPanel from './AssistantMemoryPanel';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type MediaAttachment } from '@/store';
import { useToast } from '@/shared/hooks/useToast';
import { COPY_FEEDBACK_DURATION_MS } from '@/shared/constants/timing';
import { proxyMediaUrl } from '@/shared/api/apiClient';
import AIAssistantHistoryDrawer from '@/features/assistant/components/AIAssistantHistoryDrawer';
import AssistantMessageList from '@/features/assistant/components/AssistantMessageList';
import AssistantInputArea from '@/features/assistant/components/AssistantInputArea';
import AssistantToolPermissions from '@/features/assistant/components/AssistantToolPermissions';
import AssistantDrawerHeader from '@/features/assistant/components/AssistantDrawerHeader';
import AssistantMediaLightbox, { ChatPreviewState } from '@/features/assistant/components/AssistantMediaLightbox';
import BrandKitModal from '@/features/assistant/components/BrandKitModal';
import { DEFAULT_ASSISTANT_MODELS } from '@/features/assistant/utils/assistantConstants';
import { useAssistantModels } from '@/features/assistant/hooks/useAssistantModels';
import { useAssistantMediaUpload } from '@/features/assistant/hooks/useAssistantMediaUpload';
import { useAssistantChatStream } from '@/features/assistant/hooks/useAssistantChatStream';
import {
  getCanvasWorkspaceAttachments,
  getCanvasWorkspaceSnapshot,
  useCanvasWorkspaceSelection,
} from '@/shared/workspace/canvasWorkspace';
import { Sparkles } from 'lucide-react';

interface Props {
  onOpenSettings?: () => void;
}

export { DEFAULT_ASSISTANT_MODELS };

export default function AIAssistantDrawer({ onOpenSettings }: Props) {
  void onOpenSettings;
  const { activeNodeId: activeCanvasNodeId, activeProject: activeCanvasProject } = useCanvasWorkspaceSelection();
  const {
    isAssistantOpen,
    setIsAssistantOpen,
    assistantSessions,
    currentAssistantSessionId,
    createAssistantSession,
    addAssistantMessage,
    updateAssistantMessage,
    updateAssistantSession,
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
      updateAssistantSession: s.updateAssistantSession,
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
      }
    );
  }, [assistantSessions, currentAssistantSessionId]);

  const messages = currentSession?.messages || [];

  // 本地 UI 状态
  const [inputContent, setInputContent] = useState(() => useAppStore.getState().assistantInputDraft || '');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [chatPreview, setChatPreview] = useState<ChatPreviewState | null>(null);
  const [isBrandKitModalOpen, setIsBrandKitModalOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [sessionAllowedTools, setSessionAllowedTools] = useState<string[] | undefined>(
    currentSession?.allowedTools
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { message: toastMsg, show: showToast } = useToast(2600);

  // 同步 sessionAllowedTools 与当前 session
  useEffect(() => {
    setSessionAllowedTools(currentSession?.allowedTools);
  }, [currentSession?.id, currentSession?.allowedTools]);

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

  // 🌟 当抽屉打开时，自动聚焦输入框
  useEffect(() => {
    if (isAssistantOpen) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isAssistantOpen]);

  // 语言偏好设置
  const [selectedLang, setSelectedLang] = useState<'中文' | 'English' | '双语'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('beike_assistant_output_lang');
      if (saved === 'English' || saved === '双语') return saved;
    }
    return '中文';
  });

  useEffect(() => {
    const handleLangChange = (e: any) => {
      if (e.detail?.lang) {
        setSelectedLang(e.detail.lang);
      }
    };
    window.addEventListener('assistant_lang_changed', handleLangChange);
    return () => window.removeEventListener('assistant_lang_changed', handleLangChange);
  }, []);

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
  } = useAssistantMediaUpload({
    isAssistantOpen,
    addAssistantAttachment,
    showToast,
  });

  // 3. 聊天流式发送与调度 Hook
  const activeBrandKit = getActiveBrandKit();
  // 只在发送时读取精简画布摘要：让助手知道当前项目状态，同时避免把图片 URL、
  // 完整提示词或画布坐标塞入上下文。
  const getWorkspaceSnapshot = useCallback((): Record<string, unknown> => {
    if (currentView === 'canvas') {
      return getCanvasWorkspaceSnapshot();
    }

    if (currentView === 'workshop') {
      return {
        workspaceType: 'workshop',
        title: product?.title || '种草工坊',
        summary: product?.title
          ? `当前已加载商品「${product.title}」，处于工坊第 ${currentStep || 1} 步。`
          : '当前尚未加载商品。',
      };
    }

    return {
      workspaceType: currentView === 'generate' ? 'generate' : currentView === 'assets' ? 'assets' : currentView === 'home' ? 'home' : 'other',
    };
  }, [currentStep, currentView, product?.title]);

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

  // 根据当前所在工作区智能动态感知推荐灵感气泡
  const activeSuggestionChips = useMemo(() => {
    if (currentView === 'workshop') {
      return [
        '🛒 针对当前京东商品分析材质光影并写 4 条爆款生图提示词',
        '💡 如何提升买家秀生活化纪实质感避免AI假图感？',
        '🎬 拆解小红书爆款图集的人像构图与色彩配方',
        '📐 推荐适合这件商品的摄影焦段与自然漫反射打光',
      ];
    }
    if (currentView === 'generate') {
      return [
        '✨ 扩写一段超写实产品棚拍提示词（含相机焦段与反光板打光）',
        '🛍️ 生成适合美妆个护品类的多角度摆拍方案',
        '👗 帮我设计一组韩系简约风穿搭女装场景图',
        '🖼️ 给出 3 组不同视觉风格的同款场景对比方案',
      ];
    }
    if (currentView === 'canvas') {
      return [
        '🎨 针对当前画板给出多镜头视觉分镜与构图建议',
        '💡 如何将画板中的参考素材组合为统一色调风格？',
        '✨ 结合画板当前主体生成一组电商种草提示词',
        '📐 推荐适合当前画板分镜的打光参数与景深控制',
      ];
    }
    return [
      '✨ 针对当前任务推荐一套高转化率视觉方案',
      '💬 帮我润色当前工作区的提示词增加光影细节',
      '🔍 分析当前画面的构图与色调配方',
      '💡 给我 3 个小红书高点击率场景创意灵感',
    ];
  }, [currentView]);

  const resolveAssistantMediaSrc = useCallback((rawUrl?: string | null, asVideo = false) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('/')) {
      return rawUrl;
    }
    return proxyMediaUrl(rawUrl, asVideo ? { asVideo: true } : undefined);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputContent);
      handleInputChange('');
    }
  };

  const handleCopyText = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setCopiedMsgId(null);
    }, COPY_FEEDBACK_DURATION_MS);
  };

  if (!hasClientMounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end select-none pointer-events-none ${
        isAssistantOpen ? '' : 'invisible opacity-0'
      }`}
      aria-hidden={!isAssistantOpen}
    >
      {/* 遮罩背景（宽屏纯视觉淡化，不拦截主界面点击） */}
      <div
        className={`fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity duration-300 pointer-events-none ${
          isExpanded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 🌟 核心明亮轻奢全站统一侧滑工作台抽屉 */}
      <div
        {...(isAssistantOpen ? dropZoneProps : {})}
        className={`relative h-full bg-[#f8f8f7] border-l border-zinc-200/80 shadow-[-16px_0_40px_rgba(0,0,0,0.06)] flex flex-col transition-all duration-300 text-slate-800 pointer-events-auto overflow-hidden ${
          isExpanded
            ? 'w-full max-w-4xl sm:w-[760px] md:w-[840px]'
            : 'w-full sm:w-[440px] md:w-[500px] xl:w-[560px]'
        }`}
      >
        {/* 🌟 1. 顶部操作栏 */}
        <AssistantDrawerHeader
          sessionTitle={currentSession.title}
          sessionsCount={assistantSessions.length}
          isExpanded={isExpanded}
          onCreateSession={() => createAssistantSession()}
          onOpenHistory={() => setIsHistoryDrawerOpen(true)}
          onOpenMemory={() => setIsMemoryOpen(true)}
          onOpenPermissions={() => setIsPermissionsOpen(true)}
          onToggleExpanded={() => setIsExpanded(!isExpanded)}
          onCloseAssistant={() => setIsAssistantOpen(false)}
        />

        {isMemoryOpen && <AssistantMemoryPanel key={currentSession.id} sessionId={currentSession.id} onClose={() => setIsMemoryOpen(false)} />}

        {/* 🌟 2. 消息流列表 */}
        <AssistantMessageList
          isOpen={isAssistantOpen}
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
            });
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
        />

        {/* 🌟 3. 输入交互区 */}
        <AssistantInputArea
          assistantAttachments={assistantAttachments}
          removeAssistantAttachment={removeAssistantAttachment}
          showToast={showToast}
          inputContent={inputContent}
          setInputContent={handleInputChange}
          textareaRef={textareaRef}
          handleKeyDown={handleKeyDown}
          handlePaste={handlePaste}
          handleSendMessage={() => {
            handleSendMessage(inputContent);
            handleInputChange('');
          }}
          handleStopGeneration={handleStopGeneration}
          isSending={isSending}
          isSendingCurrent={isSendingCurrent}
          fileInputRef={fileInputRef}
          handleFiles={handleFiles}
          showModelMenu={showModelMenu}
          setShowModelMenu={setShowModelMenu}
          modelMenuRef={modelMenuRef}
          availableAssistantModels={availableAssistantModels}
          currentModelObj={currentModelObj}
          assistantModel={assistantModel}
          setAssistantModel={setAssistantModel}
          resolveAssistantMediaSrc={resolveAssistantMediaSrc}
          setChatPreview={setChatPreview}
          onOpenBrandKitModal={() => setIsBrandKitModalOpen(true)}
          addAssistantAttachment={addAssistantAttachment}
          workspaceContext={canvasAssistantContext}
        />

        {/* 历史对话记录侧滑抽屉 */}
        <AIAssistantHistoryDrawer
          isOpen={isHistoryDrawerOpen}
          onClose={() => setIsHistoryDrawerOpen(false)}
        />

        {/* 🛡 工具权限白名单面板 */}
        {isPermissionsOpen && (
          <AssistantToolPermissions
            allowedTools={sessionAllowedTools || []}
            allTools={[]}
            onChange={(updated) => {
              setSessionAllowedTools(updated);
              if (updateAssistantSession) {
                updateAssistantSession({
                  ...currentSession,
                  allowedTools: updated,
                });
              }
            }}
            onClose={() => setIsPermissionsOpen(false)}
          />
        )}
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
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-70 px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-xl animate-fade-in flex items-center gap-2 border border-white/10 pointer-events-none">
          <Sparkles className="w-4 h-4 text-red-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

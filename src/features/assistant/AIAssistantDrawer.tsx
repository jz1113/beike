'use client';
import { getGatewayClientOverrides } from '@/lib/gatewayClient';
import {apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { isImageFile, isVideoFile } from '@/lib/mediaUpload';
import { useAppStore, AssistantMessage, MediaAttachment } from '@/store/useAppStore';
import { extractVideoThumbnail, extractVideoFramesFromSrc, fileToDataUrl, isVideoMediaUrl } from '@/lib/mediaHelper';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { recordModelUsage } from '@/lib/usageTracker';
import AIAssistantHistoryDrawer from '@/features/assistant/AIAssistantHistoryDrawer';
import BatchPromptModal, { ParsedShotItem } from '@/features/assistant/BatchPromptModal';
import { extractShotsFromMessage } from '@/features/assistant/assistantShotParser';
import CustomSkillModal from '@/features/assistant/CustomSkillModal';
import AssistantMessageList from '@/features/assistant/AssistantMessageList';
import AssistantInputArea from '@/features/assistant/AssistantInputArea';
import { formatUserError } from '@/lib/upstreamErrors';
import {
  DEFAULT_ASSISTANT_MODELS,
  LEGACY_OFFICE_EXT_RE,
  PLAIN_TEXT_EXT_RE,
  SUPPORTED_DOC_FORMATS,
  isDocumentFile,
  truncateDocText,
} from '@/features/assistant/assistantConstants';
import {
  getEnabledMultimodalModelsFromSettings,
  repairWorkflowModelsInStorage,
  resolveStoredMultimodalModelId,
} from '@/lib/workflowModels';
import {
  X,
  Plus,
  Clock,
  Settings,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Bot,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  AVAILABLE_SKILLS,
  AssistantSkill,
  getCustomSkills,
  saveCustomSkill,
  deleteCustomSkill,
  downloadSkillJson,
  importSkillsFromFileContent,
} from '@/lib/skills/ecommerce-visual-director';

interface Props {
  onOpenSettings?: () => void;
}

export { DEFAULT_ASSISTANT_MODELS };

export default function AIAssistantDrawer({ onOpenSettings }: Props) {
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
    setAssistantHistoryLimit,
    persistAssistantNow,
    hydrateAssistantSessions,
    assistantAttachments,
    assistantInputDraft,
    setAssistantInputDraft,
    addAssistantAttachment,
    removeAssistantAttachment,
    clearAssistantAttachments,
    setQuickPrompt,
    setQuickRefImages,
    setQuickAspectId,
    currentView,
    setCurrentView,
    setProductData,
    setStep
  } = useAppStore();

  // 根据当前所在工作区智能动态感知推荐灵感气泡
  const activeSuggestionChips = useMemo(() => {
    if (currentView === 'buyer_show') {
      return [
        '🛒 针对当前京东商品分析材质光影并规划4套爆款分镜',
        '💡 如何提升买家秀生活化纪实质感避免AI假图感？',
        '🎬 拆解小红书爆款图集的人像构图与色彩配方',
        '📐 推荐适合这件商品的摄影焦段与自然漫反射打光'
      ];
    }
    if (currentView === 'generate') {
      return [
        '⚡ 快速把上面这条提示词优化为大师级摄影参数',
        '🎨 推荐一个高级复古电影质感的胶片色调与打光方案',
        '🔍 如何在生图提示词中增加细腻皮肤肌理与真实毛孔？',
        '🏷️ 生成一段带情绪价值的爆款小红书种草文案'
      ];
    }
    return [
      '📱 帮我规划一组复古胶片风咖啡机买家秀分镜',
      '🔍 分析上传图片中的商品材质与核心光影',
      '🎬 根据上传视频解析镜头运镜与爆款脚本',
      '💡 如何在提示词中避免塑料感并增强真实手机质感？'
    ];
  }, [currentView]);

  // 当前会话
  const currentSession = assistantSessions.find(s => s.id === currentAssistantSessionId) || assistantSessions[0];
  const messages = currentSession?.messages || [];

  const batchAvailableImages = useMemo(() => {
    const imgs: { url: string; label: string }[] = [];
    const seen = new Set<string>();
    const msgs = currentSession?.messages || [];

    msgs.forEach(m => {
      if (m.productWidget) {
        const prodImgs = m.productWidget.allImages || m.productWidget.mainImages || (m.productWidget.picUrl ? [m.productWidget.picUrl] : []);
        prodImgs.forEach((u: string) => {
          if (u && !seen.has(u)) {
            seen.add(u);
            imgs.push({
              url: u,
              label: imgs.length === 0 ? '图1 (主商品/实物)' : (imgs.length === 1 ? '图2 (人物一致性/模特)' : `图${imgs.length + 1}`)
            });
          }
        });
      }
    });

    msgs.forEach(m => {
      (m.attachments || []).forEach(att => {
        if (att.url && !seen.has(att.url) && att.type !== 'document') {
          seen.add(att.url);
          imgs.push({
            url: att.url,
            label: `图${imgs.length + 1}`
          });
        }
      });
    });

    return imgs;
  }, [currentSession?.messages]);

  const [inputContent, setInputContent] = useState('');
  const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);
  const isSending = Boolean(sendingSessionId);
  const isSendingCurrent = sendingSessionId === currentSession?.id;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // 🌟 自动响应外部组件（如全渠道采集）传递的即时提问草稿
  useEffect(() => {
    if (assistantInputDraft) {
      setInputContent(assistantInputDraft);
      setAssistantInputDraft('');
    }
  }, [assistantInputDraft, setAssistantInputDraft]);

  // Skill 技能选择相关状态 (纯净模式 / 指定技能 / 用户自定义 Skill)
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<AssistantSkill | null>(null);
  const [customSkills, setCustomSkills] = useState<AssistantSkill[]>([]);
  const [isCustomSkillModalOpen, setIsCustomSkillModalOpen] = useState(false);
  const [editingCustomSkill, setEditingCustomSkill] = useState<AssistantSkill | null>(null);
  const [distillContext, setDistillContext] = useState<string | undefined>(undefined);

  useEffect(() => {
    const loaded = getCustomSkills();
    setCustomSkills(loaded);
    // 如果当前选中的 skill 不在自定义或可用列表中，自动清空恢复纯净模式
    if (selectedSkill && !loaded.some(s => s.id === selectedSkill.id) && !AVAILABLE_SKILLS.some(s => s.id === selectedSkill.id)) {
      setSelectedSkill(null);
    }
  }, [selectedSkill]);

  const handleSaveCustomSkill = (skill: AssistantSkill) => {
    const updated = saveCustomSkill(skill);
    setCustomSkills(updated);
    setSelectedSkill(skill);
    showToast(`✨ 已保存并启用 Skill: ${skill.name}`);
  };

  const handleDeleteCustomSkill = (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation();
    const updated = deleteCustomSkill(skillId);
    setCustomSkills(updated);
    if (selectedSkill?.id === skillId) {
      setSelectedSkill(null);
    }
    showToast('🗑️ 已删除该自定义 Skill');
  };

  const handleEditCustomSkill = (e: React.MouseEvent, skill: AssistantSkill) => {
    e.stopPropagation();
    setEditingCustomSkill(skill);
    setDistillContext(undefined);
    setIsCustomSkillModalOpen(true);
    setShowSkillMenu(false);
  };

  const handleExportCustomSkill = (e: React.MouseEvent, skill: AssistantSkill) => {
    e.stopPropagation();
    try {
      downloadSkillJson(skill);
      showToast(`⬇️ 已导出 Skill: ${skill.name}`);
    } catch {
      showToast('❌ 导出失败');
    }
  };

  const handleImportSkillsFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const text = await file.text();
      const result = importSkillsFromFileContent(text, file.name);
      if (result.error || result.imported === 0) {
        showToast(`❌ ${result.error || '未导入任何 Skill'}`);
        return;
      }
      setCustomSkills(result.skills);
      showToast(`✨ 已导入 ${result.imported} 个 Skill`);
      setShowSkillMenu(true);
    } catch (err: any) {
      showToast(`❌ ${formatUserError(err, '导入失败')}`);
    } finally {
      if (skillImportInputRef.current) skillImportInputRef.current.value = '';
    }
  };

  const handleDistillFromCurrentChat = () => {
    if (!currentSession || currentSession.messages.length === 0) {
      showToast('⚠️ 当前会话暂无对话内容，无法提炼');
      return;
    }
    const userAssistantPairs = currentSession.messages
      .slice(-10)
      .map(m => `${m.role === 'user' ? '用户需求与调优指令' : 'AI生成与方案规范'}:\n${m.content}`)
      .join('\n\n---\n\n');
    setEditingCustomSkill(null);
    setDistillContext(userAssistantPairs);
    setIsCustomSkillModalOpen(true);
    setShowSkillMenu(false);
  };

  // 下拉菜单显隐
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showHistoryLimitMenu, setShowHistoryLimitMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const [selectedLang, setSelectedLang] = useState(() => {
    if (typeof window === 'undefined') return '中字';
    try {
      const saved = localStorage.getItem('ai_assistant_output_lang');
      if (saved === '中字' || saved === 'English' || saved === '双语') return saved;
    } catch {}
    return '中字';
  });

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [chatPreview, setChatPreview] = useState<{
    url: string;
    type: 'image' | 'video';
    poster?: string;
  } | null>(null);

  const resolveAssistantMediaSrc = (rawUrl?: string | null, asVideo = false) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('/')) return rawUrl;
    if (asVideo || isVideoMediaUrl(rawUrl)) {
      return proxyMediaUrl(rawUrl);
    }
    if (/xhscdn\.com|xiaohongshu\.com|douyinpic|byteimg|snssdk|kuaishou|yximgs|kwai/i.test(rawUrl)) {
      return proxyMediaUrl(rawUrl);
    }
    return rawUrl;
  };

  // 批量生图工作台状态
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [activeBatchShots, setActiveBatchShots] = useState<ParsedShotItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const skillImportInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // 全局点击空白处关闭所有下拉菜单
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false);
      }
      if (showSkillMenu && skillMenuRef.current && !skillMenuRef.current.contains(target)) {
        setShowSkillMenu(false);
      }
      if (showHistoryLimitMenu && historyMenuRef.current && !historyMenuRef.current.contains(target)) {
        setShowHistoryLimitMenu(false);
      }
      if (showLangMenu && langMenuRef.current && !langMenuRef.current.contains(target)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [showModelMenu, showSkillMenu, showHistoryLimitMenu, showLangMenu]);

  // 防重复粘贴时间戳锁
  const lastPasteTimestampRef = useRef<number>(0);

  // 动态加载已接入模型列表
  const [availableAssistantModels, setAvailableAssistantModels] = useState<any[]>(DEFAULT_ASSISTANT_MODELS);
  const [hasClientMounted, setHasClientMounted] = useState(false);

  useEffect(() => {
    setHasClientMounted(true);
  }, []);

  // 从服务端 + localStorage 安全恢复会话（禁止空默认覆盖）
  useEffect(() => {
    void hydrateAssistantSessions();
    try {
      const savedLimit = localStorage.getItem('ai_assistant_history_limit');
      if (savedLimit) {
        const n = Number(savedLimit);
        if (!Number.isNaN(n) && n > 0) setAssistantHistoryLimit(n);
      }
    } catch {}
  }, [hydrateAssistantSessions, setAssistantHistoryLimit]);

  // 崩溃前最后窗口：页面隐藏 / 关闭时强制 flush
  useEffect(() => {
    const flush = () => {
      try {
        useAppStore.getState().persistAssistantNow();
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const loadCustomAssistantModels = () => {
      repairWorkflowModelsInStorage();

      let modelsList: any[] = DEFAULT_ASSISTANT_MODELS;
      const multimodalFromSettings = getEnabledMultimodalModelsFromSettings();
      if (multimodalFromSettings.length > 0) {
        modelsList = multimodalFromSettings.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          shortName: m.shortName || (m.name || m.id).split(' ')[0],
          badge: m.badge,
          provider: m.provider || 'Official',
        }));
      }

      setAvailableAssistantModels(modelsList);

      const resolvedModel = resolveStoredMultimodalModelId(multimodalFromSettings);
      setAssistantModel(resolvedModel);
    };

    loadCustomAssistantModels();
    window.addEventListener('models_updated', loadCustomAssistantModels);
    return () => window.removeEventListener('models_updated', loadCustomAssistantModels);
  }, [setAssistantModel]);

  // 当前模型对象
  const currentModelObj = availableAssistantModels.find(m => m.id === assistantModel) || availableAssistantModels[0] || { name: assistantModel, shortName: assistantModel };

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAssistantOpen) {
      scrollToBottom();
    }
  }, [messages.length, isAssistantOpen]);

  // 上传文件处理 (图片 + 视频 + 文档)
  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (LEGACY_OFFICE_EXT_RE.test(file.name)) {
        showToast(`⚠️ ${file.name}: 请另存为 .docx / .pptx 后再上传`);
        continue;
      }
      if (isImageFile(file)) {
        const url = await fileToDataUrl(file);
        addAssistantAttachment({
          type: 'image',
          url,
          name: file.name,
          size: file.size,
          mime: file.type || undefined,
        });
      } else if (isVideoFile(file)) {
        const thumb = await extractVideoThumbnail(file);
        const url = URL.createObjectURL(file);
        addAssistantAttachment({
          type: 'video',
          url,
          thumbnailUrl: thumb || undefined,
          name: file.name,
          size: file.size,
          mime: file.type,
        });
      } else if (isDocumentFile(file)) {
        try {
          let extractedText = '';
          let truncated = false;
          const lower = file.name.toLowerCase();

          if (PLAIN_TEXT_EXT_RE.test(lower) || file.type.startsWith('text/') || file.type === 'application/json') {
            const raw = await file.text();
            const t = truncateDocText(raw);
            extractedText = t.text;
            truncated = t.truncated;
          } else {
            const form = new FormData();
            form.append('file', file);
            const res = await apiFetch('/api/assistant/extract-document', { method: 'POST', body: form });
            const data = await res.json();
            if (!data.success || !data.text) {
              showToast(`❌ ${file.name}: ${data.error || '文档解析失败'}`);
              continue;
            }
            extractedText = data.text;
            truncated = Boolean(data.truncated);
          }

          if (!extractedText.trim()) {
            showToast(`❌ ${file.name}: 未能提取到可读文本`);
            continue;
          }

          addAssistantAttachment({
            type: 'document',
            url: '',
            name: file.name,
            size: file.size,
            mime: file.type || undefined,
            extractedText,
          });
          showToast(truncated ? `📄 已挂载 ${file.name}（文本已截断）` : `📄 已挂载文档 ${file.name}`);
        } catch (err: any) {
          showToast(`❌ ${file.name}: ${formatUserError(err, '文档上传失败')}`);
        }
      } else {
        showToast(`⚠️ 暂不支持「${file.name}」。文档请用：${SUPPORTED_DOC_FORMATS}`);
      }
    }
  };

  const ingestAssistantFiles = useCallback(
    (files: File[]) => {
      void handleFiles(files);
    },
    [handleFiles],
  );

  const { dropZoneProps } = useFileDropZone({
    onFiles: ingestAssistantFiles,
    disabled: !isAssistantOpen,
  });

  // 🌟 剪贴板粘贴上传处理 (支持 Ctrl+V / Cmd+V 粘贴截图与图片文件，严格防冒泡与防重复)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const now = Date.now();
    // 400ms 内防事件重复触发
    if (now - lastPasteTimestampRef.current < 400) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    const imageFiles: File[] = [];
    const seenSignatures = new Set<string>();

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const sig = `${file.name}-${file.size}-${file.type}`;
            if (!seenSignatures.has(sig)) {
              seenSignatures.add(sig);
              imageFiles.push(file);
            }
          }
        }
      }
    }

    // 仅在 items 无法提取到图片时，才回退扫描 files（防止 items 与 files 重复添加）
    if (imageFiles.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          const sig = `${file.name}-${file.size}-${file.type}`;
          if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            imageFiles.push(file);
          }
        }
      }
    }

    if (imageFiles.length > 0) {
      lastPasteTimestampRef.current = now;
      e.preventDefault();
      e.stopPropagation();
      await handleFiles(imageFiles);
      showToast(`🖼️ 已从剪贴板粘贴 ${imageFiles.length} 张图片！`);
    }
  };

  // 🚀 流式请求中断控制器 (支持「⏹ 停止生成」按钮)
  const abortControllerRef = useRef<AbortController | null>(null);

  // 发送消息 (SSE 流式逐字输出)
  // options.retryAssistantId: 针对失败气泡重试，复用上一条用户消息，不重复追加
  const handleSendMessage = async (
    textToSend?: string,
    options?: { retryAssistantId?: string }
  ) => {
    const retryAssistantId = options?.retryAssistantId;
    let retryUserMsg: AssistantMessage | undefined;

    if (retryAssistantId) {
      const sess = useAppStore.getState().assistantSessions.find(s => s.id === currentSession.id);
      const msgs = sess?.messages || [];
      const failIdx = msgs.findIndex(m => m.id === retryAssistantId);
      if (failIdx < 0) return;
      retryUserMsg = [...msgs.slice(0, failIdx)].reverse().find(m => m.role === 'user');
      if (!retryUserMsg) {
        showToast('找不到可重试的用户消息');
        return;
      }
    }

    let text = retryUserMsg
      ? (retryUserMsg.content || '').trim()
      : (textToSend !== undefined ? textToSend : inputContent).trim();
    if (!retryUserMsg && !text && assistantAttachments.length === 0) return;
    if (retryUserMsg && !text && !(retryUserMsg.attachments?.length)) return;
    // 同一会话禁止并发发送；其他会话可查看历史，全局仍只允许一路流
    if (sendingSessionId) return;

    // 绑定发送时会话，避免中途切换导致串台
    const sessionId = currentSession.id;

    const attachmentsToSend = retryUserMsg
      ? [...(retryUserMsg.attachments || [])]
      : [...assistantAttachments];
    if (!text && attachmentsToSend.some(a => a.type === 'document')) {
      text = '请阅读附件文档，总结核心要点，并提取可执行建议。';
    } else if (!text && attachmentsToSend.length > 0) {
      text = '请分析附带的素材。';
    }

    let userMsg: AssistantMessage;
    let assistantMsgId: string;

    if (retryAssistantId && retryUserMsg) {
      userMsg = { ...retryUserMsg, content: text || retryUserMsg.content };
      assistantMsgId = retryAssistantId;
      updateAssistantMessage(sessionId, assistantMsgId, {
        content: '',
        error: false,
        modelUsed: undefined,
        toolActivity: undefined,
        productWidget: undefined,
        timestamp: Date.now(),
      });
    } else {
      // 构建并追加用户消息
      userMsg = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: text,
        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        timestamp: Date.now()
      };

      addAssistantMessage(sessionId, userMsg);
      setInputContent('');
      clearAssistantAttachments();

      assistantMsgId = `msg-${Date.now()}-asst`;
      const placeholderMsg: AssistantMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      };
      addAssistantMessage(sessionId, placeholderMsg);
    }

    setSendingSessionId(sessionId);

    // 创建 AbortController 以支持取消
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const { customBaseUrl: localUrl } = getGatewayClientOverrides();

      /** 视频抽帧；文档带 extractedText；图片原样 */
      const expandAttachmentsForApi = async (
        atts: MediaAttachment[] | undefined,
        isLatestUser: boolean
      ): Promise<Array<{ type: string; url?: string; name?: string; extractedText?: string }>> => {
        if (!atts || atts.length === 0) return [];
        if (!isLatestUser) {
          return atts
            .map(a => ({
              type: a.type,
              url: a.type === 'document' ? undefined : (a.thumbnailUrl || a.url),
              name: a.name,
            }))
            .filter(a => a.type === 'document' || Boolean(a.url));
        }

        const out: Array<{ type: string; url?: string; name?: string; extractedText?: string }> = [];
        for (const a of atts) {
          if (a.type === 'document') {
            if (a.extractedText) {
              out.push({
                type: 'document',
                name: a.name || '文档',
                extractedText: a.extractedText,
              });
            }
            continue;
          }

          if (a.type !== 'video') {
            if (a.url) out.push({ type: 'image', url: a.url, name: a.name });
            continue;
          }

          const proxySrc = a.url.startsWith('data:') || a.url.startsWith('blob:') || a.url.startsWith('/')
            ? a.url
            : proxyMediaUrl(a.url);

          let frames: string[] = [];
          try {
            frames = await extractVideoFramesFromSrc(proxySrc, 6);
          } catch {
            frames = [];
          }

          if (frames.length > 0) {
            frames.forEach((f, i) => {
              out.push({ type: 'image', url: f, name: `视频帧${i + 1}` });
            });
          } else if (a.thumbnailUrl) {
            out.push({ type: 'image', url: a.thumbnailUrl, name: a.name || '视频封面' });
          } else if (a.url && !isVideoMediaUrl(a.url)) {
            out.push({ type: 'image', url: a.url, name: a.name || '视频封面' });
          }
        }
        return out.filter(x => x.type === 'document' ? Boolean(x.extractedText) : Boolean(x.url));
      };

      const latestUserId = userMsg.id;
      // 重试时：取到该用户消息为止（不含失败助手气泡）；正常发送：历史 + 新用户消息
      const sessMsgs =
        useAppStore.getState().assistantSessions.find(s => s.id === sessionId)?.messages || messages;
      const thread = retryAssistantId
        ? (() => {
            const uIdx = sessMsgs.findIndex(m => m.id === userMsg.id);
            return uIdx >= 0 ? sessMsgs.slice(0, uIdx + 1) : [...sessMsgs.filter(m => m.id !== retryAssistantId), userMsg];
          })()
        : [...messages, userMsg];
      const allMsgs = await Promise.all(
        thread.map(async (m) => {
          const isLatestUser = m.id === latestUserId && m.role === 'user';
          const expanded = await expandAttachmentsForApi(m.attachments, isLatestUser);
          let content = m.content || '';
          if (isLatestUser && m.attachments?.some(a => a.type === 'video')) {
            const frameHint = expanded.some(a => (a.name || '').startsWith('视频帧'))
              ? '\n【系统：本轮含原视频，已均匀抽取多帧画面供视觉分析，请结合镜头节奏与产品动态作答】'
              : '\n【系统：本轮含原视频，抽帧失败，请结合封面/用户描述尽量分析】';
            content = `${content}${frameHint}`;
          }
          if (isLatestUser && m.attachments?.some(a => a.type === 'document')) {
            content = `${content}\n【系统：本轮含文档附件，正文已抽取为文本注入，请仔细阅读文档内容后作答】`;
          }
          return {
            role: m.role,
            content,
            attachments: expanded.length > 0 ? expanded : undefined
          };
        })
      );

      const adaptiveSystemPrompt = selectedSkill ? `
${selectedSkill.systemPrompt}

【🚨 智能自适应向导执行流规范】：
1. 【完整物料全量输入】：若用户直接发送了商品图与核心诉求/卖点，请立即全自动执行完整 SOP，输出全套结构化分镜提示词（#### 📸 第1张: [标题] ... > [按当前输出语言规则书写的生图提示词]）；
2. 【仅提供部分素材（如只发了图但未提要求）】：默认按照本技能的最佳实践标准机位进行规划，并友好告知用户所选用的机位逻辑；
3. 【用户询问如何使用或打招呼】：用亲切专业的语气向用户展示所需物料清单（① 上传主商品底图 ② 描述卖点 ③ 生成张数），并引导用户直接开始。
` : undefined;

      const langInstruction =
        selectedLang === 'English'
          ? '\n\n【输出语言】Please reply entirely in English. Storyboard titles and image-generation prompts (```prompt blocks and `>` prompt lines) must also be in English. Keep flags like --ar unchanged.'
          : selectedLang === '双语'
            ? '\n\n【输出语言】请使用中英双语对照输出说明文字（中文为主）。每条生图提示词必须先给出完整的简体中文正文（禁止只用英文主稿）；可在中文段落后另起一行以 EN: 附英文对照。复制/去生图以中文段为准。画面内需显示的外文可放在中文引号内；--ar 等参数保留。'
            : '\n\n【输出语言】请使用简体中文回复。分镜标题、说明，以及 ```prompt 代码块与 `>` 引用行中的生图提示词正文必须全部使用简体中文；禁止输出整段英文生图提示词。画面内需要显示的外文品牌/型号可保留在中文引号内；--ar、--v、--style 等参数保留原文。';

      const res = await apiFetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMsgs,
          model: assistantModel,
          fallbackModels: availableAssistantModels.map((m: any) => m.id).filter(Boolean),
          historyLimit: assistantHistoryLimit,
          customBaseUrl: localUrl,
          systemPrompt: (adaptiveSystemPrompt || '') + langInstruction,
          skillId: selectedSkill ? selectedSkill.id : undefined,
          enableAgentTools: true,
          language: selectedLang
        }),
        signal: abortCtrl.signal
      });

      // 兼容处理：如果后端返回的不是 SSE 流 (例如 JSON 错误响应)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'AI 助手服务响应异常');
        }
        // 非流式兜底：直接设置完整内容
        updateAssistantMessage(sessionId, assistantMsgId, {
          content: data.reply || '抱歉，暂时未能解析出内容。',
          modelUsed: data.modelUsed || assistantModel,
          productWidget: data.productWidget || undefined,
          error: false,
        });
        useAppStore.getState().persistAssistantNow();
        return;
      }

      // 🚀 SSE 流式消费：逐 chunk 实时渲染
      if (!res.body) throw new Error('未获取到流式响应体');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let modelUsed = assistantModel;
      let productWidget: any = undefined;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const evt = JSON.parse(trimmed.slice(6));

            if (evt.type === 'meta') {
              modelUsed = evt.modelUsed || assistantModel;
              productWidget = evt.productWidget;
              if (evt.modelSwitched && modelUsed && modelUsed !== assistantModel) {
                showToast(`主模型不可用，已改用「${modelUsed}」`);
              }
              if (productWidget) {
                updateAssistantMessage(sessionId, assistantMsgId, { productWidget, modelUsed, streamingStatus: undefined });
              } else if (modelUsed) {
                updateAssistantMessage(sessionId, assistantMsgId, { modelUsed, streamingStatus: undefined });
              }
            } else if (evt.type === 'status' && evt.message) {
              updateAssistantMessage(sessionId, assistantMsgId, { streamingStatus: String(evt.message) });
            } else if (evt.type === 'tool_call' || evt.type === 'tool_result') {
              const prev = useAppStore.getState().assistantSessions
                .find(s => s.id === sessionId)
                ?.messages.find(m => m.id === assistantMsgId)
                ?.toolActivity || [];
              const next = [...prev];
              const idx = next.findIndex(t => t.name === evt.name && t.status === 'running');
              const entry = {
                name: evt.name,
                displayName: evt.displayName || evt.name,
                status: (evt.status === 'error' ? 'error' : evt.status === 'done' ? 'done' : 'running') as 'running' | 'done' | 'error',
                detail: evt.detail,
              };
              if (evt.type === 'tool_result' && idx >= 0) {
                next[idx] = entry;
              } else if (evt.type === 'tool_call') {
                next.push(entry);
              } else {
                next.push(entry);
              }
              updateAssistantMessage(sessionId, assistantMsgId, { toolActivity: next });
            } else if (evt.type === 'delta' && evt.content) {
              accumulated += evt.content;
              updateAssistantMessage(sessionId, assistantMsgId, {
                content: accumulated,
                modelUsed,
                error: false,
                streamingStatus: undefined,
              });
            } else if (evt.type === 'thinking' && evt.content) {
              // 思考过程暂不展示，可后续扩展折叠展示
            } else if (evt.type === 'error') {
              throw new Error(evt.error || '流式传输异常');
            } else if (evt.type === 'done') {
              // 流结束
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }

      // 流结束后最终更新
      updateAssistantMessage(sessionId, assistantMsgId, {
        content: accumulated || '抱歉，暂时未能解析出内容。',
        modelUsed,
        productWidget,
        streamingStatus: undefined,
      });

      // 🌟 记录模型用量
      const promptChars = allMsgs.reduce((acc, m) => acc + (m.content?.length || 0), 0);
      const replyChars = accumulated.length;
      const estPromptTokens = Math.max(50, Math.round(promptChars / 2.5));
      const estCompletionTokens = Math.max(30, Math.round(replyChars / 2.5));
      const usedModelId = modelUsed;

      let provider = 'OpenAI';
      if (usedModelId.includes('gemini')) provider = 'Google';
      else if (usedModelId.includes('claude')) provider = 'Anthropic';
      else if (usedModelId.includes('deepseek')) provider = '深度求索';
      else if (usedModelId.includes('qwen') || usedModelId.includes('doubao')) provider = '字节火山';

      recordModelUsage({
        modelId: usedModelId,
        modelName: usedModelId,
        provider,
        type: 'chat',
        promptTokens: estPromptTokens,
        completionTokens: estCompletionTokens,
        totalTokens: estPromptTokens + estCompletionTokens,
        success: true
      });

      // 流式完成后统一持久化（瘦身 + localStorage + 服务端）
      useAppStore.getState().persistAssistantNow();

    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动取消
        updateAssistantMessage(sessionId, assistantMsgId, {
          content: (useAppStore.getState().assistantSessions
            .find(s => s.id === sessionId)?.messages
            .find(m => m.id === assistantMsgId)?.content || '') + '\n\n⏹ *用户已停止生成*'
        });
      } else {
        updateAssistantMessage(sessionId, assistantMsgId, {
          content: `⚠️ 请求失败: ${formatUserError(err, '网络连接超时，请检查网络或 API Key 设置。')}`,
          error: true,
        });
      }
      useAppStore.getState().persistAssistantNow();
    } finally {
      setSendingSessionId(null);
      abortControllerRef.current = null;
    }
  };

  // 停止生成
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyText = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // 单张提示词快速填入并跳转去生图
  const handleUseSinglePrompt = (promptText: string, aspectRatio?: string) => {
    setQuickPrompt(promptText);
    if (aspectRatio) {
      setQuickAspectId(aspectRatio);
    }
    const allAtts = currentSession.messages.flatMap(m => m.attachments || []);
    if (allAtts.length > 0) {
      const uniqueAttUrls = Array.from(new Set(allAtts.map(a => a.url).filter(Boolean)));
      setQuickRefImages(uniqueAttUrls.slice(0, 3));
    }
    setCurrentView('generate');
    setIsAssistantOpen(false);
    showToast('🎨 提示词与参考图已载入工作台！');
  };

  // 关闭时保持挂载（尤其流式发送中），用 CSS 隐藏，避免 AbortController / 停止按钮丢失
  // 首屏未挂载前不输出 DOM，避免模型图标 SSR/CSR 水合不一致
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
        className={`relative h-full bg-white/95 backdrop-blur-2xl border-l border-slate-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.06)] flex flex-col transition-all duration-300 text-slate-800 pointer-events-auto ${
          isExpanded ? 'w-full max-w-4xl sm:w-[840px] md:w-[920px]' : 'w-full sm:w-[580px] md:w-[640px]'
        }`}
      >
        {/* 🌟 1. 顶部操作栏 (Header) */}
        <div className="h-14 px-4 sm:px-5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide truncate max-w-[120px] sm:max-w-[160px]">
              {currentSession.title}
            </h3>
            {/* 动态 Skill 状态标签 */}
            {selectedSkill ? (
              <button 
                type="button"
                onClick={() => setShowSkillMenu(true)}
                className="hidden sm:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold tracking-tight shadow-2xs cursor-pointer hover:bg-red-100 transition-colors"
                title={`当前激活技能: ${selectedSkill.name}\n点击可切换或关闭`}
              >
                <Sparkles className="w-2.5 h-2.5 text-red-500" />
                <span className="truncate max-w-[120px]">{selectedSkill.name.split('·')[0]}</span>
                <ChevronDown className="w-2 h-2 opacity-60" />
              </button>
            ) : (
              <button 
                type="button"
                onClick={() => setShowSkillMenu(true)}
                className="hidden sm:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 text-[10px] tracking-tight cursor-pointer transition-colors shadow-2xs"
                title="当前为通用纯净对话模式，点击可选择专业 Skill"
              >
                <Bot className="w-2.5 h-2.5 text-slate-500" />
                <span>纯净对话</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* 新建对话 */}
            <button
              onClick={() => createAssistantSession()}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="发起新对话"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* 历史对话记录抽屉 */}
            <button
              onClick={() => setIsHistoryDrawerOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer relative"
              title="历史对话记录"
            >
              <Clock className="w-4 h-4" />
              {assistantSessions.length > 1 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
              )}
            </button>

            {/* 系统设置 */}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="打开模型与网关配置"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* 展开/宽屏切换 */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title={isExpanded ? "收起宽屏" : "展开宽屏"}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* 关闭/收起抽屉 */}
            <button
              onClick={() => setIsAssistantOpen(false)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              title="收起助手"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        <AssistantMessageList
          messages={messages}
          selectedSkill={selectedSkill}
          activeSuggestionChips={activeSuggestionChips}
          currentSessionMessages={currentSession?.messages || []}
          isSendingCurrent={isSendingCurrent}
          sendingSessionId={sendingSessionId}
          copiedMsgId={copiedMsgId}
          messagesEndRef={messagesEndRef}
          textareaRef={textareaRef}
          setInputContent={setInputContent}
          resolveAssistantMediaSrc={resolveAssistantMediaSrc}
          extractShotsFromMessage={extractShotsFromMessage}
          handleSendMessage={handleSendMessage}
          handleStopGeneration={handleStopGeneration}
          handleCopyText={handleCopyText}
          handleUseSinglePrompt={handleUseSinglePrompt}
          showToast={showToast}
          setChatPreview={setChatPreview}
          setActiveBatchShots={setActiveBatchShots}
          setIsBatchModalOpen={setIsBatchModalOpen}
          addAssistantAttachment={addAssistantAttachment}
          setProductData={setProductData}
          setStep={setStep}
          setCurrentView={setCurrentView}
          setIsAssistantOpen={setIsAssistantOpen}
        />

        <AssistantInputArea
          assistantAttachments={assistantAttachments}
          removeAssistantAttachment={removeAssistantAttachment}
          selectedSkill={selectedSkill}
          setSelectedSkill={setSelectedSkill}
          showToast={showToast}
          inputContent={inputContent}
          setInputContent={setInputContent}
          textareaRef={textareaRef}
          handleKeyDown={handleKeyDown}
          handlePaste={handlePaste}
          handleSendMessage={handleSendMessage}
          isSending={isSending}
          isSendingCurrent={isSendingCurrent}
          fileInputRef={fileInputRef}
          skillImportInputRef={skillImportInputRef}
          handleFiles={handleFiles}
          handleImportSkillsFile={handleImportSkillsFile}
          showSkillMenu={showSkillMenu}
          setShowSkillMenu={setShowSkillMenu}
          skillMenuRef={skillMenuRef}
          customSkills={customSkills}
          handleEditCustomSkill={handleEditCustomSkill}
          handleExportCustomSkill={handleExportCustomSkill}
          handleDeleteCustomSkill={handleDeleteCustomSkill}
          handleDistillFromCurrentChat={handleDistillFromCurrentChat}
          setEditingCustomSkill={setEditingCustomSkill}
          setDistillContext={setDistillContext}
          setIsCustomSkillModalOpen={setIsCustomSkillModalOpen}
          showModelMenu={showModelMenu}
          setShowModelMenu={setShowModelMenu}
          modelMenuRef={modelMenuRef}
          availableAssistantModels={availableAssistantModels}
          currentModelObj={currentModelObj}
          assistantModel={assistantModel}
          setAssistantModel={setAssistantModel}
          showHistoryLimitMenu={showHistoryLimitMenu}
          setShowHistoryLimitMenu={setShowHistoryLimitMenu}
          historyMenuRef={historyMenuRef}
          assistantHistoryLimit={assistantHistoryLimit}
          setAssistantHistoryLimit={setAssistantHistoryLimit}
          showLangMenu={showLangMenu}
          setShowLangMenu={setShowLangMenu}
          langMenuRef={langMenuRef}
          selectedLang={selectedLang}
          setSelectedLang={setSelectedLang}
          resolveAssistantMediaSrc={resolveAssistantMediaSrc}
          setChatPreview={setChatPreview}
        />

        {/* 历史对话记录侧滑抽屉 */}
        <AIAssistantHistoryDrawer
          isOpen={isHistoryDrawerOpen}
          onClose={() => setIsHistoryDrawerOpen(false)}
        />
      </div>

      {/* 🌟 4. 全屏高清附件 Lightbox（图片 / 视频） */}
      {chatPreview && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in pointer-events-auto"
          onClick={() => setChatPreview(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] w-full bg-transparent flex flex-col items-center justify-center cursor-default"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            {chatPreview.type === 'video' ? (
              <video
                key={chatPreview.url}
                src={resolveAssistantMediaSrc(chatPreview.url, true)}
                poster={chatPreview.poster ? resolveAssistantMediaSrc(chatPreview.poster, false) : undefined}
                controls
                autoPlay
                playsInline
                preload="auto"
                controlsList="nodownload"
                className="max-w-full max-h-[85vh] w-auto rounded-2xl shadow-2xl border border-white/20 bg-black"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
              />
            ) : (
              <img 
                src={resolveAssistantMediaSrc(chatPreview.url, false)} 
                alt="图片大图预览" 
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && chatPreview.url) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(chatPreview.url);
                  }
                }}
                className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20 cursor-zoom-out" 
              />
            )}
            <button
              onClick={() => setChatPreview(null)}
              className="mt-3 px-5 py-2 rounded-full bg-slate-900/90 text-white text-xs font-bold border border-white/10 hover:bg-slate-800 transition-colors shadow-lg cursor-pointer"
            >
              关闭预览
            </button>
          </div>
        </div>
      )}

      {/* 🌟 5. 提示词批量生图工作台模态框 */}
      <BatchPromptModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        shots={activeBatchShots}
        availableImages={batchAvailableImages}
        onGenerateSuccess={() => setIsAssistantOpen(false)}
      />

      {/* 🌟 6. 自定义编写与提炼 Skill 模态框 */}
      <CustomSkillModal
        isOpen={isCustomSkillModalOpen}
        onClose={() => setIsCustomSkillModalOpen(false)}
        onSaveSkill={handleSaveCustomSkill}
        initialSkill={editingCustomSkill}
        distillContext={distillContext}
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

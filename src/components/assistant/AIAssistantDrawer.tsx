'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore, AssistantMessage, MediaAttachment } from '@/store/useAppStore';
import { VISION_MODELS } from '@/lib/vision';
import { extractVideoThumbnail, fileToDataUrl } from '@/lib/mediaHelper';
import { cleanPromptText } from '@/lib/drawing';
import { recordModelUsage } from '@/lib/usageTracker';
import { getModelIcon } from '@/components/common/ModelIcons';
import AIAssistantHistoryDrawer from './AIAssistantHistoryDrawer';
import FormattedMarkdown from './FormattedMarkdown';
import BatchPromptModal, { ParsedShotItem } from './BatchPromptModal';
import ProductCardWidget from './ProductCardWidget';
import { 
  X, 
  Plus, 
  Clock, 
  Settings, 
  ChevronRight, 
  ChevronDown, 
  ArrowUp, 
  Sparkles, 
  Copy, 
  Check, 
  RotateCcw, 
  Image as ImageIcon, 
  Film, 
  Trash2, 
  Maximize2, 
  Minimize2, 
  Loader2, 
  Bot, 
  Zap, 
  HelpCircle,
  FileVideo,
  Play,
  Eye,
  Pencil
} from 'lucide-react';

import { 
  AVAILABLE_SKILLS, 
  AssistantSkill, 
  getCustomSkills,
  saveCustomSkill,
  deleteCustomSkill
} from '@/lib/skills/ecommerce-visual-director';
import CustomSkillModal from './CustomSkillModal';

interface Props {
  onOpenSettings?: () => void;
}

// 回读条数选项列表 (对照图3)
const HISTORY_LIMIT_OPTIONS = [
  { value: 3, label: '回读3条' },
  { value: 5, label: '回读5条' },
  { value: 10, label: '回读10条' },
  { value: 20, label: '回读20条' },
  { value: 50, label: '回读50条' },
  { value: 100, label: '回读100条' },
  { value: 150, label: '回读150条' },
  { value: 200, label: '回读200条' }
];

// 默认多模态与对话助手模型列表 (覆盖主流旗舰与极速思考模型)
export const DEFAULT_ASSISTANT_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (极速思考)', shortName: 'gemini-3.7-flash', badge: '首选推荐', provider: 'Google' },
  { id: 'gemini-3.1-pro-preview-thinking-high', name: 'Gemini 3.1 Pro (深度思考)', shortName: 'Gemini 3.1 Pro', badge: '视觉旗舰', provider: 'Google' },
  { id: 'gpt-5.5-pro', name: 'GPT 5.5 Pro (综合多模态)', shortName: 'GPT 5.5 Pro', badge: '旗舰', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o (官方多模态)', shortName: 'GPT-4o', badge: '全能', provider: 'OpenAI' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (最强逻辑)', shortName: 'Claude 3.7', badge: '最强推理', provider: 'Anthropic' },
  { id: 'grok-4.6', name: 'Grok 4.6 (反AI实拍)', shortName: 'Grok 4.6', badge: '反AI纪实', provider: 'xAI' },
  { id: 'deepseek-chat', name: 'DeepSeek V3 (全能电商)', shortName: 'DeepSeek V3', badge: '国产旗舰', provider: 'DeepSeek' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1 (深度思考)', shortName: 'DeepSeek R1', badge: '深度推理', provider: 'DeepSeek' },
  { id: 'qwen-max', name: '通义千问 Qwen Max', shortName: 'Qwen Max', badge: '阿里电商', provider: 'Alibaba' }
];

// 快捷引导气泡
const SUGGESTION_CHIPS = [
  '📱 帮我规划一组复古胶片风咖啡机买家秀分镜',
  '🔍 分析上传图片中的商品材质与核心光影',
  '🎬 根据上传视频解析镜头运镜与爆款脚本',
  '💡 如何在提示词中避免塑料感并增强真实手机质感？'
];

export default function AIAssistantDrawer({ onOpenSettings }: Props) {
  const {
    isAssistantOpen,
    setIsAssistantOpen,
    assistantSessions,
    currentAssistantSessionId,
    createAssistantSession,
    addAssistantMessage,
    assistantModel,
    setAssistantModel,
    assistantHistoryLimit,
    setAssistantHistoryLimit,
    assistantAttachments,
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
        '🎨 帮我优化一段商业级写实提示词',
        '🎬 如何生成连贯无跳帧的动态短视频提示词？',
        '🔍 优化当前提示词中的商品主体一致性',
        '✨ 推荐一组极简高级科技风的摄影关键词'
      ];
    }
    return [
      '📱 帮我规划一组复古胶片风咖啡机买家秀分镜',
      '🔍 分析上传图片中的商品材质与核心光影',
      '🎬 根据上传视频解析镜头运镜与爆款脚本',
      '💡 如何在提示词中避免塑料感并增强真实手机质感？'
    ];
  }, [currentView]);

  const [inputContent, setInputContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

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
  }, []);

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

  const [selectedLang, setSelectedLang] = useState('中字');

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [chatPreviewUrl, setChatPreviewUrl] = useState<string | null>(null);

  // 批量生图工作台状态
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [activeBatchShots, setActiveBatchShots] = useState<ParsedShotItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // 当前会话
  const currentSession = assistantSessions.find(s => s.id === currentAssistantSessionId) || assistantSessions[0];
  const messages = currentSession?.messages || [];

  // 动态加载已接入模型列表
  const [availableAssistantModels, setAvailableAssistantModels] = useState<any[]>(DEFAULT_ASSISTANT_MODELS);

  // 🌟 核心：页面加载或刷新时，自动从 localStorage 恢复完整历史会话记录
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_assistant_sessions');
      const savedId = localStorage.getItem('ai_assistant_current_session_id');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const targetId = savedId && parsed.some((s: any) => s.id === savedId) ? savedId : parsed[0].id;
          useAppStore.setState({
            assistantSessions: parsed,
            currentAssistantSessionId: targetId
          });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const loadCustomAssistantModels = () => {
      let modelsList: any[] = DEFAULT_ASSISTANT_MODELS;
      const savedCustom = localStorage.getItem('custom_models');
      if (savedCustom) {
        try {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // 严格与 SettingsModal 中的多模态模型过滤规则对齐：
            // isMultimodal || isVision || isAssistant || (!isImage && !isVideo)
            const multimodalModels = parsed
              .filter((m: any) => m.isMultimodal || m.isVision || m.isAssistant || (!m.isImage && !m.isVideo))
              .map((m: any) => ({
                id: m.id,
                name: m.name || m.id,
                shortName: m.shortName || (m.name || m.id).split(' ')[0],
                badge: m.badge || (m.isCustom ? '自定义' : undefined),
                provider: m.isCustom ? 'Custom' : (m.provider || 'Official')
              }));
            if (multimodalModels.length > 0) {
              modelsList = multimodalModels;
            }
          }
        } catch (e) {}
      }

      setAvailableAssistantModels(modelsList);

      // 🌟 严格同步：从 localStorage 获取当前全局选定的助手/多模态模型
      const savedAssistantModel = localStorage.getItem('ai_assistant_model') || localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model');
      if (savedAssistantModel && modelsList.some((m: any) => m.id === savedAssistantModel)) {
        setAssistantModel(savedAssistantModel);
      } else if (modelsList.length > 0) {
        const currentModel = useAppStore.getState().assistantModel;
        const exists = modelsList.some((m: any) => m.id === currentModel);
        if (!exists) {
          setAssistantModel(modelsList[0].id);
          localStorage.setItem('ai_assistant_model', modelsList[0].id);
        }
      }
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
  }, [messages, isAssistantOpen]);

  // 上传文件处理 (图片 + 视频)
  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const url = await fileToDataUrl(file);
        addAssistantAttachment({
          type: 'image',
          url,
          name: file.name,
          size: file.size
        });
      } else if (file.type.startsWith('video/')) {
        // 自动提取视频缩略图作为多模态视觉帧
        const thumb = await extractVideoThumbnail(file);
        const url = await fileToDataUrl(file);
        addAssistantAttachment({
          type: 'video',
          url,
          thumbnailUrl: thumb || undefined,
          name: file.name,
          size: file.size
        });
      }
    }
  };

  // 拖拽上传
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

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

  // 发送消息
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputContent).trim();
    if (!text && assistantAttachments.length === 0) return;
    if (isSending) return;

    const attachmentsToSend = [...assistantAttachments];

    // 构建并追加用户消息
    const userMsg: AssistantMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      timestamp: Date.now()
    };

    addAssistantMessage(currentSession.id, userMsg);
    setInputContent('');
    clearAssistantAttachments();
    setIsSending(true);

    try {
      // 从 localStorage 获取用户自定义配置端点与 Key
      const localUrl = localStorage.getItem('ai_base_url') || undefined;
      const localKey = localStorage.getItem('ai_api_key') || undefined;

      // 准备送入后端的全部会话历史
      const allMsgs = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments?.map(a => ({
          type: a.type,
          url: a.thumbnailUrl || a.url, // 视频优先传递关键帧
          name: a.name
        }))
      }));

      // 🌟 智能自适应 Skill 执行协议注入
      const adaptiveSystemPrompt = selectedSkill ? `
${selectedSkill.systemPrompt}

【🚨 智能自适应向导执行流规范】：
1. 【完整物料全量输入】：若用户直接发送了商品图与核心诉求/卖点，请立即全自动执行完整 SOP，输出全套结构化分镜提示词（#### 📸 第1张: [标题] ... > [英文提示词]）；
2. 【仅提供部分素材（如只发了图但未提要求）】：默认按照本技能的最佳实践标准机位进行规划，并友好告知用户所选用的机位逻辑；
3. 【用户询问如何使用或打招呼】：用亲切专业的语气向用户展示所需物料清单（① 上传主商品底图 ② 描述卖点 ③ 生成张数），并引导用户直接开始。
` : undefined;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMsgs,
          model: assistantModel,
          historyLimit: assistantHistoryLimit,
          customBaseUrl: localUrl,
          customApiKey: localKey,
          systemPrompt: adaptiveSystemPrompt,
          skillId: selectedSkill ? selectedSkill.id : undefined
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI 助手服务响应异常');
      }

      // 🌟 记录真实模型调用用量
      const promptChars = allMsgs.reduce((acc, m) => acc + (m.content?.length || 0), 0);
      const replyChars = data.reply?.length || 0;
      const estPromptTokens = Math.max(50, Math.round(promptChars / 2.5));
      const estCompletionTokens = Math.max(30, Math.round(replyChars / 2.5));
      const usedModelId = data.modelUsed || assistantModel;

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

      // 追加助手回复消息 (包含智能体工具返回的商品交互卡片)
      const assistantMsg: AssistantMessage = {
        id: `msg-${Date.now()}-asst`,
        role: 'assistant',
        content: data.reply || '抱歉，暂时未能解析出内容。',
        timestamp: Date.now(),
        modelUsed: data.modelUsed || assistantModel,
        productWidget: data.productWidget || undefined
      };

      addAssistantMessage(currentSession.id, assistantMsg);
    } catch (err: any) {
      const errorMsg: AssistantMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        content: `⚠️ 请求失败: ${err.message || '网络连接超时，请检查网络或 API Key 设置。'}`,
        timestamp: Date.now()
      };
      addAssistantMessage(currentSession.id, errorMsg);
    } finally {
      setIsSending(false);
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

  // 从大模型返回的内容中智能解析出多张分镜提示词 (支持多图与人物模特一致性参考)
  const extractShotsFromMessage = (content: string, attachments: MediaAttachment[] = []): ParsedShotItem[] => {
    if (!content) return [];
    
    // 🌟 辅助函数：根据标题/序号智能绑定对应的参考图列表 (支持商品图+人物模特双图)
    const getRefImagesForShot = (titleStr: string, promptStr: string, shotIndex: number): string[] => {
      if (!attachments || attachments.length === 0) return [];
      const combined = `${titleStr} ${promptStr}`;
      const matchedImgs: string[] = [];
      
      // 检测 @图片1, @图片2, {{Mixed 1}}, {{Mixed 2}} 等多模态占位符
      const mixedMatches = Array.from(combined.matchAll(/(?:\{\{\s*(?:Mixed|Image|图)?\s*(\d+)\s*\}\}|@(?:图片|insp_)?(\d+))/gi));
      mixedMatches.forEach(m => {
        const idx = parseInt(m[1] || m[2], 10) - 1;
        if (attachments[idx]?.url && !matchedImgs.includes(attachments[idx].url)) {
          matchedImgs.push(attachments[idx].url);
        }
      });

      // 检测是否明确提到了 图1/图2/图3 或 第一张/第二张/第三张 或 分镜一/分镜二/分镜三...
      const picMatches = Array.from(combined.matchAll(/(?:图|图片|素材|参考图|第|分镜)\s*([123456789\d]|一|二|三|四|五|六)/g));
      picMatches.forEach(m => {
        let picNum = parseInt(m[1], 10);
        if (isNaN(picNum)) {
          const cnMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
          picNum = cnMap[m[1]] || 1;
        }
        const picIndex = picNum - 1;
        if (picIndex >= 0 && picIndex < attachments.length && attachments[picIndex]?.url) {
          if (!matchedImgs.includes(attachments[picIndex].url)) {
            matchedImgs.push(attachments[picIndex].url);
          }
        }
      });

      if (matchedImgs.length > 0) {
        return matchedImgs;
      }
      
      // 如果会话中有多张参考图（如商品图 + 人物模特一致性图），默认同时绑定前 2 张图，确保人物与商品同时一致！
      if (attachments.length >= 2) {
        return attachments.slice(0, 2).map(a => a.url);
      }
      
      return attachments[shotIndex]?.url ? [attachments[shotIndex].url] : (attachments[0]?.url ? [attachments[0].url] : []);
    };

    // 🌟 通路 1: 扫描所有代码块 (高优先级，支持 text/prompt/markdown/空标签代码块)
    const codeBlockRegex = /```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/gi;
    const directCodeShots: ParsedShotItem[] = [];
    let cbMatch: RegExpExecArray | null;

    while ((cbMatch = codeBlockRegex.exec(content)) !== null) {
      const rawCode = cbMatch[1].trim();
      const cleaned = cleanPromptText(rawCode);
      const isTrash = /复制给\s*(?:GPT|大模型|AI)|祝你数据长虹|推荐发布顺序/i.test(cleaned);
      if (cleaned.length > 10 && !isTrash) {
        // 🌟 从代码块向上倒序查找最近的一行分镜标题 (精准杜绝光圈快门参数 2.2、2.8 及开篇引导语)
        const textBefore = content.slice(Math.max(0, cbMatch.index - 400), cbMatch.index);
        const linesBefore = textBefore.trim().split('\n').map(l => l.trim()).filter(Boolean).reverse();
        
        let title = '';
        for (const line of linesBefore) {
          // 精准匹配以 📸 / 第X张 / 分镜X / 图X / 封面 / 场景 等开头的分镜主标题行
          const headingMatch = line.match(/^(?:#{1,4}\s*)?(?:[▍▎▏•\-\*]+|\*\*|【)?\s*(?:📸\s*)?(?:第\s*[\d一二三四五六七八九十]+\s*(?:张|分镜|画面|镜头|个)|分镜\s*[\d一二三四五六七八九十\.]+|Shot\s*\d+|图\s*\d+|封面|外观|细节|功能|实测|场景|特写|总结|穿搭)[：:\s\S]*/i);
          // 排除光圈/快门/ISO参数行 (如 2.2，1/125s 或 2.8，1/160s)
          if (headingMatch && !/^\d+[\.、]\d+/.test(line.replace(/^[#*•\-\s【▍▎▏|｜`]+/, ''))) {
            title = line.replace(/^[#*•\-\s【▍▎▏|｜`]+|[#*•\-\s】|｜`]+$/g, '').slice(0, 48);
            break;
          }
        }

        if (!title) {
          const explicitLine = linesBefore.find(l => /(?:第\s*[\d一二三四五六七八九十]+\s*张|📸|分镜\s*\d+)/.test(l));
          if (explicitLine && !/^\d+[\.、]\d+/.test(explicitLine.replace(/^[#*•\-\s【▍▎▏|｜`]+/, ''))) {
            title = explicitLine.replace(/^[#*•\-\s【▍▎▏|｜`]+|[#*•\-\s】|｜`]+$/g, '').slice(0, 48);
          } else {
            title = `📸 第 ${directCodeShots.length + 1} 张分镜`;
          }
        }

        const arMatch = rawCode.match(/--ar\s+([0-9:]+)/);
        const aspectRatio = arMatch ? arMatch[1] : '3:4';
        const refImages = getRefImagesForShot(title, cleaned, directCodeShots.length);

        directCodeShots.push({
          id: `cb_shot_${directCodeShots.length}_${Date.now()}`,
          title,
          prompt: cleaned,
          aspectRatio,
          refImage: refImages[0] || undefined,
          refImages: refImages
        });
      }
    }

    if (directCodeShots.length >= 1) {
      return directCodeShots;
    }

    // 🌟 通路 2: 全面 Markdown Section 多级拆解
    const splitRegex = /(?=(?:#{1,4}\s*(?:📸\s*)?|(?:\*\*|【)|(?:^|\n)\s*[▍▎▏•\-*]?\s*)(?:第\s*\d+\s*张|分镜\s*[\d一二三四五六七八九十]+|图\s*\d+|画面\s*\d+|方案\s*\d+|镜头\s*\d+|Shot\s*\d+|\d+[\.、]\s*|封面|配图|外观|细节|功能|实测|场景|特写|对比|包装))/m;
    const rawSections = content.split(splitRegex);
    const sections = rawSections.length > 1 ? rawSections : [content];
    const sectionShots: ParsedShotItem[] = [];

    sections.forEach((sec, idx) => {
      // 过滤纯说明类段落
      if (
        /^(?:推荐发布顺序|配套小红书标题|发布小建议|排版建议|注意事项清单|操作指南|祝你数据长虹)/i.test(sec.trim()) &&
        !/提示词|Prompt|--ar|```/i.test(sec)
      ) {
        return;
      }

      // 提取代码块中提示词
      const codeMatch = sec.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/);
      // 提取引用块中提示词
      const quoteMatch = sec.match(/>\s*([^\n]+(?:\n>[^\n]+)*)/);
      // 提取冒号后的提示词
      const colonMatch = sec.match(/(?:(?:DALL-E(?:\s*3)?|Midjourney|MJ|SD|生图|绘图|核心|英文|中文)?\s*(?:提示词|Prompt)|画面描述|视觉呈现|生图指令|文生图)\s*[：:]\s*(?:>)?\s*([\s\S]+?)(?=\n\n\S|\n#{1,4}|\n▍|$)|\b(Prompt\s*[:：]\s*[\s\S]+)/i);

      let promptText = '';
      if (codeMatch) {
        promptText = codeMatch[1].trim();
      } else if (quoteMatch) {
        promptText = quoteMatch[1].replace(/\n>\s*/g, ' ').trim();
      } else if (colonMatch) {
        promptText = (colonMatch[1] || colonMatch[2] || '').replace(/^Prompt\s*[:：]\s*/i, '').trim();
      }

      if (!promptText && (sec.includes('--ar') || sec.includes('realistic') || sec.includes('photography') || sec.includes('画面展示') || sec.includes('以用户提供的'))) {
        const lineMatch = sec.split('\n').find(l => l.includes('--ar') || l.includes('realistic') || l.includes('photography') || l.includes('高清') || l.includes('摄影') || l.includes('画面展示') || l.includes('以用户提供的'));
        if (lineMatch) {
          promptText = lineMatch.replace(/^[>\s*•\-▍▎▏]+/, '').trim();
        }
      }

      const cleanedPrompt = cleanPromptText(promptText);
      const isConversationalTrash = /复制给\s*(?:GPT|大模型|AI)|祝你数据长虹|推荐发布顺序/i.test(cleanedPrompt);

      if (cleanedPrompt && cleanedPrompt.length > 10 && !isConversationalTrash) {
        const linesInSec = sec.trim().split('\n').map(l => l.trim()).filter(Boolean);
        let title = '';
        for (const line of linesInSec) {
          const headingMatch = line.match(/^(?:#{1,4}\s*)?(?:[▍▎▏•\-\*]+|\*\*|【)?\s*(?:📸\s*)?(?:第\s*[\d一二三四五六七八九十]+\s*(?:张|分镜|画面|镜头|个)|分镜\s*[\d一二三四五六七八九十\.]+|Shot\s*\d+|图\s*\d+|封面|外观|细节|功能|实测|场景|特写|总结|穿搭)[：:\s\S]*/i);
          if (headingMatch && !/^\d+[\.、]\d+/.test(line.replace(/^[#*•\-\s【▍▎▏|｜`]+/, ''))) {
            title = line.replace(/^[#*•\-\s【▍▎▏|｜`]+|[#*•\-\s】|｜`]+$/g, '').slice(0, 48);
            break;
          }
        }
        if (!title) {
          title = `📸 分镜 ${sectionShots.length + 1}`;
        }

        const arMatch = promptText.match(/--ar\s+([0-9:]+)/);
        const aspectRatio = arMatch ? arMatch[1] : '3:4';
        const refImages = getRefImagesForShot(title, cleanedPrompt, sectionShots.length);

        sectionShots.push({
          id: `shot_${idx}_${sectionShots.length}_${Date.now()}`,
          title: title,
          prompt: cleanedPrompt,
          aspectRatio: aspectRatio,
          refImage: refImages[0] || undefined,
          refImages: refImages
        });
      }
    });

    if (sectionShots.length > 0) {
      return sectionShots;
    }

    // 🌟 通路 3: 提取所有 `> ...` 引用块
    const allQuotes = content.match(/>\s*([^\n]+(?:\n>[^\n]+)*)/g);
    if (allQuotes && allQuotes.length > 0) {
      const quoteShots: ParsedShotItem[] = [];
      allQuotes.forEach((q, qIdx) => {
        const text = cleanPromptText(q.replace(/^>\s*/, '').replace(/\n>\s*/g, ' '));
        const isTrash = /复制给\s*(?:GPT|大模型|AI)|祝你数据长虹|推荐发布顺序/i.test(text);
        if (text.length > 10 && !isTrash) {
          const arMatch = text.match(/--ar\s+([0-9:]+)/);
          const refImages = getRefImagesForShot(`图${qIdx + 1}`, text, qIdx);
          quoteShots.push({
            id: `quote_shot_${qIdx}_${Date.now()}`,
            title: `📸 第 ${qIdx + 1} 张分镜`,
            prompt: text,
            aspectRatio: arMatch ? arMatch[1] : '3:4',
            refImage: refImages[0] || undefined,
            refImages: refImages
          });
        }
      });
      if (quoteShots.length > 0) {
        return quoteShots;
      }
    }

    return [];
  };

  if (!isAssistantOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex justify-end select-none">
      {/* 遮罩背景 (宽屏模式下可点击关闭) */}
      <div 
        onClick={() => setIsAssistantOpen(false)}
        className={`fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity duration-300 pointer-events-auto ${
          isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`} 
      />

      {/* 🌟 核心明亮轻奢全站统一侧滑工作台抽屉 */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative h-full bg-white/95 backdrop-blur-2xl border-l border-slate-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.06)] flex flex-col pointer-events-auto transition-all duration-300 text-slate-800 ${
          isExpanded ? 'w-full max-w-4xl sm:w-[840px] md:w-[920px]' : 'w-full sm:w-[580px] md:w-[640px]'
        }`}
      >
        {/* 拖拽上传全屏半透明指示层 */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 bg-red-600/15 backdrop-blur-sm border-2 border-dashed border-red-500 flex flex-col items-center justify-center gap-3 text-red-600 animate-fade-in pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
              <ImageIcon className="w-8 h-8" />
            </div>
            <span className="text-sm font-bold">释放鼠标，上传图片或视频素材</span>
          </div>
        )}

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
              className="hidden sm:flex p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
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

        {/* 🌟 2. 消息流与空状态主区域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 min-h-0 scrollbar-thin">
          {messages.length === 0 ? (
            /* 🌟 空状态引导页 (智能自适应：支持根据已挂载 Skill 自动切换向导模式) */
            selectedSkill ? (
              <div className="h-full flex flex-col justify-center items-center text-center px-2 py-6 space-y-5 animate-fade-in my-auto">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 to-orange-500 text-white flex items-center justify-center mx-auto shadow-md">
                    <Bot className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center justify-center gap-1.5">
                    <span>{selectedSkill.name}</span>
                  </h2>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    {selectedSkill.greeting || selectedSkill.description}
                  </p>
                </div>

                {/* 物料向导清单 */}
                {selectedSkill.inputRequirements && selectedSkill.inputRequirements.length > 0 && (
                  <div className="w-full max-w-sm rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 text-left space-y-2 shadow-2xs">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-red-500" />
                      <span>建议提供的创作物料</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-700 font-medium">
                      {selectedSkill.inputRequirements.map((req, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
                          <span>{req}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 快捷指令模板 */}
                {selectedSkill.quickTemplates && selectedSkill.quickTemplates.length > 0 && (
                  <div className="w-full max-w-sm space-y-2 text-left">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      ⚡ 快捷指令模版 (点击一键填入)
                    </div>
                    <div className="space-y-1.5">
                      {selectedSkill.quickTemplates.map((tpl, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setInputContent(tpl.prompt);
                            textareaRef.current?.focus();
                          }}
                          className="w-full p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-red-300 text-xs text-slate-800 transition-all text-left flex items-center justify-between cursor-pointer group shadow-2xs"
                        >
                          <span className="font-semibold">{tpl.label}</span>
                          <ArrowUp className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 flex-shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8 space-y-6 animate-fade-in my-auto">
                {/* 沉浸式问候标语 */}
                <div className="space-y-3">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center justify-center gap-2">
                    <span className="text-red-600">告诉 AI 助手，</span>
                    <span>你想如何创作</span>
                  </h2>
                  <div className="text-xs sm:text-sm text-slate-600 space-y-1.5 text-left max-w-xs mx-auto font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span>输入灵感，让 AI 帮您展开</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span>上传图片/视频作为参考</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span>边聊边改，直到更接近你的想法</span>
                    </div>
                  </div>
                </div>

                {/* 快捷推荐气泡 */}
                <div className="w-full space-y-2 pt-2 text-left">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    💡 快速灵感试一试
                  </div>
                  <div className="space-y-1.5">
                    {activeSuggestionChips.map((chip: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(chip)}
                        className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 hover:border-slate-300 text-xs text-slate-700 hover:text-slate-900 transition-all text-left flex items-center justify-between cursor-pointer group shadow-2xs"
                      >
                        <span className="truncate">{chip}</span>
                        <ArrowUp className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 flex-shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* 消息列表 */
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-fade-in group`}
                >
                  {/* 头像 */}
                  <div className="w-8 h-8 rounded-xl bg-white text-slate-700 border border-slate-200/80 p-1 flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-2xs">
                    <img src="/app_logo.png" alt={isUser ? "User" : "AI"} className="w-full h-full object-contain" />
                  </div>

                  {/* 消息气泡 */}
                  <div className={`max-w-[88%] space-y-2 flex flex-col ${isUser ? 'items-end ml-auto' : 'items-start mr-auto'}`}>
                    {/* 附件展示 (图片或视频 - 单行水平排列 + 智能角标) */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`flex items-center gap-2 my-1 overflow-x-auto max-w-full pb-0.5 scrollbar-none ${
                        isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'
                      }`}>
                        {msg.attachments.map((att, attIdx) => (
                          <div 
                            key={attIdx} 
                            onClick={() => {
                              if (att.url || att.thumbnailUrl) setChatPreviewUrl(att.url || att.thumbnailUrl || '');
                            }}
                            className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-xl overflow-hidden border border-slate-200/90 shadow-2xs aspect-square bg-slate-100 group/att cursor-pointer hover:border-red-500 transition-all hover:scale-102 flex-shrink-0"
                            title={`点击放大查看 图${attIdx + 1}`}
                          >
                            {att.type === 'video' ? (
                              <div className="relative w-full h-full">
                                <img src={att.thumbnailUrl || att.url} alt="视频" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <Play className="w-4 h-4 text-white fill-white" />
                                </div>
                              </div>
                            ) : (
                              <img 
                                src={att.url} 
                                alt={`图${attIdx + 1}`} 
                                className="w-full h-full object-cover" 
                              />
                            )}

                            {/* 智能角标：图1、图2 */}
                            <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded-md bg-black/75 backdrop-blur-xs text-[10px] font-mono font-bold text-white z-10 shadow-xs">
                              图{attIdx + 1}
                            </span>

                            {/* 悬浮放大查看眼标 */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center text-white z-20">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 文字内容气泡 (深度 Markdown 美化排版) */}
                    {msg.content && (
                      <div className={`p-4 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-2xs select-text text-left ${
                        isUser
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-tr-xs font-normal break-all shadow-md shadow-indigo-500/10'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs font-normal w-full shadow-xs'
                      }`}>
                        {isUser ? (
                          <div className="whitespace-pre-wrap break-all leading-relaxed">
                            {msg.content}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <FormattedMarkdown 
                              content={msg.content} 
                              onUsePrompt={handleUseSinglePrompt}
                            />

                            {/* 智能检测：如果当前回复包含多个分镜生图提示词，呈现一键批量生图快捷条 */}
                            {(() => {
                              const allSessionAttachments = currentSession.messages.flatMap(m => m.attachments || []);
                              const detectedShots = extractShotsFromMessage(msg.content, allSessionAttachments);
                              if (detectedShots.length > 0) {
                                return (
                                  <div className="mt-3 p-3 rounded-2xl bg-gradient-to-r from-red-50 via-orange-50 to-amber-50 border border-red-200 flex items-center justify-between gap-3 animate-fade-in shadow-2xs">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                                        <Sparkles className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                          <span>识别到 {detectedShots.length} 组分镜绘图提示词</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                          已自动绑定参考图与画幅比例
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveBatchShots(detectedShots);
                                          setIsBatchModalOpen(true);
                                        }}
                                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-bold shadow-md shadow-red-500/20 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>⚡ 批量生图工作台</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 🌟 智能体工具组件：电商抓取与素材交互选择卡片 */}
                    {msg.productWidget && (
                      <ProductCardWidget
                        product={msg.productWidget}
                        onSetAsReference={(imgUrl) => {
                          addAssistantAttachment({
                            type: 'image',
                            url: imgUrl,
                            name: `商品实物图_${Date.now()}.jpg`
                          });
                          showToast('📌 已将该图片设为当前生图垫图 (图1)！');
                        }}
                        onLoadToStudio={(prod, imgs) => {
                          setProductData(prod, imgs, '🤖 AI 助手智能抓取导入');
                          setStep(2);
                          setCurrentView('buyer_show');
                          setIsAssistantOpen(false);
                          showToast('🚀 已载入生图工坊！');
                        }}
                        onGenerateShotsForProduct={(title) => {
                          handleSendMessage(`请针对【${title}】的真实外观、材质与核心卖点，构思 6 张极具商业转化力的高清实拍电商分镜`);
                        }}
                        onPreviewImage={(imgUrl) => {
                          setChatPreviewUrl(imgUrl);
                        }}
                      />
                    )}

                    {/* 底部微小操作栏 (复制、重新生成、模型标签) */}
                    {!isUser && (
                      <div className="flex items-center gap-2 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-400">
                        {msg.modelUsed && (
                          <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                            {msg.modelUsed.replace('-preview-thinking-high', '').replace('-preview', '')}
                          </span>
                        )}
                        <button
                          onClick={() => handleCopyText(msg.content, msg.id)}
                          className="hover:text-slate-700 flex items-center gap-0.5 transition-colors cursor-pointer"
                        >
                          {copiedMsgId === msg.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedMsgId === msg.id ? '已复制' : '复制'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* 生成中 Loading 动效 */}
          {isSending && (
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-red-500 shadow-2xs">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                <span>AI 正在多模态思考中...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 🌟 3. 底部多模态指令输入区 */}
        <div className="p-4 border-t border-slate-100 bg-white/90 backdrop-blur-md space-y-3 flex-shrink-0">
          {/* 待发送附件预览栏 */}
          {assistantAttachments.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 animate-fade-in">
              {assistantAttachments.map((att, idx) => (
                <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-100 group/att shadow-2xs">
                  <img src={att.thumbnailUrl || att.url} alt="" className="w-full h-full object-cover" />
                  {att.type === 'video' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                  )}
                  <button
                    onClick={() => removeAssistantAttachment(idx)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-2xs"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 输入框主卡片 */}
          <div className="relative rounded-2xl bg-slate-50/90 border border-slate-200/90 focus-within:border-red-400 focus-within:bg-white p-3 space-y-2 shadow-2xs transition-all">
            {/* 🌟 激活中的 Skill 悬浮药丸与快捷模板条 */}
            {selectedSkill && (
              <div className="space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs w-fit shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <span className="font-bold">{selectedSkill.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">({selectedSkill.badge})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSkill(null);
                        showToast('💬 已恢复默认纯净对话模式');
                      }}
                      className="p-0.5 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors cursor-pointer ml-1"
                      title="关闭当前 Skill，恢复纯净普通对话"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {selectedSkill.inputRequirements && selectedSkill.inputRequirements.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-medium hidden md:inline truncate max-w-[200px]" title={selectedSkill.inputRequirements.join(' | ')}>
                      💡 支持一键全量丢入或按向导输入
                    </span>
                  )}
                </div>

                {/* 快捷模板胶囊滑动条 */}
                {selectedSkill.quickTemplates && selectedSkill.quickTemplates.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                    {selectedSkill.quickTemplates.map((tpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setInputContent(tpl.prompt);
                          textareaRef.current?.focus();
                        }}
                        className="flex-shrink-0 px-2 py-0.5 rounded-lg bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-600 hover:text-red-600 text-[11px] font-medium transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                        title={tpl.prompt}
                      >
                        <Zap className="w-2.5 h-2.5 text-red-500" />
                        <span>{tpl.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={inputContent}
              onChange={e => {
                const val = e.target.value;
                setInputContent(val);
                if (val.trim() === '/' || val.endsWith('/')) {
                  setShowSkillMenu(true);
                }
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={selectedSkill ? `[${selectedSkill.name}] 描述需求或上传素材...` : "输入创作需求，输入 / 选择 Skill，或直接提问..."}
              rows={2}
              className="w-full bg-transparent border-0 text-slate-800 placeholder-slate-400 text-xs sm:text-sm resize-none outline-none leading-relaxed min-h-[44px]"
            />

            {/* 🌟 底部配置条 (极简流线型排版，工具居左，发送键固定在右下角) */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500 relative">
              {/* 左侧功能工具集 */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap py-0.5 relative z-30">
                {/* 1. 上传图片/视频按钮 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 border border-slate-200/70"
                  title="上传图片或视频素材"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* 1.5 🌟 选择技能 (Skill Selector) 按钮及浮层 */}
                <div className="relative flex-shrink-0" ref={skillMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSkillMenu(!showSkillMenu);
                      setShowModelMenu(false);
                      setShowHistoryLimitMenu(false);
                      setShowLangMenu(false);
                    }}
                    className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs transition-colors cursor-pointer border ${
                      selectedSkill 
                        ? 'bg-amber-50 text-amber-700 border-amber-300 font-bold hover:bg-amber-100 shadow-2xs' 
                        : 'bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 border-slate-200/70 font-medium'
                    }`}
                    title="选择技能 (输入 / 亦可直接呼出)"
                  >
                    <Bot className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-[11.5px] truncate max-w-[75px]">{selectedSkill ? selectedSkill.name : '选择技能'}</span>
                    <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
                  </button>

                  {/* 🌟 技能选择弹窗列表 */}
                  {showSkillMenu && (
                    <div 
                      className="absolute bottom-full mb-2.5 left-0 w-80 sm:w-[410px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-2 z-70 space-y-2 animate-fade-in text-left max-h-[460px] flex flex-col text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* 顶部标题与创建快捷入口 */}
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-red-500" />
                          <span className="text-xs font-bold text-slate-900 tracking-wide">AI 技能 (Skill) 库</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCustomSkill(null);
                              setDistillContext(undefined);
                              setIsCustomSkillModalOpen(true);
                              setShowSkillMenu(false);
                            }}
                            className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-red-200"
                            title="自行编写新的 Skill"
                          >
                            <Plus className="w-3 h-3" />
                            <span>编写 Skill</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDistillFromCurrentChat}
                            className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-amber-200"
                            title="从当前会话的对话历史中自动总结提炼为 Skill"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>对话提炼</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowSkillMenu(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors ml-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 技能列表 (可滚动) */}
                      <div className="overflow-y-auto space-y-1.5 p-1 max-h-80 scrollbar-thin">
                        {/* 纯净默认对话选项 */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSkill(null);
                            setShowSkillMenu(false);
                            if (inputContent.trim() === '/') setInputContent('');
                            showToast('💬 已恢复默认纯净对话模式');
                          }}
                          className={`w-full p-2.5 rounded-xl text-left transition-all cursor-pointer flex items-start gap-3 border ${
                            !selectedSkill 
                              ? 'bg-red-50 border-red-200 text-slate-900 shadow-2xs' 
                              : 'hover:bg-slate-50 border-transparent text-slate-700'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-slate-500">
                            <Bot className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">💬 纯净默认对话 (无预设)</span>
                              {!selectedSkill && <Check className="w-3.5 h-3.5 text-red-600" />}
                            </div>
                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                              不使用任何特定 Skill 预设，保持纯粹通用的日常 AI 问答，不污染对话
                            </p>
                          </div>
                        </button>

                        {/* 用户自定义 Skill 列表 */}
                        {customSkills.length > 0 ? (
                          <div className="pt-2 border-t border-slate-100 mt-2">
                            <div className="text-[10px] font-bold text-slate-400 px-2 py-1 flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-600" />
                                <span>我的专属 Skill 库 ({customSkills.length})</span>
                              </span>
                              <span className="text-[9px] text-slate-400">支持自由微调、更新与删除</span>
                            </div>
                            {customSkills.map((skill) => {
                              const isCurrent = selectedSkill?.id === skill.id;
                              return (
                                <div
                                  key={skill.id}
                                  onClick={() => {
                                    setSelectedSkill(skill);
                                    setShowSkillMenu(false);
                                    if (inputContent.trim() === '/') setInputContent('');
                                    showToast(`✨ 已启用自定义 Skill: ${skill.name}`);
                                  }}
                                  className={`w-full p-2.5 rounded-xl text-left transition-all cursor-pointer flex items-start gap-3 border mt-1.5 ${
                                    isCurrent 
                                      ? 'bg-amber-50 border-amber-200 text-slate-900 shadow-2xs ring-1 ring-amber-200' 
                                      : 'hover:bg-slate-50 border-transparent text-slate-700'
                                  }`}
                                >
                                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 text-sm bg-slate-100 text-amber-600">
                                    <Sparkles className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5 truncate">
                                        <span className="text-xs font-bold text-slate-900 truncate">{skill.name}</span>
                                        {skill.badge && (
                                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 text-[9px] font-medium flex-shrink-0">
                                            {skill.badge}
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* 操作按钮：编辑与删除 */}
                                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        <button
                                          type="button"
                                          onClick={(e) => handleEditCustomSkill(e, skill)}
                                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer border border-slate-200"
                                          title="编辑/修改此 Skill"
                                        >
                                          <Pencil className="w-3 h-3 text-amber-600" />
                                          <span>修改</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => handleDeleteCustomSkill(e, skill.id)}
                                          className="px-2 py-0.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer border border-red-200"
                                          title="删除此 Skill"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          <span>删除</span>
                                        </button>
                                        {isCurrent && <Check className="w-3.5 h-3.5 text-amber-600" />}
                                      </div>
                                    </div>
                                    <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                                      {skill.description}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. 模型选择下拉 */}
                <div className="relative flex-shrink-0" ref={modelMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModelMenu(!showModelMenu);
                      setShowSkillMenu(false);
                      setShowHistoryLimitMenu(false);
                      setShowLangMenu(false);
                    }}
                    className="h-7 px-2.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70"
                    title="当前对话分析模型 (可在系统设置中更改默认模型)"
                  >
                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {getModelIcon(assistantModel, "w-3.5 h-3.5 text-slate-700")}
                    </div>
                    <span className="text-[11.5px] truncate max-w-[85px] sm:max-w-[120px] text-slate-800 font-mono">
                      {currentModelObj.shortName || assistantModel}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
                  </button>

                  {showModelMenu && (
                    <div 
                      className="absolute bottom-full mb-2 left-0 w-72 sm:w-80 rounded-2xl bg-white border border-slate-200 shadow-2xl p-2 z-70 space-y-1 animate-fade-in text-left max-h-80 overflow-y-auto text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10px] text-slate-400 font-mono font-bold flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span>💬 助手对话与视觉分析模型</span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">{availableAssistantModels.length} 个可用</span>
                      </div>
                      <div className="space-y-1 pt-1">
                        {availableAssistantModels.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setAssistantModel(m.id);
                              localStorage.setItem('ai_assistant_model', m.id);
                              setShowModelMenu(false);
                              showToast(`🤖 已切换助手模型: ${m.shortName || m.name}`);
                            }}
                            className={`w-full p-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer text-left ${
                              assistantModel === m.id ? 'bg-red-50 text-red-600 font-bold border border-red-200/80 shadow-2xs' : 'hover:bg-slate-100 text-slate-700 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                {getModelIcon(m.id, "w-3.5 h-3.5 text-slate-700")}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-semibold">{m.name}</span>
                                  {m.badge && (
                                    <span className="px-1 py-0.2 rounded bg-slate-200/80 text-slate-700 text-[9px] font-medium flex-shrink-0">
                                      {m.badge}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">{m.id}</div>
                              </div>
                            </div>
                            {assistantModel === m.id && <Check className="w-4 h-4 text-red-600 flex-shrink-0 ml-1.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. 🌟 回读条数下拉 */}
                <div className="relative flex-shrink-0" ref={historyMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHistoryLimitMenu(!showHistoryLimitMenu);
                      setShowModelMenu(false);
                      setShowSkillMenu(false);
                      setShowLangMenu(false);
                    }}
                    className="h-7 px-2.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 text-slate-600 hover:text-slate-900 text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer border border-slate-200/70"
                  >
                    <span>回读{assistantHistoryLimit}条</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>

                  {showHistoryLimitMenu && (
                    <div 
                      className="absolute bottom-full mb-2 left-0 w-36 rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 z-70 space-y-0.5 animate-fade-in text-left max-h-52 overflow-y-auto text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10px] text-slate-400 font-mono">记忆上下文条数</div>
                      {HISTORY_LIMIT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setAssistantHistoryLimit(opt.value);
                            setShowHistoryLimitMenu(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer font-mono ${
                            assistantHistoryLimit === opt.value ? 'bg-red-50 text-red-600 font-bold' : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {assistantHistoryLimit === opt.value && <Check className="w-3 h-3 text-red-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. 语言设置 */}
                <div className="relative flex-shrink-0" ref={langMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLangMenu(!showLangMenu);
                      setShowModelMenu(false);
                      setShowSkillMenu(false);
                      setShowHistoryLimitMenu(false);
                    }}
                    className="h-7 px-2.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 text-slate-600 hover:text-slate-900 text-xs flex items-center gap-1 transition-colors cursor-pointer border border-slate-200/70"
                  >
                    <span>{selectedLang}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>
                  {showLangMenu && (
                    <div 
                      className="absolute bottom-full mb-2 left-0 w-24 rounded-xl bg-white border border-slate-200 shadow-2xl p-1 z-70 space-y-0.5 animate-fade-in text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      {['中字', 'English', '双语'].map(l => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => { setSelectedLang(l); setShowLangMenu(false); }}
                          className="w-full px-2 py-1 rounded-lg text-xs text-left hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：发送按钮 (固定在右下角，从不折行) */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={isSending || (!inputContent.trim() && assistantAttachments.length === 0)}
                  className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-orange-500/25 flex-shrink-0"
                  title="发送消息 (Enter)"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={e => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
            accept="image/*,video/*"
            multiple
            className="hidden"
          />
        </div>

        {/* 历史对话记录侧滑抽屉 */}
        <AIAssistantHistoryDrawer
          isOpen={isHistoryDrawerOpen}
          onClose={() => setIsHistoryDrawerOpen(false)}
        />
      </div>

      {/* 🌟 4. 全屏高清附件 Lightbox 查看器 */}
      {chatPreviewUrl && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in pointer-events-auto cursor-zoom-out"
          onClick={() => setChatPreviewUrl(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-transparent flex flex-col items-center justify-center cursor-default"
            onClick={e => e.stopPropagation()}
          >
            <img 
              src={chatPreviewUrl} 
              alt="图片大图预览" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20" 
            />
            <button
              onClick={() => setChatPreviewUrl(null)}
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
        availableImages={(() => {
          const imgs: { url: string; label: string }[] = [];
          const seen = new Set<string>();

          // 1. 优先提取当前会话中抓取到的商品主图与素材图 (图1 主商品, 图2...)
          currentSession.messages.forEach(m => {
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

          // 2. 补充用户在会话中手动上传的图片附件
          currentSession.messages.forEach(m => {
            (m.attachments || []).forEach(att => {
              if (att.url && !seen.has(att.url)) {
                seen.add(att.url);
                imgs.push({
                  url: att.url,
                  label: `图${imgs.length + 1}`
                });
              }
            });
          });

          return imgs;
        })()}
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

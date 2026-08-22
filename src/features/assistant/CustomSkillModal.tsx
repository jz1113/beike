'use client';
import { apiFetch } from '@/lib/apiClient';
import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Save, 
  Wand2, 
  BookOpen, 
  Code, 
  Bot, 
  Check, 
  ChevronDown, 
  AlertCircle,
  Loader2,
  Cpu
} from 'lucide-react';
import { AssistantSkill } from '@/lib/skills/ecommerce-visual-director';
import { recordModelUsage } from '@/lib/usageTracker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaveSkill: (skill: AssistantSkill) => void;
  initialSkill?: AssistantSkill | null;
  distillContext?: string; // 从当前对话总结提炼的对话上下文
}

// 提炼与润色专用的顶级 AI 引擎列表 (包含 Claude Opus 5 深度推理)
const DISTILL_MODELS = [
  { id: 'claude-opus-5', name: 'Claude Opus 5 (顶级架构提炼 · 深度推理)', shortName: 'Claude Opus 5' },
  { id: 'claude-fable-5', name: 'Claude Fable 5 (精准逻辑对齐 · 敏捷重构)', shortName: 'Claude Fable 5' },
  { id: 'gpt-4o', name: 'GPT-4o (全能结构化解析)', shortName: 'GPT-4o' }
];

// 官方精选标准 Skill 编写规范模板
const SKILL_TEMPLATES = [
  {
    name: '📸 商业静物商品摄影 (1:1保真 · 柔光高透)',
    desc: '固定绑定图1主商品，1:1精准输出分镜，高透商业棚拍质感。',
    badge: '1:1精准保真 · 柔光',
    prompt: `你是资深商业电商静物摄影大师与 AI 视觉导演。
【核心执行铁律】：
1. 数量对齐：无论用户要求几张，必须严格输出对齐的分镜数（如 3张则输出 3张），严禁擅自增减。
2. 垫图绑定：【图1】永远是用户上传的主商品底图。所有输出的分镜必须完全基于【图1】主体，严禁改变商品外观与品牌。
3. 输出格式协议：必须严格采用如下 Markdown 格式，便于系统自动识别批量生图卡片：
#### 📸 第1张: [分镜场景说明]
> [简体中文高质量生图提示词，须含电商棚拍柔光、8k、--ar 3:4 --style raw --v 6.0 等参数；画面内英文可放引号内]`
  },
  {
    name: '🌟 模特实拍与穿搭上身场景化',
    desc: '以图1为核心穿搭单品，延展多机位穿搭示范与户外生活方式街拍。',
    badge: '穿搭上身 · 街拍氛围',
    prompt: `你是时尚杂志视觉总监。精通服饰穿搭、模特姿态指导与自然光影营造。
【核心执行铁律】：
1. 数量严格对齐用户指令。
2. 保持【图1】衣物/单品的面料、版型、剪裁与细节不变，将其自然融入不同模特的日常穿搭或街拍背景。
3. 必须采用以下标准格式输出：
#### 📸 第1张: [模特机位与氛围说明]
> [简体中文生图提示词，含模特动作、自然采光、景深、--ar 3:4 --style raw --v 6.0]`
  },
  {
    name: '📝 爆款小红书/电商种草文案模板',
    desc: '自动生成高点击标题、痛点共鸣、Emoji 排版与转化钩子。',
    badge: '高转化 · 痛点直击',
    prompt: `你是电商顶尖爆款文案专家。精通小红书、抖音、淘宝爆款笔记排版，擅长制造情绪价值、痛点共鸣与极具购买冲动的种草转化文案。请根据用户提供的商品卖点，输出 3 个高吸引力爆款标题和正文排版。`
  }
];

export default function CustomSkillModal({
  isOpen,
  onClose,
  onSaveSkill,
  initialSkill,
  distillContext
}: Props) {
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillBadge, setSkillBadge] = useState('');
  const [skillGreeting, setSkillGreeting] = useState('');
  const [skillRequirements, setSkillRequirements] = useState<string[]>([]);
  const [skillQuickTemplates, setSkillQuickTemplates] = useState<{ label: string; prompt: string }[]>([]);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ai_distill_model') || 'claude-opus-5';
    }
    return 'claude-opus-5';
  });
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'guide'>('editor');
  const [isDistilling, setIsDistilling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const savedDistill = localStorage.getItem('ai_distill_model');
      if (savedDistill) setSelectedModel(savedDistill);
    }
  }, [isOpen]);

  // 执行 AI 提炼
  const runAiDistillation = async (context: string, modelId: string) => {
    setIsDistilling(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          historyLimit: 10,
          systemPrompt: `你是世界顶级 AI Prompt 架构师与系统设计师（使用 ${modelId} 深度推理引擎）。
你的核心任务是：从用户与 AI 的多轮交互对话中，分析用户沉淀出来的核心业务意图、生图提示词策略、分镜数量对齐铁律、垫图绑定规则与输出排版，提炼并重构为一份高标准、严密、可复用且具备【智能自适应向导执行流】的【Skill 完整技能配置】。
提炼出的 systemPrompt 必须默认要求「生图提示词正文使用简体中文」（除非用户明确要求英文），禁止再写死「必须输出英文 Midjourney 提示词」。

请务必只输出以下纯 JSON 代码块，严禁包含任何前缀闲聊或 Markdown 说明：
\`\`\`json
{
  "name": "提炼出的简短技能名称 (如：极简留白美妆摄影)",
  "badge": "4-8字特点标签 (如：1:1保真 · 柔光高透)",
  "description": "一句话技能简介",
  "greeting": "激活该技能时的专属开场向导语 (如：已为您激活【...】技能！您可以直接丢入商品图与卖点，或点击下方快捷指令进行填空。)",
  "inputRequirements": [
    "① 上传商品主体底图 (将自动作为图1垫图)",
    "② 描述核心卖点与构图氛围",
    "③ 指定生成分镜数量 (默认6张)"
  ],
  "quickTemplates": [
    { "label": "📸 快速生成6张商拍分镜", "prompt": "请基于我上传的商品图，输出一套包含全景、特写、场景、细节的 6 张电商摄影分镜。" },
    { "label": "✨ 提炼商品核心视觉卖点", "prompt": "请帮我分析该商品的视觉特点与材质，并规划 6 个爆款分镜方案。" }
  ],
  "systemPrompt": "完整的 System Prompt 内容，必须包含【角色定位】、【核心执行铁律】（如1:1数量对齐、图1主商品锚定垫图）与【标准结构化输出格式】（如 #### 📸 第N张: [标题] 与 > [简体中文生图提示词]）。默认要求生图提示词用简体中文书写，除非用户指定英文。"
}
\`\`\``,
          messages: [
            {
              role: 'user',
              content: `请帮我提炼以下对话为高质量 Skill：\n\n${context}`
            }
          ]
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'AI 提炼失败，请重试');
      }

      // 🌟 记录提炼模型调用
      const estPromptTokens = Math.max(100, Math.round(context.length / 2.5));
      const estCompletionTokens = Math.max(50, Math.round((data.reply?.length || 500) / 2.5));
      recordModelUsage({
        modelId: modelId,
        modelName: modelId,
        provider: modelId.includes('claude') ? 'Anthropic' : (modelId.includes('gemini') ? 'Google' : 'OpenAI'),
        type: 'distill',
        promptTokens: estPromptTokens,
        completionTokens: estCompletionTokens,
        totalTokens: estPromptTokens + estCompletionTokens,
        success: true
      });

      const replyContent = (data.reply || data.content || '').trim();
      let parsedJson: any = null;
      try {
        const jsonMatch = replyContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || replyContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const rawStr = jsonMatch[1] || jsonMatch[0];
          parsedJson = JSON.parse(rawStr);
        }
      } catch (e) {
        console.warn('[Skill提炼] JSON 提取容错:', e);
      }

      if (parsedJson && parsedJson.name && parsedJson.systemPrompt) {
        setSkillName(parsedJson.name);
        setSkillBadge(parsedJson.badge || 'Claude 提炼');
        setSkillDesc(parsedJson.description || '由 Claude Opus 5 深度提炼的专属技能');
        setSkillGreeting(parsedJson.greeting || `已为您激活【${parsedJson.name}】技能！您可以直接丢入商品素材，或点击快捷指令填空。`);
        setSkillRequirements(Array.isArray(parsedJson.inputRequirements) && parsedJson.inputRequirements.length > 0 ? parsedJson.inputRequirements : [
          '① 上传商品主体实物图 (将作为所有分镜的固定垫图)',
          '② 描述您的核心卖点与画面氛围',
          '③ 直接发送，AI 秒级输出全套可批量生图的分镜卡片'
        ]);
        setSkillQuickTemplates(Array.isArray(parsedJson.quickTemplates) && parsedJson.quickTemplates.length > 0 ? parsedJson.quickTemplates : [
          { label: '📸 快速生成6张商拍分镜', prompt: '请根据我提供的素材，输出一套标准 6 机位高清电商摄影分镜方案。' },
          { label: '✨ 视觉卖点与氛围延展', prompt: '请以图1为主商品，围绕核心卖点规划 6 个不同场景机位。' }
        ]);
        setSystemPrompt(parsedJson.systemPrompt);
      } else {
        const fallbackPrompt = replyContent && !replyContent.startsWith('{') 
          ? replyContent.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim()
          : `你是专业的电商商业摄影导演与 AI 视觉架构师。
【核心执行铁律】：
1. 数量严格对齐：无论用户要求生成几张分镜，必须严格输出对应数量的分镜（默认输出 6 张）。
2. 图1主商品垫图：【图1】永远固定为主商品实物，所有输出的分镜提示词必须严格基于图1商品主体，严禁改变外观与品牌。
3. 标准结构化输出格式协议：
#### 📸 第1张: [分镜场景说明]
> [简体中文高质量 Midjourney/GPT-Image 商业摄影提示词，包含柔光棚拍、8k、真实光影细节参数 --ar 3:4 --style raw --v 6.0]`;

        setSkillName(parsedJson?.name || '✨ 3C测评与爆款商拍定制 Skill');
        setSkillBadge(parsedJson?.badge || 'Claude 提炼');
        setSkillDesc(parsedJson?.description || '根据本次与 AI 助手的多轮对话需求与规则提炼出的专属技能。');
        setSkillGreeting(parsedJson?.greeting || '已为您激活此专属定制技能！您可以直接提供物料或直接提问。');
        setSkillRequirements([
          '① 上传商品主体实物图 (将作为所有分镜的固定垫图)',
          '② 描述您的核心卖点与画面氛围',
          '③ 直接发送，AI 秒级输出全套可批量生图的分镜卡片'
        ]);
        setSkillQuickTemplates([
          { label: '📸 快速生成6张商拍分镜', prompt: '请根据我提供的素材，输出一套标准 6 机位高清电商摄影分镜方案。' },
          { label: '✨ 视觉卖点与氛围延展', prompt: '请以图1为主商品，围绕核心卖点规划 6 个不同场景机位。' }
        ]);
        setSystemPrompt(parsedJson?.systemPrompt || fallbackPrompt);
      }
    } catch (err: any) {
      console.error('提炼失败:', err);
      setErrorMsg(err.message || 'AI 提炼异常，已为您填入基础配置');
      
      // 容灾保底：确保 System Prompt 绝不留空
      setSkillName('✨ 3C测评与爆款商拍定制 Skill');
      setSkillBadge('智能提炼');
      setSkillDesc('根据本次与 AI 助手的多轮对话需求与规则提炼出的专属技能。');
      setSkillGreeting('已为您激活此专属定制技能！您可以直接提供物料或直接提问。');
      setSkillRequirements([
        '① 上传商品主体实物图 (将作为所有分镜的固定垫图)',
        '② 描述您的核心卖点与画面氛围',
        '③ 直接发送，AI 秒级输出全套可批量生图的分镜卡片'
      ]);
      setSkillQuickTemplates([
        { label: '📸 快速生成6张商拍分镜', prompt: '请根据我提供的素材，输出一套标准 6 机位高清电商摄影分镜方案。' },
        { label: '✨ 视觉卖点与氛围延展', prompt: '请以图1为主商品，围绕核心卖点规划 6 个不同场景机位。' }
      ]);
      setSystemPrompt(`你是专业的商业摄影视觉导演与 AI 提示词架构师。
【核心执行铁律】：
1. 数量严格对齐：无论用户要求生成几张，必须严格输出对应数量的分镜（默认6张）。
2. 图1主商品垫图：【图1】永远固定为主商品实物，所有输出的分镜提示词必须严格基于图1商品主体，严禁改变外观与品牌。
3. 结构化输出规范：
#### 📸 第1张: [分镜场景说明]
> [简体中文高质量 Midjourney/GPT-Image 商业摄影提示词，包含柔光棚拍、8k、真实光影细节参数 --ar 3:4 --style raw --v 6.0]`);
    } finally {
      setIsDistilling(false);
    }
  };

  const handleAiOptimizePrompt = async () => {
    if (!systemPrompt.trim() && !skillName.trim()) {
      setErrorMsg('请先输入简要的技能想法或提示词，AI 即可帮您深度润色');
      return;
    }
    const currentContext = `技能名称: ${skillName || '未命名'}\n技能描述: ${skillDesc || ''}\n现有提示词/规则草稿:\n${systemPrompt}`;
    await runAiDistillation(currentContext, selectedModel);
  };

  useEffect(() => {
    if (initialSkill) {
      setSkillName(initialSkill.name);
      setSkillDesc(initialSkill.description);
      setSkillBadge(initialSkill.badge || '');
      setSkillGreeting(initialSkill.greeting || `已为您激活【${initialSkill.name}】技能！您可以直接提供物料或直接提问。`);
      setSkillRequirements(initialSkill.inputRequirements || [
        '① 上传商品主体实物图 (将作为所有分镜的固定垫图)',
        '② 描述您的核心卖点与画面氛围',
        '③ 直接发送，AI 秒级输出全套可批量生图的分镜卡片'
      ]);
      setSkillQuickTemplates(initialSkill.quickTemplates || [
        { label: '📸 快速生成6张商拍分镜', prompt: '请根据我提供的素材，输出一套标准 6 机位高清电商摄影分镜方案。' },
        { label: '✨ 视觉卖点与氛围延展', prompt: '请以图1为主商品，围绕核心卖点规划 6 个不同场景机位。' }
      ]);
      setSystemPrompt(initialSkill.systemPrompt);
    } else if (distillContext) {
      setSkillName('✨ 正在使用 Claude 提炼...');
      setSkillDesc('正在分析对话规则...');
      setSkillBadge('Claude 提炼中');
      setSkillGreeting('');
      setSkillRequirements([]);
      setSkillQuickTemplates([]);
      setSystemPrompt('Claude 正在深度提炼系统提示词中...');
      runAiDistillation(distillContext, selectedModel);
    } else {
      setSkillName('');
      setSkillDesc('');
      setSkillBadge('');
      setSkillGreeting('');
      setSkillRequirements([]);
      setSkillQuickTemplates([]);
      setSystemPrompt('');
    }
    setErrorMsg(null);
  }, [initialSkill, distillContext, isOpen]);

  if (!isOpen) return null;

  const handleApplyTemplate = (tpl: typeof SKILL_TEMPLATES[0]) => {
    setSkillName(tpl.name);
    setSkillDesc(tpl.desc);
    setSkillBadge(tpl.badge);
    setSkillGreeting(`已为您激活【${tpl.name}】技能！您可以直接丢入商品物料，或点击下方快捷指令进行创作。`);
    setSkillRequirements([
      '① 上传商品主体实物图 (将作为所有分镜的固定垫图)',
      '② 描述您的核心卖点与画面氛围',
      '③ 直接发送，AI 秒级输出全套可批量生图的分镜卡片'
    ]);
    setSkillQuickTemplates([
      { label: '📸 快速生成6张商拍分镜', prompt: '请根据我提供的素材，输出一套标准 6 机位高清电商摄影分镜方案。' },
      { label: '✨ 视觉卖点与氛围延展', prompt: '请以图1为主商品，围绕核心卖点规划 6 个不同场景机位。' }
    ]);
    setSystemPrompt(tpl.prompt);
  };

  const handleSave = () => {
    if (!skillName.trim()) {
      setErrorMsg('请输入技能名称');
      return;
    }
    if (!systemPrompt.trim()) {
      setErrorMsg('请输入核心 System Prompt / 提示词指令');
      return;
    }

    const newSkill: AssistantSkill = {
      id: initialSkill?.id || `custom-skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: skillName.trim(),
      description: skillDesc.trim() || '用户自定义编写的专属 Skill',
      badge: skillBadge.trim() || '自定义',
      greeting: skillGreeting.trim() || `已为您激活【${skillName.trim()}】技能！您可以直接提供物料或直接提问。`,
      inputRequirements: skillRequirements.length > 0 ? skillRequirements : [
        '① 上传商品主体实物图 (将作为所有分镜的固定垫图)',
        '② 描述您的核心卖点与画面氛围',
        '③ 直接发送，AI 秒级输出全套可批量生图的分镜卡片'
      ],
      quickTemplates: skillQuickTemplates.length > 0 ? skillQuickTemplates : [
        { label: '📸 快速生成6张商拍分镜', prompt: '请根据我提供的素材，输出一套标准 6 机位高清电商摄影分镜方案。' },
        { label: '✨ 视觉卖点与氛围延展', prompt: '请以图1为主商品，围绕核心卖点规划 6 个不同场景机位。' }
      ],
      systemPrompt: systemPrompt.trim(),
      iconType: 'custom',
      isCustom: true,
      createdAt: initialSkill?.createdAt || Date.now()
    };

    onSaveSkill(newSkill);
    onClose();
  };

  const currentModelObj = DISTILL_MODELS.find(m => m.id === selectedModel) || DISTILL_MODELS[0];

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-fade-in pointer-events-auto select-none">
      <div 
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800"
        onClick={e => {
          e.stopPropagation();
          setShowModelDropdown(false);
        }}
      >
        {/* 顶部 Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-orange-500 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-wide flex items-center gap-2">
                <span>{initialSkill ? '编辑自定义 Skill' : distillContext ? '✨ 从当前对话提炼 Skill' : '🛠️ 自行编写自定义 Skill'}</span>
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>由</span>
                <span className="text-red-600 font-bold font-mono">{currentModelObj.shortName}</span>
                <span>深度推理与结构化提炼</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-200/80 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'editor' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                编写技能
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('guide')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'guide' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>编写规范</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 正在提炼中 Loading 态 */}
          {isDistilling && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-red-50 to-orange-50 border border-amber-200 flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>{currentModelObj.shortName} 正在深度解析对话规则与提炼 Prompt...</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  正在自动提取：1:1 分镜数对齐铁律、图1主商品垫图绑定、Markdown 格式协议...
                </div>
              </div>
            </div>
          )}

          {activeTab === 'editor' ? (
            <>
              {/* 提炼模型选择与 AI 润色条 */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-700">提炼/润色引擎：</span>
                  
                  {/* 模型下拉 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowModelDropdown(!showModelDropdown);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold font-mono flex items-center gap-1.5 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                    >
                      <span>{currentModelObj.name}</span>
                      <ChevronDown className="w-3 h-3 opacity-70" />
                    </button>

                    {showModelDropdown && (
                      <div 
                        className="absolute left-0 top-full mt-1.5 w-72 rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 z-60 space-y-1 animate-fade-in text-slate-800"
                        onClick={e => e.stopPropagation()}
                      >
                        {DISTILL_MODELS.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedModel(m.id);
                              setShowModelDropdown(false);
                            }}
                            className={`w-full p-2 rounded-xl text-left text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                              selectedModel === m.id ? 'bg-red-50 text-red-600 font-bold' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <span className="truncate">{m.name}</span>
                            {selectedModel === m.id && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1 text-red-600" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* AI 润色按钮 */}
                <button
                  type="button"
                  disabled={isDistilling}
                  onClick={handleAiOptimizePrompt}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="使用 Claude 自动将现有描述扩充并重构为标准的专业 Skill"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>✨ AI 深度润色 & 结构化</span>
                </button>
              </div>

              {/* 快捷模板一键载入 */}
              {!initialSkill && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                    <span>💡 或选择官方结构化规范模板一键载入：</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {SKILL_TEMPLATES.map((tpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        className="p-2.5 rounded-2xl bg-slate-50 hover:bg-red-50/50 border border-slate-200/80 hover:border-red-300 text-left transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="text-xs font-bold text-slate-900 group-hover:text-red-600 transition-colors truncate">
                          {tpl.name}
                        </div>
                        <div className="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                          {tpl.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 基础信息 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    🏷️ 技能名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="如：极简留白美妆摄影"
                    value={skillName}
                    onChange={e => setSkillName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 focus:border-red-500 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 shadow-2xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    🏷️ 特性标签 (Badge)
                  </label>
                  <input
                    type="text"
                    placeholder="如：1:1 参考图保真 · 4K 高画质"
                    value={skillBadge}
                    onChange={e => setSkillBadge(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 focus:border-red-500 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 shadow-2xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  📝 技能简介描述
                </label>
                <input
                  type="text"
                  placeholder="用一两句话描述该 Skill 的主要用途与特色"
                  value={skillDesc}
                  onChange={e => setSkillDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 focus:border-red-500 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 shadow-2xs"
                />
              </div>

              {/* 核心指令 System Prompt */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-red-500" />
                    <span>核心 System Prompt 指令 / 执行铁律 <span className="text-red-500">*</span></span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {systemPrompt.length} 字
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  在此处定义 AI 的角色定位、参考图绑定规则、输出格式与生图提示词要求。
                </p>
                <textarea
                  rows={9}
                  placeholder="你是专业的商业摄影导演...【核心执行铁律】...【标准结构化输出格式】..."
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-red-500 focus:bg-white font-mono text-xs text-slate-800 outline-none transition-all leading-relaxed placeholder:text-slate-400 resize-y shadow-2xs"
                />
              </div>
            </>
          ) : (
            /* 编写指南说明 */
            <div className="space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="p-4 rounded-2xl bg-red-50/50 border border-red-100 space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-red-500" />
                  <span>使用 Claude Opus 5 编写与提炼高效 Skill 的精髓</span>
                </h4>
                <p className="text-slate-600">
                  Claude Opus 5 拥有极强的逻辑遵从与结构化思维，一个合格的生图或工作流 Skill 通常包含 4 个核心板块：
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>角色定位与专业领域 (Role & Persona)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-7">
                    明确告诉 AI 它是谁，例如：<code className="text-red-700 bg-red-50 px-1 py-0.5 rounded">"你是资深顶级商业电商视觉导演与 AI 生图专家"</code>。
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>核心执行铁律与参考图绑定 (Constraints & Anchors)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-7">
                    规定 1:1 数量对齐（给 N 张出 N 张分镜），并明确<strong>「【图1】为主商品，所有分镜垫图固定绑定图1」</strong>，避免商品主体变形。
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">3</span>
                    <span>结构化输出协议 (Structured Output Format)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-7">
                    系统生图工作台会自动解析 Markdown 语法。只要使用 <code className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded">#### 📸 第N张: [标题]</code> 与 <code className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded">&gt; [提示词]</code>，系统就能自动弹出<strong>「批量生图工作台」</strong>！
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">4</span>
                    <span>从对话中随时提炼 (Continuous Evolution)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-7">
                    平时可以先在日常对话中与 AI 磨合，待 AI 的输出完全符合心意后，点击<strong>「从当前对话提炼 Skill」</strong>，直接调用 Claude Opus 5 将成功经验沉淀为终身复用的技能！
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮区 */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer border border-slate-200 shadow-2xs"
          >
            取消
          </button>

          <button
            type="button"
            disabled={isDistilling}
            onClick={handleSave}
            className="px-5 py-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-bold shadow-md shadow-red-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{initialSkill ? '保存修改并应用' : '保存并应用 Skill'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

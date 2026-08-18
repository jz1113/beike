'use client';
import { useState, useEffect } from 'react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { IMAGE_GEN_MODELS, normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { getModelIcon } from '@/components/common/ModelIcons';
import { 
  Sparkles, 
  X, 
  Check, 
  Image as ImageIcon, 
  Layers, 
  Copy, 
  Wand2, 
  CheckCircle2,
  Trash2, 
  Plus, 
  Loader2,
  ChevronDown,
  Zap,
  CheckCheck,
  UserCheck,
  Ban
} from 'lucide-react';

export interface ParsedShotItem {
  id: string;
  title: string;
  prompt: string;
  aspectRatio: string;
  refImage?: string; // 兼容旧单图字段
  refImages?: string[]; // 🌟 核心：多图参考数组 (支持同时引用两张图片：图1商品 + 图2人物一致性模特)
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shots: ParsedShotItem[];
  availableImages: { url: string; label: string }[]; // 会话中可用的所有参考图
  onGenerateSuccess?: () => void;
}

const COMMON_RATIOS = ['3:4', '1:1', '9:16', '16:9'];

export default function BatchPromptModal({
  isOpen,
  onClose,
  shots: initialShots,
  availableImages,
  onGenerateSuccess
}: Props) {
  const { 
    addBatchHubGenerations, 
    setCurrentView,
    selectedImageGenModel,
    setSelectedImageGenModel,
    selectedQuality,
    setSelectedQuality
  } = useAppStore();

  const [shots, setShots] = useState<ParsedShotItem[]>([]);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 🌟 生图模型与画质选择下拉状态
  const [currentModelId, setCurrentModelId] = useState<string>(selectedImageGenModel || 'gpt-image-2');
  const [currentQuality, setCurrentQuality] = useState<'high' | 'medium' | 'low'>((selectedQuality as any) || 'high');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  useEffect(() => {
    if (selectedImageGenModel) {
      setCurrentModelId(selectedImageGenModel);
    }
  }, [selectedImageGenModel]);

  useEffect(() => {
    if (selectedQuality) {
      setCurrentQuality(selectedQuality);
    }
  }, [selectedQuality]);

  useEffect(() => {
    if (isOpen && initialShots.length > 0) {
      // 🌟 支持同时引用两张图片：默认如果会话中有 2 张图（如商品图 + 模特人物图），自动绑定双图确保人物一致性
      const defaultRefs = availableImages.slice(0, 2).map(img => normalizeImageUrlToStandardJpg(img.url)).filter(Boolean);
      const defaultRef1 = availableImages.length > 0 ? normalizeImageUrlToStandardJpg(availableImages[0].url) : undefined;

      const normalizedShots = initialShots.map((shot, idx) => {
        let finalRefImages: string[] = [];
        if (Array.isArray(shot.refImages) && shot.refImages.length > 0) {
          finalRefImages = shot.refImages.map(normalizeImageUrlToStandardJpg).filter(Boolean);
        } else if (shot.refImage) {
          finalRefImages = [normalizeImageUrlToStandardJpg(shot.refImage)].filter(Boolean);
        } else if (defaultRefs.length >= 2) {
          finalRefImages = defaultRefs;
        } else if (defaultRef1) {
          finalRefImages = [defaultRef1];
        }

        return {
          ...shot,
          refImages: finalRefImages,
          refImage: finalRefImages[0] || undefined,
          title: shot.title || `📸 第 ${idx + 1} 张分镜`
        };
      });
      setShots(normalizedShots);
      setSelectedShotIds(normalizedShots.map(s => s.id));
    }
  }, [isOpen, initialShots, availableImages]);

  if (!isOpen) return null;

  const currentModelConfig = IMAGE_GEN_MODELS.find(m => m.id === currentModelId) || IMAGE_GEN_MODELS[0];

  // 切换生图模型
  const handleSelectModel = (modelId: string) => {
    setCurrentModelId(modelId);
    setSelectedImageGenModel(modelId);
    setShowModelMenu(false);
    showToast(`⚡ 已切换生图引擎为：${IMAGE_GEN_MODELS.find(m => m.id === modelId)?.name}`);
  };

  // 切换画质
  const handleSelectQuality = (quality: 'high' | 'medium' | 'low') => {
    setCurrentQuality(quality);
    setSelectedQuality(quality);
    setShowQualityMenu(false);
  };

  // 勾选/取消单张
  const handleToggleSelect = (id: string) => {
    if (selectedShotIds.includes(id)) {
      setSelectedShotIds(prev => prev.filter(i => i !== id));
    } else {
      setSelectedShotIds(prev => [...prev, id]);
    }
  };

  // 全选 / 取消全选
  const handleSelectAll = () => {
    if (selectedShotIds.length === shots.length) {
      setSelectedShotIds([]);
    } else {
      setSelectedShotIds(shots.map(s => s.id));
    }
  };

  // 🌟 一键将全部待生图分镜统一绑定【图1 (主商品) + 图2 (人物一致性)】双图参考
  const handleApplyImg1AndImg2ToAll = () => {
    if (availableImages.length < 2) return;
    const dualUrls = [
      normalizeImageUrlToStandardJpg(availableImages[0].url),
      normalizeImageUrlToStandardJpg(availableImages[1].url)
    ].filter(Boolean);

    setShots(prev => prev.map(s => ({
      ...s,
      refImages: dualUrls,
      refImage: dualUrls[0] || undefined
    })));
    showToast('✨ 已将所有分镜统一绑定【图1 (主商品) + 图2 (人物一致性)】双图参考！');
  };

  // 一键将全部待生图分镜的垫图统一设为【图1 (主商品)】
  const handleApplyImg1ToAll = () => {
    if (availableImages.length === 0) return;
    const img1Url = normalizeImageUrlToStandardJpg(availableImages[0].url);
    setShots(prev => prev.map(s => ({ 
      ...s, 
      refImages: [img1Url],
      refImage: img1Url 
    })));
    showToast('🖼️ 已将所有分镜的参考图统一设置为【图1 (主商品)】单图参考！');
  };

  // 一键清空所有分镜的参考图 (纯文生图)
  const handleClearAllRefImages = () => {
    setShots(prev => prev.map(s => ({
      ...s,
      refImages: [],
      refImage: undefined
    })));
    showToast('🚫 已将所有分镜切换为纯文生图 (无垫图)！');
  };

  // 一键统一全部选中的分镜画幅比例
  const handleApplyGlobalRatio = (ratio: string) => {
    setShots(prev => prev.map(s => selectedShotIds.includes(s.id) ? { ...s, aspectRatio: ratio } : s));
    showToast(`📐 已将选中的 ${selectedShotIds.length} 组分镜画幅统一为 ${ratio}！`);
  };

  // 修改单张分镜提示词
  const handleUpdatePrompt = (id: string, newPrompt: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, prompt: newPrompt } : s));
  };

  // 🌟 单张分镜切换多图选中/反选状态 (支持同时勾选 图1 + 图2 等多图)
  const handleToggleShotRefImage = (id: string, imgUrl: string) => {
    const cleanUrl = normalizeImageUrlToStandardJpg(imgUrl);
    setShots(prev => prev.map(s => {
      if (s.id !== id) return s;
      const currentList = s.refImages || (s.refImage ? [s.refImage] : []);
      const exists = currentList.includes(cleanUrl);
      const updated = exists ? currentList.filter(u => u !== cleanUrl) : [...currentList, cleanUrl];
      return {
        ...s,
        refImages: updated,
        refImage: updated[0] || undefined
      };
    }));
  };

  // 单张分镜设为无垫图
  const handleClearShotRefImages = (id: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, refImages: [], refImage: undefined } : s));
  };

  // 修改单张比例
  const handleUpdateAspectRatio = (id: string, ratio: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, aspectRatio: ratio } : s));
  };

  // 复制全部选中的提示词
  const handleCopyAllPrompts = () => {
    const selected = shots.filter(s => selectedShotIds.includes(s.id));
    if (selected.length === 0) return;
    const text = selected.map(s => `${s.title}\n${s.prompt}`).join('\n\n');
    navigator.clipboard.writeText(text);
    showToast(`📋 已复制 ${selected.length} 组提示词到剪贴板！`);
  };

  // 单张去生图
  const handleSingleGenerate = (shot: ParsedShotItem) => {
    const cleanRefImages = (shot.refImages && shot.refImages.length > 0)
      ? shot.refImages.map(normalizeImageUrlToStandardJpg).filter(Boolean)
      : (shot.refImage ? [normalizeImageUrlToStandardJpg(shot.refImage)] : []);

    let finalPrompt = shot.prompt.trim();
    if (cleanRefImages.length >= 2) {
      finalPrompt = finalPrompt
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*1\s*\}\}/gi, '@图片1')
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*2\s*\}\}/gi, '@图片2')
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*3\s*\}\}/gi, '@图片3');
    }

    const task: GenerationTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: shot.title || 'AI分镜生成',
      prompt: finalPrompt,
      model: currentModelId,
      size: shot.aspectRatio || '3:4',
      quality: currentQuality,
      referenceImageUrl: cleanRefImages[0] || undefined,
      referenceImages: cleanRefImages.length > 0 ? cleanRefImages : undefined,
      images: cleanRefImages.length > 0 ? cleanRefImages : undefined,
      useReferenceImage: cleanRefImages.length > 0,
      createdAt: Date.now(),
      status: 'IN_PROGRESS',
      progress: '15%'
    };

    addBatchHubGenerations([task]);
    setCurrentView('generate');
    onClose();
    if (onGenerateSuccess) onGenerateSuccess();
  };

  // 一键并发批量启动全部已勾选任务 (完整携带多图 referenceImages 数组与人物一致性)
  const handleBatchStartGenerate = () => {
    const selected = shots.filter(s => selectedShotIds.includes(s.id));
    if (selected.length === 0) {
      showToast('请先勾选至少 1 组提示词');
      return;
    }

    setIsGenerating(true);

    const unifiedBatchId = `batch-multishot-${Date.now()}`;
    const unifiedCreatedAt = Date.now();

    const tasksToCreate: GenerationTask[] = selected.map((shot, idx) => {
      const cleanRefImages = (shot.refImages && shot.refImages.length > 0)
        ? shot.refImages.map(normalizeImageUrlToStandardJpg).filter(Boolean)
        : (shot.refImage ? [normalizeImageUrlToStandardJpg(shot.refImage)] : []);

      let finalPrompt = shot.prompt.trim();
      if (cleanRefImages.length >= 2) {
        finalPrompt = finalPrompt
          .replace(/\{\{\s*(?:Mixed|Image|图)?\s*1\s*\}\}/gi, '@图片1')
          .replace(/\{\{\s*(?:Mixed|Image|图)?\s*2\s*\}\}/gi, '@图片2')
          .replace(/\{\{\s*(?:Mixed|Image|图)?\s*3\s*\}\}/gi, '@图片3');
      }

      return {
        id: `task-${unifiedCreatedAt}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        batchId: unifiedBatchId,
        shotNo: idx + 1,
        title: shot.title || `第 ${idx + 1} 张分镜`,
        prompt: finalPrompt,
        model: currentModelId,
        size: shot.aspectRatio || '3:4',
        quality: currentQuality,
        referenceImageUrl: cleanRefImages[0] || undefined,
        referenceImages: cleanRefImages.length > 0 ? cleanRefImages : undefined,
        images: cleanRefImages.length > 0 ? cleanRefImages : undefined,
        useReferenceImage: cleanRefImages.length > 0,
        createdAt: unifiedCreatedAt + idx,
        status: 'IN_PROGRESS',
        progress: '15%'
      };
    });

    addBatchHubGenerations(tasksToCreate);
    setIsGenerating(false);
    setCurrentView('generate');
    onClose();
    if (onGenerateSuccess) onGenerateSuccess();
  };

  // 导入到 4 步买家秀工坊
  const handleImportToBuyerShow = () => {
    const selected = shots.filter(s => selectedShotIds.includes(s.id));
    if (selected.length === 0) {
      showToast('请先勾选至少 1 组提示词');
      return;
    }

    localStorage.setItem('pending_buyershow_shots', JSON.stringify(selected));
    setCurrentView('buyer_show');
    onClose();
    if (onGenerateSuccess) onGenerateSuccess();
  };

  // 扩展为 6 张全套分镜 (如果当前不足 6 张)
  const handleExpandTo6Shots = () => {
    const defaultRefs = availableImages.slice(0, 2).map(img => normalizeImageUrlToStandardJpg(img.url)).filter(Boolean);
    const full6Shots: ParsedShotItem[] = [
      {
        id: `shot_6_1_${Date.now()}`,
        title: '📸 第1张: 主商品全景/正前方 C 位主视觉',
        prompt: `Hero product photography shot of @图片1 floating gracefully with model @图片2 in pure clean studio setting, ultra realistic, elegant soft shadows, 8k resolution, minimalist luxury aesthetic --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_2_${Date.now()}`,
        title: '📸 第2张: 45° 俯瞰动态光影空间构图',
        prompt: `High-angle 45 degree dynamic commercial photography, product @图片1 held naturally by model @图片2 on sleek minimalist surface with soft warm sun ray reflections and architectural light beams, crisp texture, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_3_${Date.now()}`,
        title: '📸 第3张: 极致微距材质细节/核心特写',
        prompt: `Macro close-up shot focusing on premium material texture of @图片1 with model @图片2 in background, shallow depth of field, delicate studio rim lighting, luxury advertising grade, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_4_${Date.now()}`,
        title: '📸 第4张: 屏幕/功能界面点亮交互展示',
        prompt: `Front interactive view of product @图片1 used by model @图片2 with bright vibrant borderless display UI, crisp flat screen edge, modern workstation desk setup, natural daylight ambiance, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_5_${Date.now()}`,
        title: '📸 第5张: 生活化随身使用/超薄机身侧影',
        prompt: `Minimalist lifestyle commercial shot, model @图片2 holding slim edge profile of @图片1 floating above a textured stone block, subtle rim light, elegant high-end tech vibe, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_6_${Date.now()}`,
        title: '📸 第6张: 场景化模特手持穿搭合影 (总结种草)',
        prompt: `Creative portrait photography, model @图片2 wearing stylish casual outfit smiling naturally and showcasing product @图片1, aesthetic urban cafe background, dynamic soft daylight lighting, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      }
    ];

    setShots(full6Shots);
    setSelectedShotIds(full6Shots.map(s => s.id));
    showToast('🎉 已成功自动扩充为 6 张全套分镜大片！');
  };

  // 手动添加一个新分镜
  const handleAddShot = () => {
    const newIdx = shots.length + 1;
    const defaultRefs = availableImages.slice(0, 2).map(img => normalizeImageUrlToStandardJpg(img.url)).filter(Boolean);
    const newShot: ParsedShotItem = {
      id: `shot_manual_${Date.now()}`,
      title: `📸 第${newIdx}张: 新增分镜`,
      prompt: `商业广告产品实拍图，高清晰度，摄影棚柔光，8k --ar 3:4 --style raw --v 6.0`,
      aspectRatio: '3:4',
      refImages: defaultRefs,
      refImage: defaultRefs[0]
    };
    setShots(prev => [...prev, newShot]);
    setSelectedShotIds(prev => [...prev, newShot.id]);
    showToast(`➕ 已添加第 ${newIdx} 个新分镜`);
  };

  // 删除单张分镜
  const handleDeleteShot = (id: string) => {
    if (shots.length <= 1) {
      showToast('至少保留 1 个分镜');
      return;
    }
    setShots(prev => prev.filter(s => s.id !== id));
    setSelectedShotIds(prev => prev.filter(i => i !== id));
  };

  return (
    <div className="fixed inset-0 z-60 pointer-events-auto flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-3 sm:p-5 animate-fade-in select-none">
      <div 
        className="w-full max-w-5xl bg-white border border-slate-200/90 rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 relative pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 🌟 1. 顶部 Header (视觉升级：更现代的徽标 + 核心配置区) */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-red-50/30 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 via-rose-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-red-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  AI 提取提示词批量生图工作台
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-[11px] font-mono font-bold shadow-2xs">
                  {shots.length} 组分镜就绪
                </span>
                {availableImages.length >= 2 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-amber-600" />
                    <span>支持人物一致性双图参考</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <span>支持同时引用【图1商品 + 图2人物一致性模特】，保持全部分镜人物面部与产品外观高度一致</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 关闭按钮 */}
            <button 
              onClick={onClose} 
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              title="关闭弹窗"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 🌟 2. 核心控制栏：生图模型切换 + 全局画幅比例 + 批量辅助工具 */}
        <div className="px-6 py-3.5 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          {/* 左侧：模型选择器 + 画质选择器 */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 🌟 生图模型下拉切换卡片 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowModelMenu(!showModelMenu);
                  setShowQualityMenu(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs text-xs font-bold text-slate-800 flex items-center gap-2 transition-all cursor-pointer group"
                title="点击选择生图模型引擎"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {getModelIcon(currentModelId, 'w-4 h-4')}
                </div>
                <span>{currentModelConfig.name}</span>
                {currentModelConfig.badge && (
                  <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-mono font-semibold">
                    {currentModelConfig.badge}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform" />
              </button>

              {/* 模型下拉菜单 */}
              {showModelMenu && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-1.5 z-50 space-y-1 animate-fade-in">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    选择出图模型引擎 (AI Generator)
                  </div>
                  {IMAGE_GEN_MODELS.map(m => {
                    const isSelected = m.id === currentModelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectModel(m.id)}
                        className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start justify-between gap-2 cursor-pointer ${
                          isSelected 
                            ? 'bg-red-50/80 text-red-700 border border-red-200/80 shadow-2xs' 
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                            {getModelIcon(m.id, 'w-5 h-5')}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold">{m.name}</span>
                              {m.badge && (
                                <span className="px-1 py-0.2 rounded text-[9px] bg-red-100 text-red-600 font-bold">
                                  {m.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                              {m.description || `${m.provider} 官方旗舰商拍引擎`}
                            </p>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 🌟 画质等级下拉 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowQualityMenu(!showQualityMenu);
                  setShowModelMenu(false);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                title="选择生成画质等级"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  {currentQuality === 'high' ? '4K 超清画质' : currentQuality === 'medium' ? '标准均衡画质' : '极速省流画质'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showQualityMenu && (
                <div className="absolute top-full left-0 mt-2 w-44 bg-white rounded-2xl border border-slate-200 shadow-2xl p-1.5 z-50 space-y-0.5 animate-fade-in text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectQuality('high')}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between cursor-pointer ${
                      currentQuality === 'high' ? 'bg-red-50 text-red-600 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>🌟 4K 超清画质</span>
                    {currentQuality === 'high' && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectQuality('medium')}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between cursor-pointer ${
                      currentQuality === 'medium' ? 'bg-red-50 text-red-600 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>⚡ 标准均衡画质</span>
                    {currentQuality === 'medium' && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* 🌟 一键统一画幅比例胶囊组 */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 px-2 font-medium">统一画幅:</span>
              {COMMON_RATIOS.map(ratio => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => handleApplyGlobalRatio(ratio)}
                  className="px-2 py-1 rounded-lg text-[11px] font-mono text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer"
                  title={`将所有勾选的分镜比例设为 ${ratio}`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：全选与批量辅助 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-slate-200 shadow-2xs"
            >
              <CheckCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>{selectedShotIds.length === shots.length ? '取消全选' : '全部勾选'}</span>
            </button>

            {/* 🌟 一键全部垫【图1商品+图2人物】(高频核心功能) */}
            {availableImages.length >= 2 && (
              <button
                type="button"
                onClick={handleApplyImg1AndImg2ToAll}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95"
                title="将所有分镜同时绑定【图1 (主商品) + 图2 (人物一致性)】双图参考"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>一键垫图1+图2 (人物一致性)</span>
              </button>
            )}

            {/* 一键全部垫图1 (主商品) */}
            {availableImages.length > 0 && (
              <button
                type="button"
                onClick={handleApplyImg1ToAll}
                className="px-3 py-1.5 rounded-xl bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="将所有分镜的参考垫图统一设置为【图1 (主商品)】"
              >
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>一键垫图1</span>
              </button>
            )}

            {/* 一键清空参考垫图 */}
            <button
              type="button"
              onClick={handleClearAllRefImages}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-medium transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
              title="将所有分镜清空垫图，转为纯文生图"
            >
              <Ban className="w-3.5 h-3.5 text-slate-400" />
              <span>清空垫图</span>
            </button>

            {/* 一键扩充为 6 张 */}
            <button
              type="button"
              onClick={handleExpandTo6Shots}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-50 to-orange-50 hover:from-red-100 hover:to-orange-100 text-red-600 border border-red-200/90 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="自动根据商品与人物扩展为 6 张不同机位与场景的分镜大片"
            >
              <Wand2 className="w-3.5 h-3.5 text-red-500" />
              <span>✨ 扩充为 6 张全套</span>
            </button>

            {/* 添加新分镜 */}
            <button
              type="button"
              onClick={handleAddShot}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-medium transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>加分镜</span>
            </button>

            {/* 复制全部提示词 */}
            <button
              type="button"
              onClick={handleCopyAllPrompts}
              className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="复制所有已选分镜提示词"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 🌟 3. 主内容区：提示词分镜卡片列表 (极简纯净现代设计) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 min-h-0 scrollbar-thin bg-slate-50/40">
          <div className="space-y-3.5">
            {shots.map((shot, idx) => {
              const isSelected = selectedShotIds.includes(shot.id);
              const shotIndexStr = String(idx + 1).padStart(2, '0');
              const activeRefImages = (shot.refImages && shot.refImages.length > 0)
                ? shot.refImages
                : (shot.refImage ? [shot.refImage] : []);

              return (
                <div
                  key={shot.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-3.5 shadow-2xs ${
                    isSelected 
                      ? 'bg-white border-red-200 ring-1 ring-red-500/20 shadow-sm' 
                      : 'bg-white/60 border-slate-200/80 opacity-70 hover:opacity-100'
                  }`}
                >
                  {/* 分镜卡片顶部标题与单张快捷操作 */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* 选择框 */}
                      <button
                        type="button"
                        onClick={() => handleToggleSelect(shot.id)}
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                          isSelected 
                            ? 'bg-gradient-to-tr from-red-600 to-orange-500 border-red-600 text-white shadow-xs' 
                            : 'border-slate-300 hover:border-slate-400 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>

                      {/* 序号胶囊 */}
                      <div className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
                        分镜 {shotIndexStr}
                      </div>

                      {/* 标题 */}
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {shot.title || `第 ${idx + 1} 张分镜`}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* 单张快捷生图按钮 */}
                      <button
                        type="button"
                        onClick={() => handleSingleGenerate(shot)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-50 to-orange-50 hover:from-red-100 hover:to-orange-100 text-red-600 border border-red-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs active:scale-95"
                        title={`使用当前模型 [${currentModelConfig.shortName}] 生成此分镜`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-red-500" />
                        <span>单张去生图</span>
                      </button>

                      {/* 删除分镜 */}
                      {shots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteShot(shot.id)}
                          className="p-1.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="删除此分镜"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 提示词输入/编辑区 */}
                  <div className="relative">
                    <textarea
                      value={shot.prompt}
                      onChange={e => handleUpdatePrompt(shot.id, e.target.value)}
                      rows={3}
                      className="w-full p-3 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 text-xs text-slate-800 focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none resize-none font-mono leading-relaxed transition-all shadow-2xs"
                      placeholder="输入生图提示词..."
                    />
                    <div className="absolute right-2.5 bottom-2 text-[10px] text-slate-400 font-mono pointer-events-none">
                      {shot.prompt.length} 字符
                    </div>
                  </div>

                  {/* 🌟 核心：参考垫图与画幅配置栏 (支持多图勾选、双图人物一致性绑定) */}
                  <div className="flex items-center justify-between gap-4 pt-0.5 text-xs text-slate-500 flex-wrap">
                    {/* 参考垫图绑定选择 */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mr-1">
                        <ImageIcon className="w-3.5 h-3.5 text-red-500" />
                        <span>参考垫图:</span>
                      </span>

                      {/* 选项：无垫图 */}
                      <button
                        type="button"
                        onClick={() => handleClearShotRefImages(shot.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border shadow-2xs ${
                          activeRefImages.length === 0 
                            ? 'bg-slate-900 text-white font-bold border-slate-900 shadow-xs' 
                            : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
                        }`}
                      >
                        无垫图
                      </button>

                      {/* 选项：会话中的全部可用参考图 (多选切换) */}
                      {availableImages.map((img, imgIdx) => {
                        const cleanImgUrl = normalizeImageUrlToStandardJpg(img.url);
                        const isRef = activeRefImages.includes(cleanImgUrl);
                        const isMainProduct = imgIdx === 0;
                        const isModelConsistency = imgIdx === 1;
                        const refOrderIndex = activeRefImages.indexOf(cleanImgUrl);

                        return (
                          <button
                            key={imgIdx}
                            type="button"
                            onClick={() => handleToggleShotRefImage(shot.id, cleanImgUrl)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border shadow-2xs ${
                              isRef 
                                ? 'bg-gradient-to-r from-red-50 to-orange-50 text-red-700 border-red-300 font-bold ring-1 ring-red-400/40 shadow-xs' 
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                            }`}
                            title={`点击切换勾选该图。已选模式下将在提示词中作为 @图片${refOrderIndex >= 0 ? refOrderIndex + 1 : imgIdx + 1} 参与渲染`}
                          >
                            <div className="relative w-4 h-4 rounded overflow-hidden flex-shrink-0 bg-slate-100">
                              <img src={cleanImgUrl} alt="" className="w-full h-full object-cover" />
                              {isRef && (
                                <div className="absolute inset-0 bg-red-600/20 flex items-center justify-center">
                                  <span className="text-[9px] text-white font-bold drop-shadow-xs">✓</span>
                                </div>
                              )}
                            </div>
                            <span>
                              {img.label || `图${imgIdx + 1}`}
                            </span>
                            {isRef && refOrderIndex >= 0 && (
                              <span className="px-1 py-0.2 rounded-xs bg-red-600 text-white text-[9px] font-mono font-black">
                                @图{refOrderIndex + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {/* 快捷双图按钮 (当有 >= 2 张图片且当前未选满双图时) */}
                      {availableImages.length >= 2 && activeRefImages.length !== 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const dualUrls = [
                              normalizeImageUrlToStandardJpg(availableImages[0].url),
                              normalizeImageUrlToStandardJpg(availableImages[1].url)
                            ].filter(Boolean);
                            setShots(prev => prev.map(s => s.id === shot.id ? { ...s, refImages: dualUrls, refImage: dualUrls[0] } : s));
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="一键将当前分镜设为同时引用图1+图2"
                        >
                          <UserCheck className="w-3 h-3 text-amber-600" />
                          <span>一键双图</span>
                        </button>
                      )}
                    </div>

                    {/* 比例选择 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">画幅:</span>
                      {COMMON_RATIOS.map(ratio => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => handleUpdateAspectRatio(shot.id, ratio)}
                          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer border shadow-2xs ${
                            shot.aspectRatio === ratio 
                              ? 'bg-red-600 border-red-600 text-white font-bold shadow-xs' 
                              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 🌟 多图参考提示条 (当选中 >= 2 张图时显示直观提示) */}
                  {activeRefImages.length >= 2 && (
                    <div className="px-3 py-1.5 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between text-[11px] text-amber-800 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <span className="font-bold flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          <span>已启用多图协同融合：</span>
                        </span>
                        <span>@图片1 与 @图片2 将协同生图（保持人物面容与产品特征一致）</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activeRefImages.map((u, i) => (
                          <img key={i} src={u} alt="" className="w-5 h-5 rounded-md object-cover border border-amber-300" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 🌟 4. 底部批量执行控制条 (高质感磨砂底栏) */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-white/95 backdrop-blur-md flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>已勾选 <strong className="text-slate-900 font-mono text-sm">{selectedShotIds.length}</strong> / {shots.length} 组分镜</span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1 text-slate-600">
              <span>出图引擎:</span>
              <strong className="text-slate-800 font-bold">{currentModelConfig.shortName}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 导入到买家秀工坊 */}
            <button
              type="button"
              onClick={handleImportToBuyerShow}
              className="px-4 py-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-2xs active:scale-95"
            >
              <Layers className="w-4 h-4 text-purple-600" />
              <span>导入 4 步买家秀工坊</span>
            </button>

            {/* 一键批量并发开始生图 */}
            <button
              type="button"
              onClick={handleBatchStartGenerate}
              disabled={isGenerating || selectedShotIds.length === 0}
              className="px-7 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 via-rose-500 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-red-500/25 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>批量开始生成 ({selectedShotIds.length}张)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-70 px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl animate-fade-in flex items-center gap-2 border border-white/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

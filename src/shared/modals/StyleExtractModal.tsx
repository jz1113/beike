'use client';
import { getGatewayClientOverrides } from '@/lib/gatewayClient';
import {apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { formatUserError } from '@/lib/upstreamErrors';
import { 
  X, 
  Sparkles, 
  Link as LinkIcon, 
  UploadCloud, 
  Globe, 
  Wand2, 
  Loader2, 
  Check, 
  Copy, 
  Layers, 
  Sliders, 
  BookmarkCheck,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  Info,
  Cpu,
  ChevronDown
} from 'lucide-react';
import { STYLE_PRESETS, DEFAULT_CATEGORIES, getMergedCategories, CategoryItem } from '@/lib/vision';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import CategoryManagerModal from './CategoryManagerModal';

// 🌟 高性能隔离渲染瓦片 (React.memo 杜绝多图频繁重渲染导致的卡顿)
const ImageGridTile = memo(function ImageGridTile({
  img,
  isChosen,
  idx,
  onToggle
}: {
  img: string;
  isChosen: boolean;
  idx: number;
  onToggle: (img: string) => void;
}) {
  return (
    <div
      onClick={() => onToggle(img)}
      style={{ contain: 'layout paint' }}
      className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-150 group bg-slate-100/80 ${
        isChosen 
          ? 'border-indigo-600 ring-2 ring-indigo-500/25 shadow-md scale-[0.98]' 
          : 'border-slate-200/80 hover:border-indigo-400 hover:shadow-sm'
      }`}
    >
      <img 
        src={img} 
        alt="" 
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" 
      />
      <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
        isChosen 
          ? 'bg-indigo-600 text-white shadow-md' 
          : 'bg-black/40 text-transparent group-hover:bg-black/60 group-hover:text-white/60'
      }`}>
        <Check className="w-3 h-3 stroke-[3]" />
      </div>
      <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/60 text-white text-[9px] font-mono pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        #{idx + 1}
      </span>
    </div>
  );
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRecipeCreated?: (recipe: any) => void;
}

export default function StyleExtractModal({ isOpen, onClose, onRecipeCreated }: Props) {
  // 图源提前选择 Tab
  const [sourceType, setSourceType] = useState<'link' | 'upload' | 'url'>('link');
  
  // 社媒链接输入与解析
  const [linkInput, setLinkInput] = useState('');
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [parsedPostTitle, setParsedPostTitle] = useState('');
  const [parsedImages, setParsedImages] = useState<string[]>([]);
  
  // URL 直传输入
  const [urlInput, setUrlInput] = useState('');
  
  // 选中的最终参考图列表 (1~8 张黄金参考集)
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(24);
  
  // AI 逆向状态
  const [extractModel, setExtractModel] = useState<string>('gemini-3.1-pro-preview-thinking-high');
  const [multimodalModels, setMultimodalModels] = useState<Array<{ id: string; name: string }>>([
    { id: 'gemini-3.1-pro-preview-thinking-high', name: 'Gemini 3.1 Pro (深度思考 - 首选)' },
    { id: 'gpt-4o', name: 'GPT-4o (旗舰多模态)' },
    { id: 'grok-4.6', name: 'Grok 4.6 (反AI纪实)' },
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (极速推理)' },
    { id: 'claude-opus-5', name: 'Claude Opus 5 (顶级推理)' },
    { id: 'gpt-5.5-pro', name: 'GPT 5.5 Pro (综合旗舰)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (轻量极速)' }
  ]);
  const [userHint, setUserHint] = useState('');
  const [extractStepText, setExtractStepText] = useState('⚡ 正在提取并对齐图集特征...');

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      const saved = localStorage.getItem('custom_models');
      let list: Array<{ id: string; name: string }> = [];
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            list = parsed
              .filter((m: any) => m.isMultimodal || m.isVision || (!m.isImage && !m.isVideo))
              .map((m: any) => ({ id: m.id, name: m.name || m.id }));
            if (list.length > 0) {
              setMultimodalModels(list);
            }
          }
        } catch (e) {}
      }
      const defaultM = localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model');
      if (defaultM) {
        setExtractModel(defaultM);
      } else if (list.length > 0) {
        setExtractModel(list[0].id);
      }
    }
  }, [isOpen]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedRecipe, setExtractedRecipe] = useState<{
    name: string;
    category: string;
    tag: string;
    desc: string;
    has_human?: boolean;
    subject_type?: string;
    model_persona?: string;
    promptSnippet: string;
    architecture?: {
      role_definition?: string;
      structure_steps?: Array<{
        step_no?: number;
        title?: string;
        rule?: string;
      }>;
      prompt_formula?: string;
      anti_ai_rules?: string;
      spatial?: string;
      lighting?: string;
      props?: string;
      optics?: string;
      productSlot?: string;
    } | null;
    storyboardTemplates?: Array<{
      shot_no: number;
      title: string;
      has_human?: boolean;
      shot_type?: string;
      template: string;
    }> | null;
  } | null>(null);

  // 归属品类列表与新建品类状态
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 剪贴板 Ctrl+V / Command+V 图片直接粘贴支持
  useEffect(() => {
    if (!isOpen) return;
    setCategories(getMergedCategories());

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            compressImageFile(file).then(url => {
              if (url) {
                setSelectedImages(prev => Array.from(new Set([...prev, url])));
                showToast('🎉 已成功从剪贴板粘贴图片素材！');
              }
            });
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const handleCreateNewCategory = () => {
    if (!newCategoryName.trim()) {
      alert('请输入新商品类目名称');
      return;
    }
    const name = newCategoryName.trim();
    const id = `cat_${Date.now()}`;
    const newCat: CategoryItem = {
      id,
      name: name.startsWith('🏷️') || name.startsWith('📦') || name.startsWith('⛺') || name.startsWith('🚗') || name.startsWith('🎮') ? name : `🏷️ ${name}`,
      isCustom: true
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    localStorage.setItem('custom_categories', JSON.stringify(updated));
    if (extractedRecipe) {
      setExtractedRecipe({ ...extractedRecipe, category: id });
    }
    setIsCreatingCategory(false);
    setNewCategoryName('');
    showToast(`✨ 成功创建新类目【${newCat.name}】！`);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // 高性能轻量化本地图片压缩工具 (限制最大边长 1024px，避免 base64 暴涨导致渲染卡死)
  const compressImageFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = e.target?.result as string;
        if (!raw) return resolve('');
        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolve(raw);
          }
        };
        img.onerror = () => resolve(raw);
        img.src = raw;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // 智能均匀采样最具代表性的 6~8 张核心参考图 (黄金比例，提炼更准更快)
  const handleAutoSelectKeyShots = useCallback((imagesToPick = parsedImages) => {
    if (!imagesToPick || imagesToPick.length === 0) return;
    const targetCount = Math.min(8, Math.max(4, Math.ceil(imagesToPick.length / 4)));
    const step = Math.max(1, Math.floor(imagesToPick.length / targetCount));
    const picked: string[] = [];
    for (let i = 0; i < imagesToPick.length && picked.length < targetCount; i += step) {
      picked.push(imagesToPick[i]);
    }
    setSelectedImages(picked);
    showToast(`✨ 已智能精选 ${picked.length} 张核心代表图（AI 提炼黄金数量）！`);
  }, [parsedImages]);

  // 极速 O(1) 切换单张图片勾选
  const handleToggleImage = useCallback((img: string) => {
    setSelectedImages(prev => {
      if (prev.includes(img)) {
        return prev.filter(i => i !== img);
      } else {
        return [...prev, img];
      }
    });
  }, []);

  // 1. 社媒链接一键/批量解析 (支持多行同时解析)
  const handleParseLink = async () => {
    const lines = linkInput
      .split(/[\n\r]+/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      showToast('请粘贴小红书/抖音分享链接或文本');
      return;
    }

    setIsParsingLink(true);
    try {
      const localScraperId = localStorage.getItem('external_scraper_id');

      // 并发请求解析所有链接
      const promises = lines.map(line =>
        apiFetch('/api/catalog/styles/parse-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            url: line,
            text: line,
            customScraperId: localScraperId || undefined,
          })
        }).then(res => res.json())
      );

      const results = await Promise.allSettled(promises);
      const allExtractedImages: string[] = [];
      const successfulTitles: string[] = [];
      let failCount = 0;
      let lastErr = '';

      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value?.success) {
          const imgs = Array.isArray(res.value.images) && res.value.images.length > 0
            ? res.value.images
            : (res.value.cover ? [res.value.cover] : []);
          if (imgs.length > 0) {
            allExtractedImages.push(...imgs);
          }
          if (res.value.title) {
            successfulTitles.push(res.value.title);
          }
        } else {
          failCount++;
          if (res.status === 'fulfilled' && res.value?.error) {
            lastErr = res.value.error;
          }
        }
      });

      const uniqueImages = Array.from(new Set(allExtractedImages));

      if (uniqueImages.length > 0) {
        setParsedPostTitle(
          successfulTitles.length > 1
            ? `批量已解析 ${successfulTitles.length} 篇笔记（${successfulTitles[0]} 等）`
            : (successfulTitles[0] || '小红书/抖音图集')
        );
        setParsedImages(uniqueImages);
        setVisibleCount(24);
        
        // 🌟 智能优选前 6~8 张作为初始勾选（杜绝 100+ 图全选造成的 DOM/内存卡顿与 AI 请求超载）
        const autoPickCount = Math.min(8, Math.max(4, Math.min(uniqueImages.length, successfulTitles.length || 6)));
        const defaultPicked = uniqueImages.slice(0, autoPickCount);
        setSelectedImages(defaultPicked);

        if (failCount > 0) {
          showToast(`🎉 成功提取 ${successfulTitles.length} 条链接（共 ${uniqueImages.length} 张图，已智能优选 ${defaultPicked.length} 张），${failCount} 条解析失败`);
        } else {
          showToast(`🎉 成功解析全部 ${lines.length} 条链接（共 ${uniqueImages.length} 张图，已智能优选 ${defaultPicked.length} 张核心参考图）！`);
        }
      } else {
        throw new Error(lastErr || '未能从所填链接中提取到有效图片');
      }
    } catch (e: any) {
      alert(formatUserError(e, '社媒链接解析超时，请直接手动上传截图'));
    } finally {
      setIsParsingLink(false);
    }
  };

  // 2. 本地图片文件选择 (自动轻量压缩)
  const ingestStyleImages = useCallback(async (files: File[]) => {
    const promises = files.map((file) => compressImageFile(file));
    const urls = await Promise.all(promises);
    const validUrls = urls.filter(Boolean);
    if (validUrls.length > 0) {
      setSelectedImages((prev) => Array.from(new Set([...prev, ...validUrls])));
      showToast(`🎉 成功添加 ${validUrls.length} 张高清参考图！`);
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await ingestStyleImages(Array.from(files));
  };

  const { dropZoneProps: styleUploadDropProps } = useFileDropZone({
    onFiles: (files) => {
      void ingestStyleImages(files);
    },
    accept: (file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name),
  });

  // 3. 网络 URL 直传
  const handleAddUrls = () => {
    if (!urlInput.trim()) return;
    const urls = urlInput.split('\n').map(u => u.trim()).filter(u => u.startsWith('http://') || u.startsWith('https://'));
    if (urls.length === 0) {
      showToast('请输入合法的 http/https 图片直链');
      return;
    }
    setSelectedImages(prev => Array.from(new Set([...prev, ...urls])));
    setUrlInput('');
    showToast(`🎉 成功添加 ${urls.length} 个图片直链！`);
  };

  // 4. 启动 AI 视觉逆向解构 (全自动旗舰多模态视觉链路，智能精简采样避免大 Payload 超时)
  const handleStartExtract = async () => {
    if (selectedImages.length === 0) {
      showToast('请至少提供 1 张参考图');
      return;
    }

    setIsExtracting(true);
    setExtractStepText('⚡ 正在提取并对齐图集特征...');
    const t1 = setTimeout(() => setExtractStepText('🎨 正在解构空间置景与光影色调...'), 1200);
    const t2 = setTimeout(() => setExtractStepText('✨ 正在封装品类专属生图配方...'), 2800);

    // 全量多图分析：完整传递所有选中的参考图片（支持数十至上百张并发分片深度解构）
    const imagesToSend = selectedImages;
    const { customBaseUrl: localUrl } = getGatewayClientOverrides();

    try {
      const res = await apiFetch('/api/catalog/styles/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: imagesToSend,
          userHint: userHint.trim(),
          model: extractModel,
          customBaseUrl: localUrl,
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '风格提炼失败');
      }

      setExtractedRecipe(data.recipe);
      showToast('🎉 AI 风格逆向解构完成！');
    } catch (e: any) {
      alert(formatUserError(e, 'AI 逆向提炼超时，请重试'));
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setIsExtracting(false);
    }
  };

  // 5. 保存至品类配方库
  const handleSaveRecipe = async () => {
    if (!extractedRecipe || !extractedRecipe.name || !extractedRecipe.promptSnippet) {
      showToast('请完善配方名称与提示词内容');
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiFetch('/api/catalog/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: extractedRecipe.name,
          category: extractedRecipe.category,
          tag: extractedRecipe.tag,
          desc: extractedRecipe.desc,
          has_human: extractedRecipe.has_human,
          subject_type: extractedRecipe.subject_type,
          model_persona: extractedRecipe.model_persona,
          promptSnippet: extractedRecipe.promptSnippet,
          coverUrl: selectedImages[0] || '',
          sampleImages: selectedImages.slice(0, 10),
          sourceUrl: linkInput
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存失败');
      }

      showToast('🎉 配方已成功存入本地资产库！');
      if (onRecipeCreated) {
        onRecipeCreated(data.recipe);
      }
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (e: any) {
      alert(formatUserError(e, '保存配方失败'));
    } finally {
      setIsSaving(false);
    }
  };

  // 选中的 Set 集合，用于 O(1) 毫秒级极速状态判断
  const selectedSet = useMemo(() => new Set(selectedImages), [selectedImages]);
  const detectedLinkCount = useMemo(() => {
    return linkInput.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean).length;
  }, [linkInput]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-6 animate-fade-in select-none">
      <div 
        className="w-full max-w-4xl bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                提示词架构推理实验室
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  Prompt Architecture Inference
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                深度解构参考图集的置景光影与摄影机位，沉淀为该品类专属的通用提示词生成架构
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center cursor-pointer"
            title="关闭窗口"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
          {/* Step 1: 参考图源渠道选择 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                选择参考图源渠道
              </span>
              <span className="text-[11px] text-slate-400 font-mono">已选 {selectedImages.length} 张参考图</span>
            </div>

            {/* 3 Channel Segmented Switcher */}
            <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200/80">
              <button
                onClick={() => setSourceType('link')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  sourceType === 'link'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>小红书 / 抖音链接解析</span>
              </button>

              <button
                onClick={() => setSourceType('upload')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  sourceType === 'upload'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>本地多图直接上传</span>
              </button>

              <button
                onClick={() => setSourceType('url')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  sourceType === 'url'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>网络图片 URL 导入</span>
              </button>
            </div>

            {/* Panel Content for Link Scraper */}
            {sourceType === 'link' && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-700">
                      粘贴小红书 / 抖音笔记分享链接（支持多行批量导入，每行一条）：
                    </div>
                    {detectedLinkCount > 0 && (
                      <div className="text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-2.5 py-0.5 rounded-full">
                        已输入 {detectedLinkCount} 条链接
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
                    <div className="relative flex-1">
                      <textarea
                        wrap="off"
                        rows={Math.max(2, Math.min(detectedLinkCount || 2, 6))}
                        value={linkInput}
                        onChange={e => setLinkInput(e.target.value)}
                        placeholder={`支持导入多条链接（每行一条链接，长链接保持单行不换行）：\nhttps://www.xiaohongshu.com/explore/...\nhttps://www.xiaohongshu.com/explore/...`}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono resize-y overflow-x-auto whitespace-pre leading-relaxed shadow-xs"
                        style={{ whiteSpace: 'pre', overflowX: 'auto' }}
                      />
                    </div>

                    <button
                      onClick={handleParseLink}
                      disabled={isParsingLink || !linkInput.trim()}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer flex-shrink-0 active:scale-95 h-fit"
                    >
                      {isParsingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                      <span>
                        {isParsingLink
                          ? '正在批量解析...'
                          : detectedLinkCount > 1
                          ? `开始批量提取 (${detectedLinkCount}篇)`
                          : '开始提取图集'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Parsed Post Info & Smooth Lazy Gallery */}
                {parsedImages.length > 0 && (
                  <div className="space-y-2.5 pt-2.5 border-t border-slate-200/60 animate-fade-in">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-[11px] font-bold text-slate-700 truncate max-w-[48%]">
                        📌 {parsedPostTitle || '社媒精选图集'} (共 {parsedImages.length} 张原图，已勾选 {parsedImages.filter(img => selectedSet.has(img)).length} 张)
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleAutoSelectKeyShots()}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-2xs flex items-center gap-1 active:scale-95"
                          title="智能均匀抽取 6~8 张核心视角，兼顾全面性与极致生成速度"
                        >
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>智能优选 (6~8张)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImages(Array.from(new Set([...selectedImages, ...parsedImages])));
                            showToast(`已全选本图集全部 ${parsedImages.length} 张！`);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-[11px] font-bold cursor-pointer transition-colors shadow-2xs active:scale-95"
                        >
                          全选图集 ({parsedImages.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImages(selectedImages.filter(img => !parsedImages.includes(img)));
                            showToast('已取消勾选图集');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer transition-colors active:scale-95"
                        >
                          取消选择
                        </button>
                      </div>
                    </div>

                    {/* 🌟 极致流畅的分批渲染多图网格 (React.memo + Virtualization/Pagination + Content Visibility) */}
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-6 gap-2.5 max-h-72 overflow-y-auto p-1 custom-scrollbar">
                      {parsedImages.slice(0, visibleCount).map((img, idx) => (
                        <ImageGridTile
                          key={img}
                          img={img}
                          idx={idx}
                          isChosen={selectedSet.has(img)}
                          onToggle={handleToggleImage}
                        />
                      ))}
                    </div>

                    {/* 加载更多分页控制 */}
                    {parsedImages.length > visibleCount && (
                      <div className="flex items-center justify-between pt-1 px-1 text-xs">
                        <span className="text-[11px] text-slate-400 font-mono">
                          正在显示前 {visibleCount} / {parsedImages.length} 张
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setVisibleCount(prev => Math.min(parsedImages.length, prev + 36))}
                            className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1 active:scale-95"
                          >
                            <span>加载更多 (+36)</span>
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisibleCount(parsedImages.length)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer hover:underline"
                          >
                            全部展开 ({parsedImages.length})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Panel Content for Local Upload */}
            {sourceType === 'upload' && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <label
                  {...styleUploadDropProps}
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-white group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-600 transition-colors">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">点击或拖拽上传爆款参考图片 (支持批量多选 PNG/JPG)</span>
                  <span className="text-[11px] text-slate-400">支持同时上传任意多张同风格的图片以增强 AI 提炼准确度</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Panel Content for Direct URLs */}
            {sourceType === 'url' && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <textarea
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="请输入图片完整直链 URL，一行一个&#10;https://example.com/photo1.jpg&#10;https://example.com/photo2.jpg"
                  rows={3}
                  className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 font-mono resize-none"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleAddUrls}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    添加图片链接
                  </button>
                </div>
              </div>
            )}

            {/* 🌟 待提炼图集底部预览条 (高性能轻量缩略图) */}
            {selectedImages.length > 0 && (
              <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100/90 flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
                  <span className="text-[11px] font-bold text-indigo-900 flex-shrink-0">
                    待提炼图集 ({selectedImages.length}张):
                  </span>
                  {selectedImages.slice(0, 16).map((img, idx) => (
                    <div key={idx} className="relative group w-11 h-11 rounded-xl overflow-hidden bg-white border border-slate-200 flex-shrink-0 shadow-2xs">
                      <img 
                        src={normalizeImageUrlToStandardJpg(img) || img} 
                        alt="" 
                        loading="lazy" 
                        decoding="async" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.dataset.hasRetried && img) {
                            target.dataset.hasRetried = 'true';
                            target.src = proxyMediaUrl(img);
                          }
                        }}
                        className="w-full h-full object-cover" 
                      />
                      <button
                        onClick={() => setSelectedImages(selectedImages.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {selectedImages.length > 16 && (
                    <div className="px-2.5 py-3 rounded-xl bg-white border border-indigo-200 text-[10px] font-mono font-bold text-indigo-700 flex-shrink-0 shadow-2xs">
                      +{selectedImages.length - 16} 更多
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedImages([])}
                  className="text-[11px] text-red-600 hover:text-red-700 font-bold flex-shrink-0 cursor-pointer hover:underline px-1"
                >
                  清空全部
                </button>
              </div>
            )}
          </div>

          {/* Action Trigger Button & Style Prompt */}
          <div className="space-y-2.5">
            <div className="text-[11px] px-1 text-slate-500 font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>AI 视觉大模型将全自动深度解析图集的光学画质、空间置景道具与真实光影，沉淀为可复用生图配方。</span>
            </div>

            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <Cpu className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">分析模型:</span>
                <select
                  value={extractModel}
                  onChange={e => setExtractModel(e.target.value)}
                  className="bg-transparent text-xs font-bold text-indigo-950 outline-none cursor-pointer pr-1"
                >
                  {multimodalModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                value={userHint}
                onChange={e => setUserHint(e.target.value)}
                placeholder="补充风格要求 (可选，例如：突出日落暖灯、胡桃木质感、极简桌面)"
                className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 transition-all shadow-xs"
              />
              <button
                onClick={handleStartExtract}
                disabled={isExtracting || selectedImages.length === 0}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 active:scale-95 btn-shimmer"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>{extractStepText}</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 text-white" />
                    <span>启动 AI 视觉架构推理 ➔</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: 架构推理结果预览与自定义微调 */}
          {extractedRecipe && (
            <div className="p-5 rounded-3xl bg-slate-50 border border-indigo-100 space-y-4 animate-fade-in shadow-inner">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-xs font-bold text-indigo-900 flex items-center gap-2">
                  <BookmarkCheck className="w-4 h-4 text-indigo-600" />
                  架构推理结果与配方配置 (可直接在线修改)
                </span>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  ✓ 推理成功
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 风格名称 */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">品类架构名称：</label>
                  <input
                    type="text"
                    value={extractedRecipe.name}
                    onChange={e => setExtractedRecipe({ ...extractedRecipe, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 归属品类 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700">归属行业品类：</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-0.5 cursor-pointer hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{isCreatingCategory ? '选择已有品类' : '+ 新建品类'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCategoryManagerOpen(true)}
                        className="text-[10px] text-slate-500 hover:text-red-600 font-bold flex items-center gap-0.5 cursor-pointer hover:underline"
                        title="管理与删除品类（可删除内置或自定义分类）"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>管理/删除分类</span>
                      </button>
                    </div>
                  </div>

                  {isCreatingCategory ? (
                    <div className="flex items-center gap-1.5 animate-fade-in">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        placeholder="如：⛺ 户外露营 / 运动装备"
                        className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-indigo-300 text-xs font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCreateNewCategory}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex-shrink-0"
                      >
                        确认创建
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingCategory(false)}
                        className="px-2 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 text-xs font-medium cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <select
                      value={extractedRecipe.category}
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setIsCreatingCategory(true);
                        } else if (e.target.value === '__MANAGE__') {
                          setIsCategoryManagerOpen(true);
                        } else {
                          setExtractedRecipe({ ...extractedRecipe, category: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="__NEW__">➕ 自定义新建品类...</option>
                      <option value="__MANAGE__">⚙️ 管理 / 删除已有品类 (包括系统内置)...</option>
                    </select>
                  )}
                </div>
              </div>

              {/* 特征标签 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">场景特色标签：</label>
                <input
                  type="text"
                  value={extractedRecipe.tag}
                  onChange={e => setExtractedRecipe({ ...extractedRecipe, tag: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 outline-none focus:border-indigo-500"
                />
              </div>

              {/* 🌟 核心理念看板：通用提示词元架构体系 (Prompt Meta-Architecture) */}
              <div className="p-4.5 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-pink-50/30 border border-indigo-100/80 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-100/60">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    已提炼【品类专属提示词生成架构体系】（指导 AI 规划全新分镜，拒绝千篇一律）
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100/80 px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                      品类架构就绪
                    </span>
                  </div>
                </div>

                {/* 架构核心理念说明 */}
                <div className="p-2.5 rounded-xl bg-white/90 border border-indigo-100 text-[11px] text-slate-700 leading-relaxed space-y-1 shadow-2xs">
                  <p className="font-bold text-indigo-900 flex items-center gap-1">
                    <span>💡 架构如何指导后续分镜规划？</span>
                  </p>
                  <p className="text-[10px] text-slate-600">
                    架构推理产出的是针对该特定品类的<b>「提示词构建方法论与置景光影法则」</b>。后续在工坊中载入该品类的任意新商品实物图后，大模型将严格依据此套架构指南，为新商品规划出场景、机位、氛围各不相同的高质量分镜提示词！
                  </p>
                </div>

                {/* 结构化构建步骤展示 */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Prompt 构建层级逻辑与拆解顺序：</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    {extractedRecipe.architecture?.structure_steps && Array.isArray(extractedRecipe.architecture.structure_steps) ? (
                      extractedRecipe.architecture.structure_steps.map((step: any, sIdx: number) => (
                        <div key={sIdx} className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs">
                          <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-xs">
                            <span className="w-4 h-4 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-[10px]">
                              {step.step_no || sIdx + 1}
                            </span>
                            <span>[{step.title}]</span>
                          </div>
                          <p className="text-[10px] text-slate-600 leading-relaxed pl-5">
                            {step.rule}
                          </p>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs">
                          <span className="font-bold text-indigo-900 text-xs">1. [主体物理特征与材质工艺]</span>
                          <p className="text-[10px] text-slate-600">提取目标商品真实三维物理特征与微观材质（保留原装装甲结构/版型材质不变）</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs">
                          <span className="font-bold text-indigo-900 text-xs">2. [核心配件/服饰细节]</span>
                          <p className="text-[10px] text-slate-600">描写 [颜色 + 材质工艺 + 版型/装配关系]，与主体形成协调呼应</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs">
                          <span className="font-bold text-indigo-900 text-xs">3. [周边生态/道具搭配]</span>
                          <p className="text-[10px] text-slate-600">自然点缀生活化/专业化道具生态池与摆放细节</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs">
                          <span className="font-bold text-indigo-900 text-xs">4. [场景空间与物理背景]</span>
                          <p className="text-[10px] text-slate-600">真实物理场景环境与背景质感，严禁非现实或脏乱杂物</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs sm:col-span-2">
                          <span className="font-bold text-indigo-900 text-xs">5. [光影色彩与光学质感]</span>
                          <p className="text-[10px] text-slate-600">模拟真实手机后置主摄买家秀实拍，浅景深虚化、物理接触阴影与自然微噪点</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 输出拼接范式 */}
                {extractedRecipe.architecture?.prompt_formula && (
                  <div className="p-2.5 rounded-xl bg-white border border-indigo-100 flex items-center justify-between gap-2 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">最终 Prompt 格式范式：</span>
                    <code className="text-[10px] font-mono text-indigo-800 bg-indigo-50/70 px-2 py-1 rounded-lg border border-indigo-200/60 truncate flex-1">
                      {extractedRecipe.architecture.prompt_formula}
                    </code>
                  </div>
                )}
              </div>

              {/* 核心提示词元架构指南 (可按需直接在线编辑) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <span>提示词元架构系统指令 (Prompt Architecture Blueprint · 可自由编辑与调整)：</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">将直接作为 System Instruction 指导大模型生成分镜</span>
                </div>
                <textarea
                  value={extractedRecipe.promptSnippet}
                  onChange={e => setExtractedRecipe({ ...extractedRecipe, promptSnippet: e.target.value })}
                  rows={6}
                  className="w-full p-3 rounded-2xl bg-white border border-slate-200 text-xs leading-relaxed text-slate-800 outline-none focus:border-indigo-500 font-mono shadow-xs resize-y custom-scrollbar"
                />

                {/* 快捷微调增强标签 */}
                <div className="flex flex-wrap gap-1.5 text-[10px] pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const snippet = extractedRecipe.promptSnippet;
                      const addition = '\n- 模拟 iPhone 16 Pro 后置主摄实拍直出画质，自然浅景深，真实微弱镜头噪点，无过度锐化与廉价塑料感，具有物理接触阴影。';
                      if (!snippet.includes('iPhone 16 Pro')) {
                        setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                        showToast('✨ 已强化【真实手机买家秀质感】！');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium transition-colors cursor-pointer border border-emerald-100 flex items-center gap-1"
                  >
                    <span>+ 真实手机实拍感</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const snippet = extractedRecipe.promptSnippet;
                      const addition = '\n- 环境光线采用柔和自然漫射天光，高光通透温润，暗部层次分明，呈现极佳生活温度。';
                      if (!snippet.includes('自然漫射天光')) {
                        setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                        showToast('✨ 已追加【自然漫射光影】！');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium transition-colors cursor-pointer border border-amber-100 flex items-center gap-1"
                  >
                    <span>+ 自然漫射光影</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const snippet = extractedRecipe.promptSnippet;
                      const addition = '\n- 主体必须受到真实物理重力承托，稳固放置在场景台面或自然手持，严禁反重力悬浮或物理畸变。';
                      if (!snippet.includes('物理重力承托')) {
                        setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                        showToast('✨ 已注入【物理重力承托规范】！');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition-colors cursor-pointer border border-indigo-100 flex items-center gap-1"
                  >
                    <span>+ 物理重力承托规范</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const snippet = extractedRecipe.promptSnippet;
                      const addition = '\n- 严禁出现任何非现实的奇幻背景或脏乱杂物（如梯子、垃圾桶、凌乱线头），保持背景干净有质感。';
                      if (!snippet.includes('严禁出现任何非现实')) {
                        setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                        showToast('✨ 已追加【背景纯净去杂物负向约束】！');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium transition-colors cursor-pointer border border-purple-100 flex items-center gap-1"
                  >
                    <span>+ 背景去杂物负向约束</span>
                  </button>
                </div>
              </div>

              {/* 保存按钮 */}
              <button
                onClick={handleSaveRecipe}
                disabled={isSaving}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer active:scale-98"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>保存此提示词元架构并立即应用 ➔</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 品类管理与删除弹窗 */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        onCategoriesChanged={updated => {
          setCategories(updated);
          if (extractedRecipe && !updated.some(c => c.id === extractedRecipe.category)) {
            setExtractedRecipe({ ...extractedRecipe, category: updated[0]?.id || 'general' });
          }
        }}
      />
    </div>
  );
}

'use client';
import {apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import { downloadMediaOrOpen } from '@/lib/downloadMedia';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { formatUserError } from '@/lib/upstreamErrors';
import {
  Package,
  Download,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  FolderArchive,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Sparkles,
  RefreshCw,
  Edit3,
  X,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Camera,
  Info
} from 'lucide-react';
import CollapsibleSidePanel from '@/shared/ui/CollapsibleSidePanel';
import type { WorkshopPrimaryAction } from './WorkshopTopBar';

interface Props {
  onBackToStep3: () => void;
  onResetToStep1: () => void;
  hideChromeNav?: boolean;
  onBindPrimaryAction?: (action: WorkshopPrimaryAction | null) => void;
}

export default function ExportStudio({
  onBackToStep3,
  onResetToStep1,
  hideChromeNav,
  onBindPrimaryAction,
}: Props) {
  const { product, generationTasks, selectedImageGenModel } = useAppStore();

  // 成功生成的任务
  const successfulTasks = generationTasks.filter(t => t.status === 'SUCCESS' && t.resultUrl);
  
  // SKU ID 可直接编辑调整（用于文件夹命名）
  const [skuId, setSkuId] = useState(product?.itemId || 'SKU_' + Date.now().toString().slice(-6));
  const [isEditingSku, setIsEditingSku] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [copiedAllPrompts, setCopiedAllPrompts] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // 点击图片后展示的详情弹窗（包含提示词与高清大图）
  const [activeDetailTask, setActiveDetailTask] = useState<GenerationTask | null>(null);

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(
    successfulTasks.map(t => t.id)
  );

  // 切换勾选
  const toggleSelectTask = (id: string) => {
    if (selectedTaskIds.includes(id)) {
      setSelectedTaskIds(selectedTaskIds.filter(i => i !== id));
    } else {
      setSelectedTaskIds([...selectedTaskIds, id]);
    }
  };

  // 全选/反选
  const handleToggleSelectAll = () => {
    if (selectedTaskIds.length === successfulTasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(successfulTasks.map(t => t.id));
    }
  };

  // 批量 ZIP 打包下载
  const handleExportZip = useCallback(async () => {
    const tasksToExport = successfulTasks.filter(t => selectedTaskIds.includes(t.id));
    if (tasksToExport.length === 0) {
      alert('请至少勾选一张要导出的图片');
      return;
    }

    setIsExportingZip(true);
    try {
      const payload = {
        skuId: skuId.trim() || 'PRODUCT_EXPORT',
        productTitle: product?.title || '未命名商品',
        model: selectedImageGenModel,
        images: tasksToExport.map(t => ({
          filename: `shot_${t.shotNo}_${t.title}.png`,
          url: t.resultUrl,
          shotNo: t.shotNo,
          title: t.title,
          prompt: t.prompt
        }))
      };

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`打包请求失败: ${res.statusText}`);
      }

      const blob = await res.blob();
      await saveToDownloadDir(`${payload.skuId}_买家秀成套交付包.zip`, blob);
    } catch (e: any) {
      alert(`打包失败: ${formatUserError(e, '网络连接超时')}`);
    } finally {
      setIsExportingZip(false);
    }
  }, [successfulTasks, selectedTaskIds, skuId, product?.title, selectedImageGenModel]);

  const handleExportZipRef = useRef(handleExportZip);
  handleExportZipRef.current = handleExportZip;

  useEffect(() => {
    if (!onBindPrimaryAction) return;
    onBindPrimaryAction({
      label: isExportingZip
        ? '拉取原图打包中…'
        : `下载 ZIP (${selectedTaskIds.length})`,
      disabled: isExportingZip || selectedTaskIds.length === 0,
      loading: isExportingZip,
      onClick: () => {
        void handleExportZipRef.current();
      },
    });
  }, [onBindPrimaryAction, isExportingZip, selectedTaskIds.length]);

  useEffect(() => {
    if (!onBindPrimaryAction) return;
    return () => onBindPrimaryAction(null);
  }, [onBindPrimaryAction]);

  const handleCopySinglePrompt = (prompt: string, id: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedTaskId(id);
    setTimeout(() => setCopiedTaskId(null), 2000);
  };

  const handleCopyAll = () => {
    const allText = successfulTasks
      .map((t, idx) => `【分镜 ${t.shotNo || idx + 1} - ${t.title}】\n${t.prompt}`)
      .join('\n\n');
    navigator.clipboard.writeText(allText);
    setCopiedAllPrompts(true);
    setTimeout(() => setCopiedAllPrompts(false), 2000);
  };

  const handleDownloadSingle = async (url: string, filename: string) => {
    await downloadMediaOrOpen(url, `${filename}.jpg`);
  };

  // 弹窗切换上一个/下一个分镜
  const handleNavigateDetail = (direction: 'prev' | 'next') => {
    if (!activeDetailTask) return;
    const currentIndex = successfulTasks.findIndex(t => t.id === activeDetailTask.id);
    if (currentIndex === -1) return;
    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % successfulTasks.length
      : (currentIndex - 1 + successfulTasks.length) % successfulTasks.length;
    setActiveDetailTask(successfulTasks[nextIndex]);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#F8F9FA] text-slate-900 select-none min-w-0">
      {/* Left Sidebar: Delivery Parameter Configuration */}
      <CollapsibleSidePanel
        storageKey="export-studio-sidebar"
        title="导出设置"
        widthClass="w-80 lg:w-96"
        className="overflow-y-auto p-5 space-y-5 shadow-[1px_0_4px_rgba(0,0,0,0.02)]"
      >
        {/* Header Navigation */}
        {!hideChromeNav ? (
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToStep3}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="返回生图画布"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <h2 className="text-xs font-bold text-slate-900">导出</h2>
          </div>
        </div>
        ) : (
          <h2 className="text-xs font-bold text-slate-900">导出设置</h2>
        )}

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            已选 {selectedTaskIds.length} / {successfulTasks.length} 张
          </div>
          {product && (
            <div className="text-[11px] text-slate-500 truncate">{product.title}</div>
          )}
        </div>

        {!hideChromeNav && (
        <button
          onClick={handleExportZip}
          disabled={isExportingZip || selectedTaskIds.length === 0}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
        >
          {isExportingZip ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>正在拉取高清原图并打包，可能需要 1–2 分钟…</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-white" />
              <span>下载 ZIP ({selectedTaskIds.length})</span>
            </>
          )}
        </button>
        )}

        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <span>高级选项</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {showAdvanced && (
            <div className="px-3.5 pb-3.5 space-y-3 border-t border-slate-100 pt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-indigo-600" />
                    归档目录名
                  </span>
                  <button
                    onClick={() => setIsEditingSku(!isEditingSku)}
                    className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingSku ? '完成' : '编辑'}</span>
                  </button>
                </div>
                {isEditingSku ? (
                  <input
                    type="text"
                    value={skuId}
                    onChange={e => setSkuId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono text-xs outline-none"
                    placeholder="SKU / 目录名"
                  />
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs font-bold truncate">
                    {skuId || 'PRODUCT_DELIVERY'}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  目录预览
                </label>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] space-y-1 text-slate-600">
                  <div className="text-indigo-700 font-bold flex items-center gap-1.5">
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>{skuId || 'PRODUCT'}/</span>
                  </div>
                  {successfulTasks.slice(0, 6).map((t, idx) => (
                    <div key={idx} className="pl-4 truncate flex items-center gap-1.5">
                      <ImageIcon className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      <span className="truncate">shot_{String(t.shotNo).padStart(2, '0')}_{t.title}.png</span>
                    </div>
                  ))}
                  {successfulTasks.length > 6 && (
                    <div className="pl-4 text-slate-400">… 共 {successfulTasks.length} 张</div>
                  )}
                  <div className="pl-4 flex items-center gap-1.5">
                    <FileText className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span>提示词清单.txt</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCopyAll}
                className="w-full py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {copiedAllPrompts ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAllPrompts ? '已复制提示词' : '复制全部提示词'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-200/80">
          <button
            onClick={onResetToStep1}
            className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>开始新商品</span>
          </button>
        </div>
      </CollapsibleSidePanel>

      {/* Right Canvas */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-[#F8F9FA]">
        {/* Top Action Bar */}
        <div className="h-16 px-6 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl flex items-center justify-between flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              成图预览
            </h3>
            <p className="text-[11px] text-slate-500">
              已成功渲染 <strong className="text-indigo-600 font-bold">{successfulTasks.length}</strong> 张 · 已勾选 <strong className="text-pink-600 font-bold">{selectedTaskIds.length}</strong> 张 · 点击图片可查看完整提示词与大图
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleToggleSelectAll}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer shadow-sm"
            >
              {selectedTaskIds.length === successfulTasks.length ? '取消全选' : '全部勾选'}
            </button>

            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer shadow-sm"
            >
              {copiedAllPrompts ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAllPrompts ? '已复制清单' : '复制提示词清单'}</span>
            </button>
          </div>
        </div>

        {/* Modern Borderless Gallery Grid (参考主页展示形式：图片无多余中框，全幅大图平铺) */}
        <div className="flex-1 overflow-y-auto p-6">
          {successfulTasks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4.5 pb-20">
              {successfulTasks.map((task, index) => {
                const isSelected = selectedTaskIds.includes(task.id);
                return (
                  <div
                    key={task.id || index}
                    onClick={() => setActiveDetailTask(task)}
                    className={`relative group cursor-pointer rounded-2xl sm:rounded-3xl overflow-hidden aspect-[3/4] border-2 transition-all duration-300 bg-slate-900 shadow-sm hover:shadow-xl hover:-translate-y-0.5 ${
                      isSelected
                        ? 'border-indigo-500 ring-4 ring-indigo-500/20 shadow-indigo-500/15'
                        : 'border-slate-200/80 hover:border-indigo-400'
                    }`}
                  >
                    {/* Floating Top Left Badge: Shot Index & Ultra-HD */}
                    <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 pointer-events-none">
                      <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white text-[11px] font-mono font-bold shadow-sm">
                        SHOT {String(task.shotNo).padStart(2, '0')}
                      </span>
                      <span className="hidden sm:inline-block px-2 py-0.5 rounded-lg bg-emerald-500/80 backdrop-blur-md text-white text-[9px] font-bold tracking-wider uppercase shadow-sm">
                        4K Ultra-HD
                      </span>
                    </div>

                    {/* Floating Top Right Checkbox for Batch Selection */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectTask(task.id);
                      }}
                      className={`absolute top-2.5 right-2.5 z-20 p-1.5 rounded-xl transition-all duration-200 cursor-pointer ${
                        isSelected 
                          ? 'bg-indigo-600 text-white shadow-md scale-105 ring-2 ring-white/80' 
                          : 'bg-black/40 hover:bg-black/60 text-white/80 backdrop-blur-md'
                      }`}
                      title={isSelected ? '取消勾选' : '勾选加入导出'}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded border border-white/60" />
                      )}
                    </div>

                    {/* 100% Full Edge-to-Edge Image (彻底告别厚重白框) */}
                    <img
                      src={task.resultUrl}
                      alt={task.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.hasRetried && task.resultUrl) {
                          target.dataset.hasRetried = 'true';
                          target.src = proxyMediaUrl(task.resultUrl);
                        }
                      }}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />

                    {/* Bottom Vignette & Hover Action Bar */}
                    <div className="absolute inset-x-0 bottom-0 p-3.5 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent flex flex-col justify-end transition-opacity">
                      <div className="text-xs font-bold text-white truncate drop-shadow-sm">
                        {task.title}
                      </div>
                      
                      <div className="flex items-center justify-between pt-1.5 text-[11px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="flex items-center gap-1 text-indigo-300 font-medium">
                          <Sparkles className="w-3 h-3" />
                          <span>点击查看提示词与大图</span>
                        </span>
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadSingle(task.resultUrl!, `shot_${task.shotNo}_${task.title}`);
                          }}
                          className="p-1.5 rounded-xl bg-white/20 hover:bg-white/40 text-white transition-colors"
                          title="快速下载原图"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-96 flex flex-col items-center justify-center text-center space-y-3 text-slate-500">
              <Package className="w-10 h-10 text-slate-400" />
              <p className="text-sm font-bold">暂无成功渲染的买家秀图片</p>
              <p className="text-xs">请在步骤三生图画布中启动渲染，成功出图后将自动汇聚于此</p>
            </div>
          )}
        </div>
      </div>

      {/* 🌟 沉浸式分镜详情与提示词弹窗 (点击图片后弹出展示完整提示词、摄影参数与高清原图) */}
      {activeDetailTask && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 sm:p-6 animate-fade-in select-none"
          onClick={() => setActiveDetailTask(null)}
        >
          {/* Navigation Prev / Next Floating Buttons */}
          {successfulTasks.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigateDetail('prev');
                }}
                className="absolute left-4 sm:left-6 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all cursor-pointer hover:scale-110 active:scale-95 shadow-xl hidden md:flex items-center justify-center"
                title="上一个分镜 (左箭头)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigateDetail('next');
                }}
                className="absolute right-4 sm:right-6 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all cursor-pointer hover:scale-110 active:scale-95 shadow-xl hidden md:flex items-center justify-center"
                title="下一个分镜 (右箭头)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Main Modal Card */}
          <div 
            className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row border border-slate-100" 
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button Top Right */}
            <button
              onClick={() => setActiveDetailTask(null)}
              className="absolute top-3.5 right-3.5 z-30 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-colors cursor-pointer"
              title="关闭预览"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Left: HD Large Image View */}
            <div className="md:w-3/5 bg-slate-950 flex items-center justify-center p-3 relative overflow-hidden min-h-[350px] md:min-h-[560px]">
              <img
                src={activeDetailTask.resultUrl}
                alt={activeDetailTask.title}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && activeDetailTask.resultUrl) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(activeDetailTask.resultUrl);
                  }
                }}
                className="w-full h-full max-h-[75vh] object-contain rounded-2xl"
              />

              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-black/70 backdrop-blur-md text-white text-xs font-mono font-bold">
                  SHOT {String(activeDetailTask.shotNo).padStart(2, '0')}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-500/80 backdrop-blur-md text-white text-[10px] font-bold uppercase">
                  4K Ultra-HD
                </span>
              </div>
            </div>

            {/* Right: Detailed Prompt & Camera Parameters */}
            <div className="md:w-2/5 p-6 flex flex-col justify-between overflow-y-auto max-h-[50vh] md:max-h-[85vh] space-y-4 bg-white">
              <div className="space-y-4">
                {/* Header Title */}
                <div className="space-y-1 pr-8">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-100">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>买家秀分镜详情</span>
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900 leading-snug">
                    {activeDetailTask.title}
                  </h4>
                </div>

                {/* Full Prompt Text Block */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>生图完整提示词 (Prompt)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopySinglePrompt(activeDetailTask.prompt, activeDetailTask.id)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedTaskId === activeDetailTask.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-indigo-600" />
                          <span>复制提示词</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-56 overflow-y-auto select-text font-normal">
                    {activeDetailTask.prompt}
                  </div>
                </div>

                {/* Optical & Scene Info */}
                {(activeDetailTask.scene || activeDetailTask.camera_focal_length || activeDetailTask.angle) && (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-emerald-600" />
                      <span>摄影光学与场景构图</span>
                    </div>

                    {activeDetailTask.scene && (
                      <div className="text-slate-600 text-[11px] leading-relaxed">
                        <span className="font-semibold text-slate-800">场景环境：</span>
                        {activeDetailTask.scene}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-medium text-slate-500">
                      {activeDetailTask.camera_focal_length && (
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200">
                          焦段: {activeDetailTask.camera_focal_length}
                        </span>
                      )}
                      {activeDetailTask.angle && (
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200">
                          机位: {activeDetailTask.angle}
                        </span>
                      )}
                      {activeDetailTask.lighting_type && (
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200">
                          光影: {activeDetailTask.lighting_type}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(activeDetailTask.resultUrl!, `shot_${activeDetailTask.shotNo}_${activeDetailTask.title}`)}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载此张 4K 原图</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleSelectTask(activeDetailTask.id)}
                  className={`px-3.5 py-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    selectedTaskIds.includes(activeDetailTask.id)
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {selectedTaskIds.includes(activeDetailTask.id) ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-indigo-600" />
                      <span>已加入打包</span>
                    </>
                  ) : (
                    <span>加入打包</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

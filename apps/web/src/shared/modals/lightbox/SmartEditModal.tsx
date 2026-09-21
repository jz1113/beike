import { useLightboxImageModels } from './useLightboxImageModels';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  X,
  MapPin,
  Crop,
  RotateCcw,
  RotateCw,
  Minus,
  Plus,
  ArrowUp,
  Sparkles,
  ChevronDown,
  Check,
} from 'lucide-react';
import { getModelIcon } from '../../ui/ModelIcons';
import '@beike/domain/workflowModels';
import { proxyMediaUrl } from '@/shared/api/apiClient';

export interface MarkerPoint {
  id: string;
  x: number; // 百分比 0 ~ 100
  y: number; // 百分比 0 ~ 100
  index: number;
  type?: 'point' | 'box';
  width?: number; // 百分比 0 ~ 100 (框选)
  height?: number; // 百分比 0 ~ 100 (框选)
}

export interface DragBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalPrompt?: string;
  onSubmitSmartEdit: (params: {
    markers: MarkerPoint[];
    prompt: string;
    model: string;
    quality: string;
    aspectRatio?: string;
  }) => void;
  quickModel?: string;
  quickQuality?: string;
  quickAspectId?: string;
  onChangeQuickModel?: (id: string) => void;
  onChangeQuickQuality?: (quality: 'low' | 'medium' | 'high') => void;
  onChangeQuickAspectId?: (id: string) => void;
}

export const SmartEditModal: React.FC<SmartEditModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  originalPrompt = '',
  onSubmitSmartEdit,
  quickModel,
  quickQuality,
  quickAspectId,
  onChangeQuickModel,
  onChangeQuickQuality,
  onChangeQuickAspectId,
}) => {
  const [markers, setMarkers] = useState<MarkerPoint[]>([]);
  const [activeMarkerId, setActiveMarkerId] = useState<string>('');
  const [history, setHistory] = useState<MarkerPoint[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [prompt, setPrompt] = useState<string>('');

  // 🌟 模式切换：'box' (框选模式，默认推荐) | 'point' (单点标记模式)
  const [editMode, setEditMode] = useState<'box' | 'point'>('box');

  // 🌟 框选拖拽状态
  const [isDrawingBox, setIsDrawingBox] = useState<boolean>(false);
  const [boxStart, setBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragBox, setCurrentDragBox] = useState<DragBox | null>(null);

  // 🌟 当前图片代理与多级容灾加载
  const resolvedInitialImg = useMemo(() => {
    if (!imageUrl) return '';
    return proxyMediaUrl(imageUrl) || imageUrl;
  }, [imageUrl]);

  const [currentImgSrc, setCurrentImgSrc] = useState<string>(resolvedInitialImg);
  const [hasImgError, setHasImgError] = useState<boolean>(false);

  useEffect(() => {
    if (imageUrl) {
      setCurrentImgSrc(proxyMediaUrl(imageUrl) || imageUrl);
      setHasImgError(false);
    } else {
      setCurrentImgSrc('');
      setHasImgError(false);
    }
  }, [imageUrl]);

  const handleImgLoadError = useCallback(() => {
    if (currentImgSrc !== imageUrl && imageUrl) {
      setCurrentImgSrc(imageUrl);
    } else {
      setHasImgError(true);
    }
  }, [currentImgSrc, imageUrl]);

  // 联动生图工作台的模型和尺寸配置
  const storeQuickModel = quickModel;
  const storeQuickQuality = quickQuality;
  const storeQuickAspectId = quickAspectId;
  const setQuickModel = onChangeQuickModel || (() => {});
  const setQuickQuality = onChangeQuickQuality || (() => {});
  const setQuickAspectId = onChangeQuickAspectId || (() => {});

  const availableImageModels = useLightboxImageModels();

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return storeQuickModel || 'gpt-image-2';
  });

  const [selectedQuality, setSelectedQuality] = useState<'1K' | '2K' | '4K'>(() => {
    return storeQuickQuality === 'low' ? '1K' : storeQuickQuality === 'high' ? '4K' : '2K';
  });

  const [selectedAspectId, setSelectedAspectId] = useState<string>(() => {
    return storeQuickAspectId || '1:1';
  });

  // 打开弹窗时重置状态
  useEffect(() => {
    if (isOpen) {
      setMarkers([]);
      setActiveMarkerId('');
      setHistory([]);
      setHistoryIndex(-1);
      setZoomLevel(100);
      setPrompt('');
      setIsDrawingBox(false);
      setBoxStart(null);
      setCurrentDragBox(null);
      if (storeQuickModel) setSelectedModelId(storeQuickModel);
      if (storeQuickQuality) {
        setSelectedQuality(
          storeQuickQuality === 'low' ? '1K' : storeQuickQuality === 'high' ? '4K' : '2K',
        );
      }
      if (storeQuickAspectId) setSelectedAspectId(storeQuickAspectId);
    }
  }, [isOpen, imageUrl, storeQuickModel, storeQuickQuality, storeQuickAspectId]);

  // 下拉菜单显示控制
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState<boolean>(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setShowModelDropdown(false);
      }
      if (
        sizeDropdownRef.current &&
        !sizeDropdownRef.current.contains(e.target as Node)
      ) {
        setShowSizeDropdown(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const activeModelObj = availableImageModels.find((m) => m.id === selectedModelId) || {
    id: selectedModelId,
    name: selectedModelId || '生图模型',
    provider: 'OpenAI',
  };

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id);
    setQuickModel(id);
    try {
      localStorage.setItem('ai_image_gen_model', id);
    } catch {}
    setShowModelDropdown(false);
  };

  const handleSelectQuality = (label: '1K' | '2K' | '4K') => {
    setSelectedQuality(label);
    const q = label === '1K' ? 'low' : label === '4K' ? 'high' : 'medium';
    setQuickQuality(q);
  };

  const handleSelectAspect = (aspectId: string) => {
    setSelectedAspectId(aspectId);
    setQuickAspectId(aspectId);
    setShowSizeDropdown(false);
  };

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const currentDragBoxRef = useRef<DragBox | null>(null);
  currentDragBoxRef.current = currentDragBox;
  const isDrawingBoxRef = useRef(isDrawingBox);
  isDrawingBoxRef.current = isDrawingBox;

  // 🌟 单点标记点击：放置标记点
  const handleClickImage = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (editMode !== 'point') return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

      const newId = `marker-${Date.now()}`;
      const newIndex = markers.length + 1;
      const newMarker: MarkerPoint = {
        id: newId,
        type: 'point',
        x: parseFloat(x.toFixed(2)),
        y: parseFloat(y.toFixed(2)),
        index: newIndex,
      };

      setHistory((prev) => [...prev.slice(0, historyIndex + 1), markers]);
      setHistoryIndex((prev) => prev + 1);
      setMarkers((prev) => [...prev, newMarker]);
      setActiveMarkerId(newId);
    },
    [editMode, markers, historyIndex],
  );

  // 🌟 鼠标按下：仅在框选模式下开始拖拽
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (editMode !== 'box') return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

      setIsDrawingBox(true);
      setBoxStart({ x, y });
      setCurrentDragBox({ x, y, width: 0, height: 0 });
    },
    [editMode],
  );

  // 🌟 鼠标移动：拉伸框选虚线框
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDrawingBox || !boxStart) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const currX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const currY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

      const left = Math.min(boxStart.x, currX);
      const top = Math.min(boxStart.y, currY);
      const width = Math.abs(currX - boxStart.x);
      const height = Math.abs(currY - boxStart.y);

      setCurrentDragBox({ x: left, y: top, width, height });
    },
    [isDrawingBox, boxStart],
  );

  // 🌟 鼠标松开：完成框选
  const handleMouseUp = useCallback(() => {
    const latestBox = currentDragBoxRef.current;
    if (isDrawingBoxRef.current && latestBox) {
      // 避免微颤误触（长宽均大于 1.5%）
      if (latestBox.width > 1.5 && latestBox.height > 1.5) {
        const newId = `box-${Date.now()}`;
        const newIndex = markers.length + 1;
        const newMarker: MarkerPoint = {
          id: newId,
          type: 'box',
          x: parseFloat(latestBox.x.toFixed(2)),
          y: parseFloat(latestBox.y.toFixed(2)),
          width: parseFloat(latestBox.width.toFixed(2)),
          height: parseFloat(latestBox.height.toFixed(2)),
          index: newIndex,
        };

        setHistory((prev) => [...prev.slice(0, historyIndex + 1), markers]);
        setHistoryIndex((prev) => prev + 1);
        setMarkers((prev) => [...prev, newMarker]);
        setActiveMarkerId(newId);
      }
    }
    setIsDrawingBox(false);
    setBoxStart(null);
    setCurrentDragBox(null);
  }, [markers, historyIndex]);

  // 全局松开鼠标保护
  useEffect(() => {
    if (!isDrawingBox) return;
    const onWindowMouseUp = () => {
      handleMouseUp();
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => window.removeEventListener('mouseup', onWindowMouseUp);
  }, [isDrawingBox, handleMouseUp]);

  // 删除标记或选区
  const handleRemoveMarker = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), markers]);
      setHistoryIndex((prev) => prev + 1);

      setMarkers((prev) => {
        const remaining = prev.filter((m) => m.id !== id);
        return remaining.map((m, idx) => ({ ...m, index: idx + 1 }));
      });
      if (activeMarkerId === id) {
        const next = markers.find((m) => m.id !== id);
        setActiveMarkerId(next ? next.id : '');
      }
    },
    [markers, activeMarkerId, historyIndex],
  );

  // 撤销
  const handleUndo = useCallback(() => {
    if (historyIndex >= 0) {
      const prev = history[historyIndex];
      setMarkers(prev);
      setHistoryIndex((curr) => curr - 1);
    }
  }, [history, historyIndex]);

  // 重做
  const handleRedo = useCallback(() => {
    if (historyIndex + 1 < history.length) {
      const next = history[historyIndex + 1];
      setMarkers(next);
      setHistoryIndex((curr) => curr + 1);
    }
  }, [history, historyIndex]);

  // 缩放控制
  const handleZoomIn = () => setZoomLevel((z) => Math.min(200, z + 25));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(50, z - 25));

  const canSubmit = Boolean(prompt.trim());

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) return;
    const normalizedQuality =
      selectedQuality === '1K' ? 'low' : selectedQuality === '4K' ? 'high' : 'medium';

    onSubmitSmartEdit({
      markers,
      prompt: prompt.trim(),
      model: selectedModelId || activeModelObj.id || 'gpt-image-2',
      quality: normalizedQuality,
      aspectRatio: selectedAspectId,
    });
    onClose();
  }, [
    markers,
    prompt,
    activeModelObj,
    selectedModelId,
    selectedQuality,
    selectedAspectId,
    onSubmitSmartEdit,
    onClose,
  ]);

  if (!isOpen) return null;

  const activeMarker = markers.find((m) => m.id === activeMarkerId);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-6 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden p-4 sm:p-6 space-y-3 sm:space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 1. 模态框顶栏 (标题 + 操作模式工具组 + 撤销重做与缩放 + 关闭按钮) */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 shrink-0 gap-3">
          {/* 左侧：标题与改图模式切换 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#007AFF] shadow-sm" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">智能改图</h3>
            </div>

            <div className="h-4 w-[1px] bg-slate-200" />

            {/* 模式选择胶囊：框选 / 标记 */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80">
              {/* 1. 框选模式切换按钮 */}
              <button
                type="button"
                onClick={() => setEditMode('box')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  editMode === 'box'
                    ? 'bg-white text-[#007AFF] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
                title="按住鼠标左键在图片上拖拽即可框选区域"
              >
                <Crop className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>框选</span>
              </button>

              {/* 2. 单点标记模式切换按钮 */}
              <button
                type="button"
                onClick={() => setEditMode('point')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  editMode === 'point'
                    ? 'bg-white text-[#007AFF] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
                title="点击图片放置单点水滴标记"
              >
                <MapPin className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>标记</span>
              </button>
            </div>

            <span className="hidden md:inline-block text-xs text-slate-400 font-normal">
              {editMode === 'box' ? '按住鼠标在画面上拖拽创建选区' : '点击画面任意位置放置定位点'}
            </span>
          </div>

          {/* 右侧：撤销重做 + 缩放比例 + 关闭按钮 */}
          <div className="flex items-center gap-2">
            {/* 撤销 / 重做 */}
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex < 0}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                title="撤销"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex + 1 >= history.length}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                title="重做"
              >
                <RotateCw className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            </div>

            {/* 缩放比例控制 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 border border-slate-200/80 text-xs font-medium text-slate-700 font-mono">
              <button
                type="button"
                onClick={handleZoomOut}
                className="hover:text-black cursor-pointer p-0.5"
                title="缩小"
              >
                <Minus className="w-3 h-3 stroke-[2.5]" />
              </button>
              <span className="w-9 text-center select-none text-[11px] font-semibold">{zoomLevel}%</span>
              <button
                type="button"
                onClick={handleZoomIn}
                className="hover:text-black cursor-pointer p-0.5"
                title="放大"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
              </button>
            </div>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              title="关闭 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 🌟 2. 中间大图交互工作区（100% 纯净无遮挡，任何工具条均不压在图片上） */}
        <div className="relative flex-1 min-h-[360px] sm:min-h-[440px] bg-slate-50/80 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200/60 p-3 sm:p-4 group">
          {/* 图像视口 */}
          <div
            ref={imageContainerRef}
            onClick={handleClickImage}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`relative max-h-[58vh] max-w-full inline-block transition-transform duration-150 origin-center select-none ${
              editMode === 'box' ? 'cursor-crosshair' : 'cursor-crosshair'
            }`}
            style={{
              transform: `scale(${zoomLevel / 100})`,
            }}
          >
            {/* 主图片 */}
            {!hasImgError && currentImgSrc ? (
              <img
                src={currentImgSrc}
                alt={originalPrompt || "编辑原图"}
                onError={handleImgLoadError}
                draggable={false}
                className="max-h-[56vh] max-w-full object-contain block pointer-events-none rounded-xl shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-[380px] h-[380px] flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-200/60 rounded-xl">
                <Sparkles className="w-8 h-8 opacity-40" />
                <span className="text-xs">图片加载中或暂时不可用</span>
              </div>
            )}

            {/* 🌟 正在框选过程中的实时高光预览选区 */}
            {isDrawingBox && currentDragBox && (
              <div
                className="absolute z-30 border-2 border-dashed border-[#007AFF] bg-[#007AFF]/20 rounded-lg pointer-events-none transition-none shadow-sm"
                style={{
                  left: `${currentDragBox.x}%`,
                  top: `${currentDragBox.y}%`,
                  width: `${currentDragBox.width}%`,
                  height: `${currentDragBox.height}%`,
                }}
              >
                <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-[#007AFF] text-white text-[10px] font-bold font-mono">
                  框选区域
                </div>
              </div>
            )}

            {/* 🌟 渲染已创建的标记点与框选区域 */}
            {markers.map((marker) => {
              const isActive = activeMarkerId === marker.id;

              // 🌟 1. 矩形框选区域渲染
              if (marker.type === 'box') {
                return (
                  <div
                    key={marker.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMarkerId(marker.id);
                    }}
                    className={`absolute z-20 rounded-lg transition-all cursor-pointer ${
                      isActive
                        ? 'border-2 border-[#007AFF] bg-[#007AFF]/25 ring-2 ring-[#007AFF]/30 shadow-md'
                        : 'border-2 border-dashed border-[#007AFF] bg-[#007AFF]/15 hover:bg-[#007AFF]/25'
                    }`}
                    style={{
                      left: `${marker.x}%`,
                      top: `${marker.y}%`,
                      width: `${marker.width}%`,
                      height: `${marker.height}%`,
                    }}
                  >
                    {/* 左上角序号徽标 */}
                    <div className="absolute -top-3 -left-3 flex items-center gap-1 bg-[#007AFF] text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-md">
                      <Crop className="w-2.5 h-2.5" />
                      <span>{marker.index}</span>
                    </div>

                    {/* 右上角删除按钮 */}
                    <button
                      type="button"
                      onClick={(e) => handleRemoveMarker(marker.id, e)}
                      className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-slate-900/80 hover:bg-black text-white flex items-center justify-center shadow-sm cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                      title="删除此框选区域"
                    >
                      <X className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                );
              }

              // 🌟 2. 水滴标记点渲染 (point)
              return (
                <div
                  key={marker.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMarkerId(marker.id);
                  }}
                  className="absolute z-20 -translate-x-1/2 -translate-y-full group/marker cursor-pointer animate-scale-up"
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                >
                  <div className="relative flex items-center justify-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-transform ${
                        isActive
                          ? 'bg-[#007AFF] text-white scale-110 ring-2 ring-[#007AFF]/40'
                          : 'bg-[#007AFF]/90 hover:bg-[#007AFF] text-white'
                      }`}
                    >
                      <span className="text-[12px] font-bold leading-none font-mono">
                        {marker.index}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleRemoveMarker(marker.id, e)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-black text-white flex items-center justify-center shadow-sm cursor-pointer opacity-80 group-hover/marker:opacity-100 transition-opacity"
                      title="删除此标记点"
                    >
                      <Minus className="w-2.5 h-2.5 stroke-[3]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 🌟 3. 底部输入框与参数栏 */}
        <div className="shrink-0 bg-white rounded-2xl border border-slate-200/90 p-2.5 sm:p-3 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            {/* 当前选中标记/框选徽标胶囊 */}
            {markers.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 text-slate-800 text-xs font-medium shrink-0 border border-slate-200/80">
                <div className="w-4 h-4 rounded-full overflow-hidden bg-slate-200 shrink-0">
                  <img
                    src={currentImgSrc}
                    alt="选区"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex items-center gap-1 bg-[#007AFF] text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none font-mono">
                  {activeMarker?.type === 'box' ? (
                    <Crop className="w-2.5 h-2.5" />
                  ) : (
                    <MapPin className="w-2.5 h-2.5" />
                  )}
                  <span>{activeMarker?.index || 1}</span>
                </div>
              </div>
            )}

            {/* 提示词输入框 */}
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                editMode === 'box'
                  ? '按住鼠标在图片上拖拽即可框选区域，描述修改需求，如：把框选区域的文字去掉...'
                  : '点击图片放置标记点，描述你想如何调整该位置，如：把头发换成粉色...'
              }
              className="flex-1 bg-transparent text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none min-w-0"
            />

            {/* 参数与提交按钮组 */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 模型选择下拉框 */}
              <div className="relative" ref={modelDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModelDropdown((prev) => !prev);
                    setShowSizeDropdown(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer border ${
                    showModelDropdown
                      ? 'bg-slate-100 border-slate-300 text-slate-950 shadow-2xs'
                      : 'bg-slate-100/80 hover:bg-slate-100 border-slate-200/60 text-slate-700'
                  }`}
                  title="点击切换生图模型"
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    {getModelIcon(selectedModelId, 'w-3.5 h-3.5')}
                  </div>
                  <span className="truncate max-w-[90px] sm:max-w-[130px] inline-block font-semibold">
                    {activeModelObj.shortName || activeModelObj.name}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-60 shrink-0 ml-0.5" />
                </button>

                {/* 模型下拉浮层 */}
                {showModelDropdown && (
                  <div className="absolute right-0 bottom-full mb-2 w-52 py-1.5 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 flex flex-col text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      生图模型配置
                    </div>
                    {availableImageModels.map((m) => {
                      const isSelected = m.id === selectedModelId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectModel(m.id)}
                          className={`flex items-center justify-between px-3 py-2 text-left font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/80 text-indigo-700'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-4 h-4 flex items-center justify-center shrink-0">
                              {getModelIcon(m.id, 'w-4 h-4')}
                            </div>
                            <span className="truncate">{m.shortName || m.name}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 画质与比例控制 */}
              <div className="relative" ref={sizeDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSizeDropdown((prev) => !prev);
                    setShowModelDropdown(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer border ${
                    showSizeDropdown
                      ? 'bg-slate-100 border-slate-300 text-slate-950 shadow-2xs'
                      : 'bg-slate-100/80 hover:bg-slate-100 border-slate-200/60 text-slate-700'
                  }`}
                  title="点击切换尺寸与分辨率"
                  aria-label="点击切换尺寸与分辨率"
                >
                  <span className="font-bold text-slate-900">{selectedQuality}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-600">{selectedAspectId}</span>
                  <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
                </button>

                {/* 尺寸下拉浮层 */}
                {showSizeDropdown && (
                  <div className="absolute right-0 bottom-full mb-2 w-48 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 mb-1">清晰度 / 分辨率</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(['1K', '2K', '4K'] as const).map((q) => (
                          <button
                            key={q}
                            type="button"
                            aria-label={`清晰度 ${q}`}
                            onClick={() => handleSelectQuality(q)}
                            className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              selectedQuality === q
                                ? 'bg-slate-900 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 mb-1">输出尺寸比例</span>
                      <div className="grid grid-cols-3 gap-1">
                        {['1:1', '3:4', '4:3', '9:16', '16:9'].map((aspect) => (
                          <button
                            key={aspect}
                            type="button"
                            onClick={() => handleSelectAspect(aspect)}
                            className={`py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                              selectedAspectId === aspect
                                ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {aspect}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 提交生成按钮 */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                  canSubmit
                    ? 'bg-slate-900 hover:bg-black text-white hover:scale-105 active:scale-95 shadow-md shadow-slate-900/20'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={canSubmit ? '提交智能改图任务' : '请先输入局部改图描述'}
              >
                <span>生成</span>
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartEditModal;

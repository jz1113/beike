import { useState, useCallback, useRef, useEffect, useMemo, type MouseEvent } from 'react';
import { useLightboxImageModels } from './useLightboxImageModels';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { MarkerPoint, DragBox, SmartEditModalProps } from './smartEditTypes';

export function useSmartEditState(props: SmartEditModalProps) {
  const { isOpen, onClose, imageUrl, onSubmitSmartEdit, quickModel, quickQuality, quickAspectId,
    onChangeQuickModel, onChangeQuickQuality, onChangeQuickAspectId } = props;
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


  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return storeQuickModel || 'gpt-image-2';
  });
  const availableImageModels = useLightboxImageModels(selectedModelId, setSelectedModelId);

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

  const activeModelObj = useMemo(() => availableImageModels.find((m) => m.id === selectedModelId) || {
    id: selectedModelId,
    name: selectedModelId || '请先启用生图模型',
    shortName: selectedModelId || '请先启用生图模型',
    provider: 'OpenAI',
  }, [availableImageModels, selectedModelId]);

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
    (e: MouseEvent<HTMLDivElement>) => {
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
    (e: MouseEvent<HTMLDivElement>) => {
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
    (e: MouseEvent<HTMLDivElement>) => {
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
    (id: string, e: MouseEvent) => {
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

  const canSubmit = Boolean(prompt.trim()) && availableImageModels.some(model => model.id === selectedModelId);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const normalizedQuality =
      selectedQuality === '1K' ? 'low' : selectedQuality === '4K' ? 'high' : 'medium';

    onSubmitSmartEdit({
      markers,
      prompt: prompt.trim(),
      model: selectedModelId,
      quality: normalizedQuality,
      aspectRatio: selectedAspectId,
    });
    onClose();
  }, [
    markers,
    prompt,
    canSubmit,
    selectedModelId,
    selectedQuality,
    selectedAspectId,
    onSubmitSmartEdit,
    onClose,
  ]);

  return {
    markers, activeMarkerId, setActiveMarkerId, history, historyIndex, zoomLevel, prompt, setPrompt,
    editMode, setEditMode, isDrawingBox, currentDragBox, currentImgSrc, hasImgError, handleImgLoadError,
    availableImageModels, selectedModelId, selectedQuality, selectedAspectId,
    showModelDropdown, setShowModelDropdown, showSizeDropdown, setShowSizeDropdown,
    modelDropdownRef, sizeDropdownRef, activeModelObj, handleSelectModel, handleSelectQuality,
    handleSelectAspect, imageContainerRef, handleClickImage, handleMouseDown, handleMouseMove,
    handleMouseUp, handleRemoveMarker, handleUndo, handleRedo, handleZoomIn, handleZoomOut,
    canSubmit, handleSubmit,
  };
}

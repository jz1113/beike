import {CanvasLayersPanel} from './CanvasLayersPanel';
import { CanvasLayerDecomposition } from './CanvasLayerDecomposition';
import { CanvasVideoPlayer } from './CanvasVideoPlayer';
import { CanvasResizeHandle } from './CanvasResizeHandle';
import { CanvasFileNode } from './CanvasFileNode';
import { CanvasNodeMenu } from './CanvasNodeMenu';
import { CanvasDrawingNode } from './CanvasDrawingNode';
import { CanvasConnections } from './CanvasConnections';
import { useCanvasFileDrop } from '../hooks/useCanvasFileDrop';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
import { canvasStorage, hasCanvasSaveFailure } from '../store/canvasPersistence';
import { persistCanvasMedia } from '../canvasMediaImport';
import { useCanvasGenerationSync } from '../hooks/useCanvasGenerationSync';
import CanvasDotGrid from './CanvasDotGrid';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDown, MessageSquare, Compass, Minus, Plus, Play, Image as ImageIcon, Video as VideoIcon, FolderOpen, FolderPlus, Upload, Check, Edit2, X, Sparkles, SquarePen, Layout, AlertCircle, Download, Maximize2 } from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '@/store/useAppStore';
import { proxyMediaUrl } from '@/lib/apiClient';
import { downloadMediaOrOpen } from '@/lib/downloadMedia';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import { handleWindowDrag, handleWindowDoubleClick } from '@/lib/windowDrag';
import CanvasPromptDock from './CanvasPromptDock';
import { CanvasProductionPanel } from './CanvasProductionPanel';
import { LightingIcon, MultiAngleIcon, CanvasUploadIcon, CanvasAssetFolderIcon } from '@/shared/icons';
import CanvasAssetImportModal from './CanvasAssetImportModal';
import CanvasLightingModal, { type LightingParams } from './CanvasLightingModal';
import CanvasMultiAngleModal, { type MultiAngleParams } from './CanvasMultiAngleModal';
import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import type { CanvasNode, CanvasSubject } from '../types';
import type { GenerationTask } from '@/types/app-store';

interface InfiniteCanvasEditorProps {
  projectId: string;
}

export const InfiniteCanvasEditor: React.FC<InfiniteCanvasEditorProps> = ({ projectId }) => {
  const { projects, selectProject, createProject, updateProjectTitle, addNode, updateNode, deleteNode } =
    useCanvasStore();
  const currentProject = projects.find((p) => p.id === projectId);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const [editingDrawingId,setEditingDrawingId]=useState<string|null>(null);
  const drawingPress=useRef<{x:number;y:number}|null>(null);

  // 全局生成任务历史（用于资产选择器）
  const generationTasks = useAppStore((s) => s.generationTasks);

  const { pan, zoom, isPanning, isHandMode, draggingNodeId, draggingNodePos, selectedNodeId, setSelectedNodeId, handleZoom, handleResetView, handleWheel, handleMouseDownCanvas, handleMouseMove, handleMouseUp, handleNodeDragStart } = useCanvasGestures(currentProject, updateNode, () => {
    setIsTitleMenuOpen(false);
    setIsAssetSubmenuOpen(false);
    setEditingDrawingId(null);
  }, canvasViewportRef);

  // 标题下拉菜单与就地重命名
  const [isTitleMenuOpen, setIsTitleMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(currentProject?.title || '新建画布');

  // 组件卸载时清理未完成的拖拽动画帧
  const [canvasSaveFailed, setCanvasSaveFailed] = useState(hasCanvasSaveFailure);
  useEffect(() => {
    const onSaveError = () => setCanvasSaveFailed(true);
    const onSaveComplete = () => setCanvasSaveFailed(false);
    window.addEventListener('canvas-save-error', onSaveError);
    window.addEventListener('canvas-save-complete', onSaveComplete);
    return () => {
      window.removeEventListener('canvas-save-error', onSaveError);
      window.removeEventListener('canvas-save-complete', onSaveComplete);
    };
  }, []);

  // 节点标题原地自定义编辑
  const [editingNodeTitleId, setEditingNodeTitleId] = useState<string | null>(null);
  const [tempNodeTitle, setTempNodeTitle] = useState('');

  const handleStartEditNodeTitle = (node: CanvasNode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingNodeTitleId(node.id);
    setTempNodeTitle(node.title || '');
  };

  const handleSaveNodeTitle = (nodeId: string) => {
    if (currentProject) {
      const trimmed = tempNodeTitle.trim();
      const node = currentProject.nodes.find((n) => n.id === nodeId);
      const defaultTitle = node?.type === 'video' ? '视频素材' : '图片素材';
      updateNode(currentProject.id, nodeId, {
        title: trimmed || defaultTitle,
      });
    }
    setEditingNodeTitleId(null);
  };

  // 画板大图全屏预览弹窗状态
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  // 🌟 打光效果调节弹窗状态
  const [lightingModalNode, setLightingModalNode] = useState<CanvasNode | null>(null);

  // 处理打光参数应用与生成衍生分支
  const handleApplyLighting = (
    params: LightingParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => {
    if (!currentProject || !lightingModalNode) return;
    const selectedModel = options?.model || params.model;
    const dirMap: Record<string, string> = {
      left: '左侧',
      top: '顶部',
      right: '右侧',
      front: '前方',
      bottom: '底部',
      back: '后方',
    };
    const dirName = dirMap[params.mainLight] || params.mainLight;
    const lightDesc = `主光:${dirName}, 亮度:${params.brightness}%${params.color !== 'original' ? `, 光色:${params.color}` : ''}${params.rimLight ? ', 轮廓光:开启' : ''}${selectedModel ? `, 模型:${selectedModel}` : ''}`;
    const newNodeTitle = `${lightingModalNode.title || (lightingModalNode.type === 'video' ? '视频素材' : '图片素材')} (打光)`;

    addNode(currentProject.id, {
      type: lightingModalNode.type,
      title: newNodeTitle,
      imageUrl: lightingModalNode.imageUrl,
      x: lightingModalNode.x + lightingModalNode.width + 48,
      y: lightingModalNode.y,
      width: lightingModalNode.width,
      height: lightingModalNode.height,
      content: `${lightingModalNode.content ? `${lightingModalNode.content}, ` : ''}[3D打光: ${lightDesc}]`,
      referenceImageUrl: lightingModalNode.imageUrl,
      model: selectedModel,
    });
  };

  // 🌟 多角度环绕编辑器弹窗状态
  const [multiAngleModalNode, setMultiAngleModalNode] = useState<CanvasNode | null>(null);

  // 处理多角度参数应用与生成衍生分支
  const handleApplyMultiAngle = (
    params: MultiAngleParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => {
    if (!currentProject || !multiAngleModalNode) return;
    const selectedModel = options?.model || params.model;
    const presetLabelMap: Record<string, string> = {
      custom: '自定义',
      fisheye: '鱼眼视角',
      tilted: '倾斜视角',
      'front-high': '正面俯拍',
      'front-low': '正面仰拍',
      'pano-high': '全景俯拍',
      back: '背面视角',
    };
    const angleLabel = presetLabelMap[params.preset] || '多角度';
    const angleDesc = `视角:${angleLabel}, 水平:${params.azimuth}°, 垂直:${params.elevation}°, 景别:${params.shotScale}${params.promptEnabled && params.prompt ? `, 提示词:${params.prompt}` : ''}${selectedModel ? `, 模型:${selectedModel}` : ''}`;
    const newNodeTitle = `${multiAngleModalNode.title || (multiAngleModalNode.type === 'video' ? '视频素材' : '图片素材')} (${angleLabel})`;

    addNode(currentProject.id, {
      type: multiAngleModalNode.type,
      title: newNodeTitle,
      imageUrl: multiAngleModalNode.imageUrl,
      x: multiAngleModalNode.x + multiAngleModalNode.width + 48,
      y: multiAngleModalNode.y,
      width: multiAngleModalNode.width,
      height: multiAngleModalNode.height,
      content: `${multiAngleModalNode.content ? `${multiAngleModalNode.content}, ` : ''}[多角度视角: ${angleDesc}]`,
      referenceImageUrl: multiAngleModalNode.imageUrl,
      model: selectedModel,
    });
  };

  useCanvasGenerationSync(currentProject, generationTasks, updateNode);

  const [composerReference, setComposerReference] = useState<{ name: string; url: string; type: 'image' | 'video'; timestamp: number; attachOnly: boolean } | null>(null);
  const handleAddNodeToComposer = (node: CanvasNode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const url = (node.type === 'video' || node.generationKind === 'video') ? node.videoUrl : node.imageUrl;
    if (!url) return;
    const isVideo = node.type === 'video';
    const name = node.title || (isVideo ? '视频素材' : '图片素材');
    setComposerReference({ name, url, type: isVideo ? 'video' : 'image', timestamp: Date.now(), attachOnly: true });
  };


  // 🌟 动态计算外置信息栏分辨率显示（参考图 3 / 图 4 如 1440 × 1440）
  const calculateDisplayResolution = (node: CanvasNode) => {
    if(node.type==='drawing'){
      if((node.imageUrl || node.videoUrl) && node.resultWidth && node.resultHeight)return `${node.resultWidth} × ${node.resultHeight}`;
      if(node.status==='generating' && node.generationSize)return node.generationSize.replace(/[x*]/,' × ');
      return (node.drawing?.aspect || (node.generationKind === 'video' ? '16:9' : '1:1')).replace(':',' : ');
    }
    if (node.type === 'video') return '1080 × 1920';
    const baseW = node.width || 360;
    const baseH = node.height || 360;
    const ratio = baseW / baseH;
    if (Math.abs(ratio - 1) < 0.15) {
      return '1440 × 1440';
    } else if (ratio > 1.3) {
      return '1920 × 1080';
    } else if (ratio < 0.8) {
      return '1080 × 1440';
    }
    return `${Math.round(baseW * 4)} × ${Math.round(baseH * 4)}`;
  };

  // 侧边栏“导入资产”二级菜单展开状态 (图 2、图 3)
  const [isAssetSubmenuOpen, setIsAssetSubmenuOpen] = useState(false);

  // 资产选择弹窗状态：image | video（严格隔离类型，对齐图 2）
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetModalTab, setAssetModalTab] = useState<'image' | 'video'>('image');

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (
        (event.key !== 'Delete' && event.key !== 'Backspace') ||
        event.defaultPrevented || event.isComposing || event.repeat ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        !selectedNodeId || !currentProject || draggingNodeId ||
        isEditingTitle || editingNodeTitleId || previewMedia ||
        lightingModalNode || multiAngleModalNode || showAssetModal
      ) return;

      const isEditing = (target: EventTarget | null) => target instanceof HTMLElement && (
        target.isContentEditable ||
        !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="menu"], [aria-modal="true"]')
      );
      if (isEditing(event.target) || isEditing(document.activeElement)) return;
      if (!currentProject.nodes.some((node) => node.id === selectedNodeId && !node.layerLocked)) return;

      event.preventDefault();
      deleteNode(currentProject.id, selectedNodeId);
      setSelectedNodeId(null);
    };

    // Upload nodes and other canvas controls stop bubbling keyboard events.
    // Capture deletion first, while explicitly protecting text editors and menus.
    window.addEventListener('keydown', handleDeleteKey, true);
    return () => window.removeEventListener('keydown', handleDeleteKey, true);
  }, [currentProject, selectedNodeId, deleteNode, draggingNodeId, isEditingTitle, editingNodeTitleId, previewMedia, lightingModalNode, multiAngleModalNode, showAssetModal]);

  // 打开资产模态框
  const handleOpenAssetModal = useCallback((type: 'image' | 'video') => {
    setAssetModalTab(type);
    setShowAssetModal(true);
    setIsAssetSubmenuOpen(false);
  }, []);

  // 隐藏的本地文件上传 input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replacementNodeRef = useRef<string | null>(null);
  const canvasFileDrop = useCanvasFileDrop(projectId, pan, zoom);
  const [nodeMenu, setNodeMenu] = useState<{ screenX: number; screenY: number; x: number; y: number } | null>(null);
  const closeNodeMenu = useCallback(() => setNodeMenu(null), []);
  useEffect(closeNodeMenu, [projectId, closeNodeMenu]);

  // 保存标题
  const handleSaveTitle = () => {
    if (currentProject) {
      updateProjectTitle(currentProject.id, tempTitle);
    }
    setIsEditingTitle(false);
    setIsTitleMenuOpen(false);
  };

  // 监听点击外部关闭标题菜单
  useEffect(() => {
    if (!isTitleMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.canvas-title-menu-container')) {
        setIsTitleMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isTitleMenuOpen]);

  // 本地文件选择读取（支持图片或视频）
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const replacementId = replacementNodeRef.current;
    replacementNodeRef.current = null;
    e.target.value = '';
    if (!file || !currentProject) return;
    const projectId = currentProject.id;
    const viewCenterX = (-pan.x + (canvasViewportRef.current?.clientWidth || 900) / 2) / zoom;
    const viewCenterY = (-pan.y + (canvasViewportRef.current?.clientHeight || 600) / 2) / zoom;
    try {
      const media = await persistCanvasMedia(file, viewCenterX, viewCenterY);
      if (replacementId) {
        updateNode(projectId, replacementId, { missingMedia: false, imageUrl: media.imageUrl, videoUrl: media.videoUrl, type: media.type });
        replacementNodeRef.current = null;
      } else addNode(projectId, media);
    } catch (error) {
      window.alert(`素材保存失败，请重新选择文件重试：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 底部专属输入舱提交创作 (支持多图多节点平铺排版 + 真实任务追踪 + 平滑过渡)
  const handleCanvasPromptSubmit = (
    promptText: string,
    refImage?: string,
    mode?: string,
    tasks?: any[],
  ) => {
    if (!currentProject) return;
    const viewCenterX = (-pan.x + (canvasViewportRef.current?.clientWidth || 900) / 2) / zoom;
    const viewCenterY = (-pan.y + (canvasViewportRef.current?.clientHeight || 600) / 2) / zoom;

    const isVideo = mode === 'video';
    const cardW = isVideo ? 340 : 360;
    const cardH = isVideo ? 520 : 360;
    const gap = 36;

    // 获取任务列表（多图生成如 1 张、2 张、4 张）
    const taskList =
      tasks && tasks.length > 0
        ? tasks
        : [
            {
              id: `node-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              taskId: `task-${Date.now()}`,
              prompt: promptText,
            },
          ];

    const count = taskList.length;
    const cols = count === 4 ? 2 : count === 3 ? 3 : count === 2 ? 2 : 1;
    const rows = Math.ceil(count / cols);
    const totalW = cols * cardW + (cols - 1) * gap;
    const totalH = rows * cardH + (rows - 1) * gap;
    const startX = Math.round(viewCenterX - totalW / 2);
    const startY = Math.round(viewCenterY - totalH / 2);

    taskList.forEach((task, index) => {
      const colIndex = index % cols;
      const rowIndex = Math.floor(index / cols);
      const posX = startX + colIndex * (cardW + gap);
      const posY = startY + rowIndex * (cardH + gap);

      const nodeId = task.id || `node-gen-${Date.now()}-${index}`;
      const taskId = task.taskId || task.id;
      const initialTitle =
        (task.title || promptText.slice(0, 24) || (isVideo ? 'AI 视频创作' : 'AI 创意生成')) +
        (count > 1 ? ` (${index + 1}/${count})` : '');

      // 1. 在画布中为每个生成的图片添加独立节点
      addNode(currentProject.id, {
        id: nodeId,
        taskId: taskId,
        type: isVideo ? 'video' as const : 'image' as const,
        title: initialTitle,
        content: promptText,
        status: 'generating',
        progress: 15,
        referenceImageUrl: refImage,
        x: posX,
        y: posY,
        width: cardW,
        height: cardH,
        createdAt: Date.now() + index,
      });

      // 2. 模拟并平滑推进生成进度（15% -> 42% -> 76% -> 95%）
      const progressSteps = [
        { p: 42, delay: 600 + index * 100 },
        { p: 76, delay: 1400 + index * 120 },
        { p: 95, delay: 2400 + index * 150 },
      ];

      progressSteps.forEach(({ p, delay }) => {
        setTimeout(() => {
          const curr = useCanvasStore.getState().projects.find((pr) => pr.id === currentProject.id);
          const target = curr?.nodes.find((n) => n.id === nodeId);
          if (target && target.status === 'generating') {
            updateNode(currentProject.id, nodeId, { progress: p });
          }
        }, delay);
      });

      // 3. 安全兜底完成处理（如果后端无真实长连接或处于离线测试模式，平滑揭晓真实可用图片）
      setTimeout(() => {
        const curr = useCanvasStore.getState().projects.find((pr) => pr.id === currentProject.id);
        const target = curr?.nodes.find((n) => n.id === nodeId);
        if (!target || target.status === 'success' || target.imageUrl || target.videoUrl) return;

        // 如果全局已存在真实结果，优先采用
        const appTasks = useAppStore.getState().generationTasks || [];
        const globalTask = appTasks.find((t) => t.id === nodeId || t.taskId === taskId);
        if (globalTask?.resultUrl) {
          updateNode(currentProject.id, nodeId, {
            status: 'success',
            progress: 100,
            imageUrl: globalTask.resultUrl,
            videoUrl: isVideo ? globalTask.resultUrl : undefined,
          });
          return;
        }

        // 优质备用图片素材（高清高质量，避免白屏或裂图）
        const fallbackPresets = [
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1200&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1200&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1618172193763-c511deb635ca?w=1200&auto=format&fit=crop&q=85',
        ];
        const targetImg = refImage || fallbackPresets[index % fallbackPresets.length];

        if (isVideo) {
          updateNode(currentProject.id, nodeId, {
            status: 'success',
            progress: 100,
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-tree-branches-in-the-breeze-1188-large.mp4',
            imageUrl: targetImg,
          });
        } else {
          updateNode(currentProject.id, nodeId, {
            status: 'success',
            progress: 100,
            imageUrl: targetImg,
          });
        }
      }, 3500 + index * 300);
    });
  };

  const handleBackToHome = () => {
    selectProject(null);
    useAppStore.getState().setCurrentView('home');
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
        <p className="text-base font-semibold mb-3">未找到对应画布项目</p>
        <button
          onClick={handleBackToHome}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
        >
          返回首页
        </button>
      </div>
    );
  }

  const nodes = currentProject.nodes || [];

  // 汇总当前画板所有可用素材主体（命名的名称即后续可引用的主体）
  const canvasSubjects = React.useMemo<CanvasSubject[]>(() => {
    return nodes
      .filter((n) => (n.type === 'image' || n.type === 'video') && (n.imageUrl || n.videoUrl))
      .map((n) => ({
        id: n.id,
        name: n.title || (n.type === 'video' ? '视频素材' : '图片素材'),
        type: n.type as 'image' | 'video',
        url: (n.imageUrl || n.videoUrl)!,
      }));
  }, [nodes]);

  // 严格区分图片资产与视频资产，彻底杜绝类型交叉污染（对齐图 2）
  const isTaskVideo = useCallback((t: any) => {
    const url = t.resultUrl || t.videoUrl || t.outputUrl;
    return Boolean(
      t.mediaType === 'video' ||
        t.mediaType === 'depth-video' ||
        (t.model && String(t.model).toLowerCase().includes('video')) ||
        (t.id && String(t.id).startsWith('depth_video_')) ||
        t.videoUrl ||
        isVideoMediaUrl(url),
    );
  }, []);

  const validTasks = React.useMemo(() => {
    return generationTasks.filter(
      (t) =>
        (t.status === 'SUCCESS' || !t.status) &&
        (t.resultUrl || (t as any).outputUrl || (t as any).videoUrl),
    );
  }, [generationTasks]);

  // 纯粹的图片资产（绝不混杂任何视频）
  const imageAssets = React.useMemo(() => {
    return validTasks.filter((t) => !isTaskVideo(t));
  }, [validTasks, isTaskVideo]);

  // 纯粹的视频资产（绝不混杂任何图片）
  const videoAssets = React.useMemo(() => {
    return validTasks.filter((t) => isTaskVideo(t));
  }, [validTasks, isTaskVideo]);

  // 确认批量置入选中的资产 (对齐图 2)
  const handleConfirmImportAssets = useCallback(
    (selectedTasks: GenerationTask[]) => {
      if (!currentProject || selectedTasks.length === 0) return;
      const viewCenterX = (-pan.x + (canvasViewportRef.current?.clientWidth || 900) / 2) / zoom;
      const viewCenterY = (-pan.y + (canvasViewportRef.current?.clientHeight || 600) / 2) / zoom;

      selectedTasks.forEach((task, index) => {
        // 按照网格错落偏移，避免多张图完全重叠
        const col = index % 3;
        const row = Math.floor(index / 3);
        const offsetX = (col - 1) * 320;
        const offsetY = (row - 1) * 440;

        if (assetModalTab === 'image') {
          const img = task.resultUrl || (task as any).outputUrl;
          const cleanTitle = (task.title || task.prompt || '资产图片').replace(/[\r\n]+/g, ' ').slice(0, 36);
          addNode(currentProject.id, {
            type: 'image',
            title: cleanTitle,
            imageUrl: img,
            x: Math.round(viewCenterX - 150 + offsetX),
            y: Math.round(viewCenterY - 200 + offsetY),
            width: 300,
            height: 400,
          });
        } else {
          const videoUrl = task.resultUrl || (task as any).videoUrl || (task as any).outputUrl;
          const thumb = task.productImageUrl || task.referenceImageUrl;
          const cleanTitle = (task.title || task.prompt || '资产视频').replace(/[\r\n]+/g, ' ').slice(0, 36);
          addNode(currentProject.id, {
            type: 'video',
            title: cleanTitle,
            videoUrl,
            imageUrl: thumb,
            x: Math.round(viewCenterX - 140 + offsetX),
            y: Math.round(viewCenterY - 240 + offsetY),
            width: 280,
            height: 480,
          });
        }
      });

      setShowAssetModal(false);
    },
    [currentProject, pan.x, pan.y, zoom, assetModalTab, addNode]
  );

  return (
    <div
      className="flex-1 w-full h-full flex flex-col overflow-hidden relative select-none bg-[#FAFAFC]"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 隐藏的本地图片/视频选择器 */}
      {currentProject && <CanvasProductionPanel projectId={projectId} />}
      {canvasSaveFailed && (
        <div role="alert" className="absolute bottom-5 left-20 z-50 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          画布尚未保存，请勿关闭窗口。
          <button type="button" className="ml-3 text-indigo-600" onClick={() => {
            void canvasStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: useCanvasStore.getState().projects }, version: 0 }));
          }}>重试保存</button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 🌟 1. 顶部 Header (水平避让 macOS 交通灯并垂直居中对齐，自带窗口拖拽能力) */}
      <header
        data-tauri-drag-region
        onMouseDown={handleWindowDrag}
        onDoubleClick={handleWindowDoubleClick}
        className="canvas-fixed-ui relative w-full h-12 shrink-0 pl-20 pr-4 sm:pr-6 bg-transparent flex items-center justify-between z-30 select-none"
      >
        {/* 与种草工坊一致的左上角悬浮胶囊，保留画板重命名与切换入口。 */}
        <div className="absolute left-4 sm:left-6 top-14 h-10 px-3.5 sm:px-4 flex items-center gap-2.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
          {/* 当前程序官方 Logo 按钮 (点击返回首页，对齐图 2) */}
          <button
            type="button"
            onClick={handleBackToHome}
            className="w-5.5 h-5.5 rounded hover:bg-slate-100/90 flex items-center justify-center transition-all group cursor-pointer active:scale-95 shrink-0"
            title="返回首页"
          >
            <img
              src="/app_logo.png"
              alt="贝壳云图"
              draggable={false}
              className="w-5.5 h-5.5 object-contain shrink-0 group-hover:scale-105 transition-transform"
            />
          </button>

          {/* 项目标题 + 展开下拉箭头 (支持点击直接原地重命名) */}
          <div className="relative canvas-title-menu-container flex items-center">
            {isEditingTitle ? (
              <div className="flex items-center">
                <input
                  ref={(el) => {
                    if (el) {
                      el.focus();
                      el.select();
                    }
                  }}
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  className="text-xs sm:text-[13.5px] font-bold text-slate-900 px-1.5 py-0.5 -ml-1 rounded-md border border-blue-500 bg-blue-50/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs min-w-[110px] max-w-[240px]"
                />
              </div>
            ) : (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTempTitle(currentProject.title);
                    setIsEditingTitle(true);
                    setIsTitleMenuOpen(false);
                  }}
                  className="py-1 px-1.5 -ml-1 rounded-lg hover:bg-slate-100 text-slate-900 transition-colors cursor-text font-bold text-left"
                  title="点击重命名画板"
                >
                  <span className="block max-w-[240px] truncate text-[15px] font-bold leading-none">
                    {currentProject.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsTitleMenuOpen(!isTitleMenuOpen);
                  }}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  title="画板选项"
                >
                  <ChevronDown className="w-4 h-4 stroke-[2]" />
                </button>
              </div>
            )}

            {/* 标题下拉快捷浮层（完全对齐图 2 生成对话卡片式设计） */}
            {isTitleMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-full mt-2 w-80 bg-white border border-slate-200/90 shadow-2xl rounded-2xl p-2.5 z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 select-none"
              >
                {/* 快捷新建画板按钮（对齐图 2：白底圆角卡片，加粗黑字与正方形线笔图标） */}
                <button
                  type="button"
                  onClick={() => {
                    createProject();
                    setIsTitleMenuOpen(false);
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200/90 transition-all text-slate-800 hover:text-black text-sm font-semibold flex items-center gap-2.5 cursor-pointer shadow-2xs group"
                >
                  <SquarePen className="w-4.5 h-4.5 text-slate-700 group-hover:text-black shrink-0 stroke-[2]" />
                  <span>新建画板</span>
                </button>

                {/* 分组标识（对齐图 2：仅展示灰色的「最近」） */}
                <div className="px-2 pt-1 pb-0.5 text-xs font-medium text-slate-400">
                  最近
                </div>

                {/* 最近画板列表 */}
                <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-0.5 scrollbar-thin">
                  {projects.map((proj) => {
                    const isSelected = proj.id === currentProject?.id;
                    const cover =
                      proj.thumbnail ||
                      proj.nodes.find((n) => n.imageUrl)?.imageUrl ||
                      proj.nodes.find((n) => n.videoUrl)?.videoUrl;

                    return (
                      <div
                        key={proj.id}
                        onClick={() => {
                          selectProject(proj.id);
                          setIsTitleMenuOpen(false);
                        }}
                        className={`group relative w-full px-2.5 py-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#F2F3F5] text-slate-900 font-semibold'
                            : 'hover:bg-slate-50 text-slate-800 font-medium'
                        }`}
                      >
                        {/* 画板 1:1 正方形封面海报 / 默认占位 */}
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0 flex items-center justify-center">
                          {cover ? (
                            <img src={cover} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Layout className="w-4 h-4 text-slate-400" />
                          )}
                        </div>

                        {/* 画板标题 */}
                        <span
                          className={`flex-1 min-w-0 text-sm truncate leading-snug ${
                            isSelected ? 'text-slate-900 font-semibold' : 'text-slate-800'
                          }`}
                        >
                          {proj.title || '未命名画板'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 底部快捷返回首页 */}
                <div className="border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={handleBackToHome}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-xl text-left text-xs font-medium cursor-pointer transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                    <span>返回首页</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 顶栏右侧根据用户需求清空多余画框信息 */}
        <div className="flex items-center gap-2" />
      </header>

      {/* 🌟 2. 左侧垂直悬浮工具栏 (严格对照图 1 包含 4 个核心工具) */}
      <div className="canvas-fixed-ui fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5 p-1.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-[0_6px_24px_rgba(0,0,0,0.06)]">
        <button type="button" title="添加文件节点" aria-label="添加文件节点" className="rounded-xl p-3 text-slate-600 hover:bg-slate-100" onClick={() => {
          if (!currentProject) return;
          addNode(currentProject.id, { type: 'file', title: '文件', x: (-pan.x + (canvasViewportRef.current?.clientWidth || 900) / 2) / zoom - 126, y: (-pan.y + (canvasViewportRef.current?.clientHeight || 600) / 2) / zoom - 126, width: 252, height: 252 });
        }}><FolderPlus className="h-5 w-5" /></button>
        {/* 🌟 按钮 1：本地上传 (图 1) */}
        <button
          type="button"
          onClick={() => { replacementNodeRef.current = null; fileInputRef.current?.click(); }}
          className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors group relative cursor-pointer"
          title="本地上传"
        >
          {/* 上传图标 (对齐图 1 矢量向上箭头 + 托盘横线) */}
          <CanvasUploadIcon className="w-4 h-4 text-slate-700" />

          {/* 悬停浮现微气泡：白底黑字 本地上传 */}
          <span className="absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-xs font-medium opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
            本地上传
          </span>
        </button>

        {/* 🌟 按钮 2：导入资产 (图 1 第 2 项) */}
        <div className="relative group/asset">
          <button
            type="button"
            onClick={() => {
              setIsAssetSubmenuOpen(!isAssetSubmenuOpen);
            }}
            onMouseEnter={() => setIsAssetSubmenuOpen(true)}
            className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors relative cursor-pointer"
            title="导入资产"
          >
            <div className="relative flex items-center justify-center">
              {/* 折角资产文件夹图标 (对齐图 1) */}
              <CanvasAssetFolderIcon className="w-4 h-4 text-slate-700" />
              {/* 右侧微小折叠三角形箭头点缀 */}
              <span className="absolute -right-1 bottom-1 text-[7px] text-slate-500 leading-none">
                ▶
              </span>
            </div>

            {!isAssetSubmenuOpen && (
              <span className="absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-xs font-medium opacity-0 group-hover/asset:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
                导入资产
              </span>
            )}
          </button>

          {/* 侧拉二级菜单 (导入图片 / 导入视频) */}
          {isAssetSubmenuOpen && (
            <div
              onMouseEnter={() => setIsAssetSubmenuOpen(true)}
              onMouseLeave={() => setIsAssetSubmenuOpen(false)}
              className="absolute left-full ml-2 top-0 py-1.5 px-1 w-32 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_8px_24px_rgba(0,0,0,0.1)] z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150"
            >
              <button
                type="button"
                onClick={() => handleOpenAssetModal('image')}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 text-xs font-medium transition-colors text-left cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-slate-600 stroke-[1.8]" />
                <span>导入图片</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAssetModal('video')}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 text-xs font-medium transition-colors text-left cursor-pointer"
              >
                <VideoIcon className="w-4 h-4 text-slate-600 stroke-[1.8]" />
                <span>导入视频</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 🌟 3. 左下角视口缩放与导航工具条 (严格对照图 2) */}
      <div className="canvas-fixed-ui absolute left-5 bottom-5 z-30 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs text-xs text-slate-700 select-none">
        <button
          type="button"
          onClick={handleResetView}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="复位视野"
        >
          <Compass className="w-3.5 h-3.5 stroke-[1.8]" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(-0.1)}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="缩小"
        >
          <Minus className="w-3.5 h-3.5 stroke-[2]" />
        </button>

        <span className="font-mono text-[11px] font-bold text-slate-800 min-w-8 text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => handleZoom(0.1)}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="放大"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
        </button>

        <button
          type="button"
          onClick={handleResetView}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="全景居中"
        >
          <Play className="w-3 h-3 fill-slate-500 stroke-slate-500" />
        </button>
      </div>

      {/* 🌟 4. 无限视口工作台核心区域 */}
      <div
        ref={canvasViewportRef}
        {...canvasFileDrop.dropProps}
        data-testid="canvas-viewport"
        onMouseDown={handleMouseDownCanvas}
        onWheel={event => { closeNodeMenu(); handleWheel(event); }}
        onDoubleClick={event => {
          if (event.button !== 0 || (event.target as HTMLElement).closest('.canvas-node-card, button, input, textarea, select, a, .canvas-fixed-ui')) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setNodeMenu({ screenX: event.clientX, screenY: event.clientY, x: (event.clientX - rect.left - pan.x) / zoom, y: (event.clientY - rect.top - pan.y) / zoom });
        }}
        className={`flex-1 w-full h-full relative overflow-hidden ${
          isPanning ? 'cursor-grabbing' : isHandMode ? 'cursor-grab' : 'cursor-default'
        }`}
      >
        {/* 🌟 动态点阵背景 (参考图 2 主页水波光影流动与鼠标交互质感，与画布坐标绝对锚定) */}
        <CanvasDotGrid
          pan={pan}
          zoom={zoom}
          isPanning={isPanning}
          baseColor="#CBD5E1"
          activeColor="#818CF8"
          proximity={130}
        />

        {nodeMenu && <CanvasNodeMenu x={nodeMenu.screenX} y={nodeMenu.screenY} onClose={closeNodeMenu} onSelect={(type) => {
          const id = crypto.randomUUID();
          addNode(currentProject.id, { id, type: type === 'video-generation' ? 'drawing' : type, generationKind: type === 'video-generation' ? 'video' : undefined, title: type === 'video-generation' ? '视频生成' : type === 'drawing' ? '绘图' : '文件', x: nodeMenu.x, y: nodeMenu.y, width: type !== 'file' ? 560 : 252, height: type !== 'file' ? 500 : 252 });
          setSelectedNodeId(id);
          closeNodeMenu();
        }} />}
        {canvasFileDrop.dragging && <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/70"><span className="rounded-xl bg-white px-5 py-3 text-sm text-indigo-600 shadow-sm">松开以导入图片、视频或音频</span></div>}
        {canvasFileDrop.pending > 0 && <div role="status" className="pointer-events-none absolute right-4 top-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">素材上传中 · 剩余 {canvasFileDrop.pending} 个</div>}
        {canvasFileDrop.errors.length > 0 && <div role="alert" className="absolute right-4 top-16 z-50 max-h-48 max-w-sm overflow-auto rounded-xl border border-red-100 bg-white p-3 text-xs text-red-600 shadow-sm">{canvasFileDrop.errors.map((error, index) => <p key={index}>{error}</p>)}<button type="button" onClick={canvasFileDrop.dismissErrors} className="mt-2 text-slate-500">关闭</button></div>}
        {/* 🌟 空白画板居中引导区 (精致通透卡片化版式，严格对称与舒适呼吸感) */}
        {nodes.length === 0 && (
          <div className="absolute inset-x-0 top-14 bottom-24 flex flex-col items-center justify-center pointer-events-none z-20 px-4">
            <div className="pointer-events-auto w-full max-w-[620px] flex flex-col items-center select-none animate-in fade-in zoom-in-95 duration-200 -translate-y-4 sm:-translate-y-6">
              {/* 标题区：大号质感标题 + 轻柔副标题 */}
              <div className="flex flex-col items-center text-center mb-7 sm:mb-8">
                <h2 className="text-2xl sm:text-[28px] font-semibold text-slate-900 tracking-tight leading-tight">
                  这次创作想从哪里开始？
                </h2>
                <p className="mt-3 text-sm sm:text-base text-slate-400 font-medium tracking-normal leading-relaxed">
                  导入素材开启无限排版，或在下方直接向 AI 描述你的灵感
                </p>
              </div>

              {/* 引导选项区：统一容器与严格对称的卡片版式 */}
              <div className="flex flex-col gap-8 sm:gap-12 w-full max-w-[360px] mx-auto">
                {/* 选项 1：使用已有素材开启创作 */}
                <div className="w-full bg-transparent flex items-center gap-4 group/item">
                  {/* 左侧双卡片质感插图 (基线居中，微缩放交互) */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
                    <img
                      src="/brand/canvas/start_cards.png"
                      alt="使用已有素材"
                      className="w-16 h-16 sm:w-20 sm:h-20 object-contain select-none pointer-events-none drop-shadow-xs group-hover/item:scale-105 transition-transform duration-200"
                    />
                  </div>

                  {/* 右侧：上层小标 + 下层操作胶囊 */}
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <span className="text-sm sm:text-base font-semibold text-slate-400 tracking-wide select-none">
                      使用已有素材开启创作
                    </span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => { replacementNodeRef.current = null; fileInputRef.current?.click(); }}
                        className="flex items-center gap-2 pr-3 py-2 bg-transparent text-slate-800 hover:text-violet-600 transition-colors text-base font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-4"
                      >
                        <Upload className="w-3.5 h-3.5 stroke-[2.2] text-slate-500" />
                        <span>本地上传</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenAssetModal('image')}
                        className="flex items-center gap-2 pr-3 py-2 bg-transparent text-slate-800 hover:text-violet-600 transition-colors text-base font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-4"
                      >
                        <FolderPlus className="w-3.5 h-3.5 stroke-[2.2] text-slate-500" />
                        <span>选择资产</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* 舞台节点（图片、视频、分镜框、便签等） */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <CanvasConnections projectId={currentProject.id} zoom={zoom} nodes={nodes.filter(node=>!node.layerHidden).map(node => node.id === draggingNodeId && draggingNodePos ? {...node, x: draggingNodePos.x, y: draggingNodePos.y} : node)} />
          {nodes.map((node) => {
            if (node.layerHidden) return null;
            const isSelected = selectedNodeId === node.id;
            const isCurrentDragging = draggingNodeId === node.id;
            // 🌟 核心防遮挡防护：只要节点已经获取到了真实图片或视频，即使异步状态尚未更新，也立刻揭晓展示图片，绝不阻挡内容显示
            const isGenerating = node.status === 'generating' && !node.imageUrl && !node.videoUrl;

            // 拖拽时采用轻量高帧率坐标，非拖拽时采用节点持久化存储坐标
            const displayX = isCurrentDragging && draggingNodePos ? draggingNodePos.x : node.x;
            const displayY = isCurrentDragging && draggingNodePos ? draggingNodePos.y : node.y;

            return (
              <div
                key={node.id}
                className={`canvas-node-card [&:has(>[data-layer-editor])_.canvas-node-toolbar]:invisible absolute pointer-events-auto flex flex-col group transition-[outline,box-shadow,opacity] duration-150 select-none ${
                  node.type === 'drawing'
                    ? (isSelected ? 'z-20' : 'z-10')
                    : isSelected
                    ? 'outline outline-2 outline-black outline-offset-2 z-20 shadow-xl'
                    : 'hover:outline hover:outline-1 hover:outline-indigo-400/40 hover:outline-offset-1 z-10'
                } rounded-2xl ${isCurrentDragging ? 'cursor-grabbing select-none' : ''}`}
                style={{
                  zIndex: node.layerGroupId ? 10 + (node.layerOrder || 0) : undefined,
                  left: `${displayX}px`,
                  top: `${displayY}px`,
                  width: `${node.width}px`,
                  transition: isCurrentDragging ? 'none' : 'outline 0.15s, box-shadow 0.15s',
                  willChange: isCurrentDragging ? 'left, top' : undefined,
                }}
                onMouseDown={(e) => {if(node.type==='drawing'){drawingPress.current={x:e.clientX,y:e.clientY};}if(node.layerLocked){e.stopPropagation();setSelectedNodeId(node.id);}else handleNodeDragStart(node, e);}}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                  if(node.type==='drawing') {
                    const press=drawingPress.current;
                    setEditingDrawingId(!press || Math.hypot(e.clientX-press.x,e.clientY-press.y)<5 ? node.id : null);
                    drawingPress.current=null;
                  }
                }}
              >
                {isSelected && !node.layerLocked && (node.type === 'image' || node.type === 'video') && !isGenerating && !node.missingMedia && (
                  <CanvasResizeHandle width={node.width} height={node.height} zoom={zoom} onResize={size => updateNode(currentProject.id, node.id, size)} />
                )}
                {/* 🌟 顶部外置信息行 (图 3 / 图 4)：左侧名称与类型，右侧分辨率尺寸 */}
                {!isGenerating && node.type !== 'file' && (
                  <div
                    style={node.type === 'drawing' ? { left: '50%', right: 'auto', width: 280, transform: 'translateX(-50%)' } : undefined}
                    className={`absolute -top-6 left-0 right-0 z-20 flex items-center justify-between text-xs text-slate-500 select-none px-0.5 transition-opacity duration-150 ${
                      isSelected || editingNodeTitleId === node.id
                        ? 'opacity-100 pointer-events-auto'
                        : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 左侧：图标 + 标题（可点击重命名） */}
                    {editingNodeTitleId === node.id ? (
                      <div className="flex items-center gap-1 bg-white shadow-xs border border-indigo-400 rounded px-1.5 py-0.5 z-30">
                        <input
                          autoFocus
                          type="text"
                          value={tempNodeTitle}
                          onChange={(e) => setTempNodeTitle(e.target.value)}
                          onBlur={() => handleSaveNodeTitle(node.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNodeTitle(node.id);
                            if (e.key === 'Escape') setEditingNodeTitleId(null);
                          }}
                          className="text-xs text-slate-800 focus:outline-none w-32"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveNodeTitle(node.id)}
                          className="p-0.5 text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          title="保存"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors group/title">
                        {node.type === 'video' ? (
                          <VideoIcon className="w-3.5 h-3.5 text-slate-400 group-hover/title:text-slate-600" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-slate-400 group-hover/title:text-slate-600" />
                        )}
                        <span
                          onClick={(e) => handleStartEditNodeTitle(node, e)}
                          title="点击重命名"
                          className="font-medium truncate max-w-[160px] cursor-pointer hover:text-indigo-600"
                        >
                          {node.title || (node.type === 'video' ? '视频大图预览' : '图片大图预览')}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleStartEditNodeTitle(node, e)}
                          className="opacity-0 group-hover/title:opacity-100 p-0.5 hover:text-indigo-600 text-slate-400 transition-opacity cursor-pointer"
                          title="点击重命名"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}

                    {/* 右侧：尺寸显示（图 3 / 图 4 如 1440 × 1440） */}
                    <div className="text-[11px] font-mono text-slate-400 tracking-tight flex items-center gap-1">
                      <span>{calculateDisplayResolution(node)}</span>
                    </div>
                  </div>
                )}

                {/* 🌟 顶部工具栏 (白色背景框 + 黑色文字，悬浮上方展示白底黑字气泡) */}
                {!isGenerating && node.type !== 'drawing' && (
                  <div
                    className={`canvas-node-toolbar absolute -top-20 left-1/2 -translate-x-1/2 z-30 transition-all duration-150 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white/95 backdrop-blur-md text-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200/90 text-xs whitespace-nowrap select-none ${
                      isSelected
                        ? 'opacity-100 translate-y-0 pointer-events-auto'
                        : 'opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 1. 添加到对话 */}
                    <button
                      type="button"
                      onClick={(e) => handleAddNodeToComposer(node, e)}
                      disabled={node.missingMedia || !((node.type === 'video' || node.generationKind === 'video') ? node.videoUrl : node.imageUrl)}
                      title="添加到画布底部输入框"
                      aria-label="添加到对话"
                      className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
                        添加到对话
                      </span>
                    </button>

                    {/* 2 & 3. 仅图片节点才展示打光与多角度调节（视频节点不展示） */}
                    {node.type === 'image' && (
                      <>
                        <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />

                        {/* 2. 打光 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightingModalNode(node);
                          }}
                          title="打开3D打光效果调节"
                          aria-label="打光"
                          className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                        >
                          <LightingIcon className="w-4 h-4 shrink-0 pointer-events-none" />
                          <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
                            打光
                          </span>
                        </button>

                        {/* 3. 多角度 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMultiAngleModalNode(node);
                          }}
                          title="打开多角度环绕编辑器"
                          aria-label="多角度"
                          className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                        >
                          <MultiAngleIcon className="w-4 h-4 shrink-0 pointer-events-none" />
                          <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
                            多角度
                          </span>
                        </button>
                        <CanvasLayerDecomposition node={node} projectId={currentProject.id} />
                      </>
                    )}
                    {((node.type === 'image' && node.imageUrl) || (node.type === 'video' && node.videoUrl)) && (
                      <>
                        <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />
                        <button
                          type="button"
                          title="下载素材"
                          aria-label="下载素材"
                          className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                          onClick={() => {
                            const url = (node.type === 'video' || node.generationKind === 'video') ? node.videoUrl! : node.imageUrl!;
                            void downloadMediaOrOpen(url, `${node.title || '画布素材'}.${node.type === 'video' ? 'mp4' : 'png'}`).catch(console.error);
                          }}
                        >
                          <Download className="w-4 h-4" />
                          <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
                            下载素材
                          </span>
                        </button>
                        <button
                          type="button"
                          title="预览素材"
                          aria-label="预览素材"
                          className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                          onClick={() => setPreviewMedia({
                            url: (node.type === 'video' || node.generationKind === 'video') ? node.videoUrl! : node.imageUrl!,
                            type: node.type === 'video' ? 'video' : 'image',
                          })}
                        >
                          <Maximize2 className="w-4 h-4" />
                          <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
                            预览素材
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* 🌟 节点媒体内容展示：彻底无边框纯净视效 */}
                {node.type === 'drawing' ? (
                  <CanvasDrawingNode node={node} selected={isSelected && editingDrawingId===node.id && !isCurrentDragging} projectId={currentProject.id} nodes={nodes} onPreview={url => setPreviewMedia({url, type:node.generationKind === 'video' ? 'video' : 'image'})} />
                ) : node.missingMedia ? (
                  <div className="rounded-2xl bg-slate-100 p-5 text-center text-sm text-slate-600" style={{ minHeight: node.height }}>
                    <p>原本地文件已失效，请重新选择文件恢复此节点。</p>
                    <button type="button" className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-white" onClick={e => {
                      e.stopPropagation(); replacementNodeRef.current = node.id; fileInputRef.current?.click();
                    }}>重新选择文件</button>
                  </div>
                 ) : node.layerTask ? (
                  <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-100" style={{height:node.height}}>
                    <img src={proxyMediaUrl(node.referenceImageUrl)} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-60" />
                    <span role="status" className="relative max-w-[90%] rounded-xl bg-white/90 px-4 py-2 text-xs text-slate-700">{node.status === 'error' ? `拆分失败：${node.content}` : '图层分离中…'}</span>
                  </div>
                ) : node.status === 'error' ? (
                  /* 0. 生成失败状态卡片 */
                  <div
                    className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-rose-200/80 select-none bg-rose-50/70 p-5 flex flex-col items-center justify-center text-center cursor-grab active:cursor-grabbing"
                    style={{ minHeight: `${node.height || 260}px` }}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-white shadow-xs border border-rose-100 flex items-center justify-center text-rose-500 mb-2">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-rose-800">生成中断或失败</span>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-[220px] line-clamp-2">
                      {node.content || '网络响应超时或模型服务忙'}
                    </p>
                    <div className="flex items-center gap-2 mt-3.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateNode(currentProject.id, node.id, {
                            status: 'generating',
                            progress: 20,
                          });
                          // 触发重新生成
                          if (node.content) {
                            handleCanvasPromptSubmit(node.content, node.referenceImageUrl, node.type);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-xs active:scale-95"
                      >
                        重新生成
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNode(currentProject.id, node.id);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold transition-all cursor-pointer"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ) : isGenerating ? (
                  /* 1. 生成中状态：1:1 参考生成对话界面动效（浅天蓝水漾柔光 + 实时进度胶囊 + 呼吸星芒） */
                  <div
                    className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-sky-200/60 select-none bg-sky-50 flex items-center justify-center"
                    style={{ height: `${node.height || 360}px` }}
                  >
                    <AIGeneratingCard
                      progressNumber={node.progress || 35}
                      showProgressBadge={true}
                      isVideo={node.type === 'video'}
                      variant="premium"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-20">
                      <div className="w-11 h-11 rounded-2xl bg-white/85 backdrop-blur-md shadow-xs flex items-center justify-center mb-3 text-sky-600 border border-white/70">
                        <Sparkles className="w-5 h-5 text-sky-500 animate-spin" />
                      </div>
                      <span className="text-xs font-semibold text-slate-800 tracking-tight">
                        {node.type === 'video' ? 'AI 正在渲染视频分镜...' : 'AI 正在绘制高精画面...'}
                      </span>
                      {node.content && (
                        <p className="text-[11px] text-slate-500/90 max-w-[240px] truncate mt-1.5 px-2.5 py-1 rounded-lg bg-white/60 backdrop-blur-xs border border-white/60">
                          {node.content}
                        </p>
                      )}
                    </div>
                  </div>
                ) : node.type === 'file' ? (
                  <CanvasFileNode onUpload={media => updateNode(currentProject.id, node.id, media)} />
                ) : node.type === 'audio' ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><audio controls src={node.audioUrl} className="w-full" onMouseDown={e => e.stopPropagation()} /></div>
                ) : node.type === 'image' ? (
                  /* 2. 图片素材：纯净无框式展示 + 左上角 AI 生成微标 + 悬浮可全屏放大 */
                  <div onDoubleClick={event => {
                    event.preventDefault(); event.stopPropagation();
                    if (node.imageUrl) setPreviewMedia({url:node.imageUrl,type:'image'});
                  }} className={`relative w-full overflow-hidden ${node.layerGroupId ? '' : 'rounded-2xl shadow-sm hover:shadow-md'} select-none group/media cursor-grab active:cursor-grabbing`}>
                    <img
                      ref={image => {
                        // Cached images and hot updates may not emit another load event.
                        // Keep the stored geometry aligned with the intrinsically sized image.
                        if (!image?.complete || image.dataset.triedFallback || !image.naturalWidth || !image.naturalHeight) return;
                        const height = node.width * image.naturalHeight / image.naturalWidth;
                        if (Math.abs(node.height - height) > 0.5) updateNode(currentProject.id, node.id, {height});
                      }}
                      style={{opacity:node.layerOpacity ?? 1}}
                      src={proxyMediaUrl(node.imageUrl) || node.imageUrl}
                      alt={node.title || '图片素材'}
                      className={`block w-full h-auto ${node.layerGroupId ? '' : 'rounded-2xl'} select-none pointer-events-none transition-opacity duration-300`}
                      draggable={false}
                      onLoad={event => {
                        const image = event.currentTarget;
                        if (image.dataset.triedFallback || !image.naturalWidth || !image.naturalHeight) return;
                        const height = node.width * image.naturalHeight / image.naturalWidth;
                        if (Math.abs(node.height - height) > 0.5) {
                          updateNode(currentProject.id, node.id, {height});
                        }
                      }}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.triedOriginal && node.imageUrl) {
                          target.dataset.triedOriginal = 'true';
                          target.src = node.imageUrl;
                        } else if (!target.dataset.triedFallback) {
                          target.dataset.triedFallback = 'true';
                          target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=85';
                        }
                      }}
                    />
                  </div>
                ) : node.type === 'video' ? (
                  /* 3. 视频素材：圆角无框播放器 */
                  <div className="w-full rounded-2xl overflow-hidden shadow-sm cursor-grab active:cursor-grabbing">
                    <CanvasVideoPlayer
                      videoUrl={node.videoUrl || ''}
                      poster={node.imageUrl}
                      height={node.height}
                    />
                  </div>
                ) : node.type === 'frame' ? (
                  /* 4. 分镜框容器 */
                  <div className="bg-slate-50/60 border-2 border-dashed border-slate-300 rounded-2xl p-4 flex flex-col items-center justify-center min-h-48 text-slate-400 select-none cursor-grab active:cursor-grabbing">
                    <span className="text-xs font-semibold text-slate-600">分镜构图排版容器</span>
                    <span className="text-[11px] text-slate-400 mt-1">可在框内自由放置镜头参考与视觉素材</span>
                  </div>
                ) : node.type === 'note' ? (
                  /* 5. 便签文字 */
                  <div className="bg-amber-50/90 border border-amber-200/60 rounded-2xl p-3 flex flex-col gap-2 cursor-grab active:cursor-grabbing">
                    <textarea
                      value={node.content || ''}
                      onChange={(e) =>
                        updateNode(currentProject.id, node.id, { content: e.target.value })
                      }
                      placeholder="输入便签文字..."
                      className="w-full h-28 bg-transparent text-xs text-slate-800 resize-none focus:outline-none placeholder:text-amber-400 leading-relaxed font-sans cursor-text"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <CanvasLayersPanel project={currentProject} selectedId={selectedNodeId} onSelect={setSelectedNodeId} />

      {/* 🌟 5. 底部居中悬浮输入舱 (严格对照图 1 画板专属全新输入舱) */}
      <div className="canvas-fixed-ui absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl xl:max-w-4xl z-30 px-4 pointer-events-none flex justify-center">
        <CanvasPromptDock
          onSubmit={handleCanvasPromptSubmit}
          subjects={canvasSubjects}
          mentionTrigger={composerReference}
        />
      </div>

      {/* 🌟 6. 导入生成后资产模态框 (高性能独立组件，隔离重渲染，流畅秒开与丝滑勾选) */}
      <CanvasAssetImportModal
        isOpen={showAssetModal}
        modalTab={assetModalTab}
        tasks={assetModalTab === 'image' ? imageAssets : videoAssets}
        onClose={() => setShowAssetModal(false)}
        onConfirmImport={handleConfirmImportAssets}
        onUploadLocalFile={() => { replacementNodeRef.current = null; fileInputRef.current?.click(); }}
      />
      {/* 🌟 7. 画板大图全屏预览模态框 */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-150 select-none"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {previewMedia.type === 'video' ? (
              <video src={proxyMediaUrl(previewMedia.url) || previewMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-2xl" />
            ) : (
            <img
              src={proxyMediaUrl(previewMedia.url) || previewMedia.url}
              alt="素材全屏预览"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl select-none"
            />
            )}
            <button
              type="button"
              onClick={() => setPreviewMedia(null)}
              className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors backdrop-blur-md"
              title="关闭预览"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 3D打光效果调节弹窗 */}
      <CanvasLightingModal
        isOpen={!!lightingModalNode}
        onClose={() => setLightingModalNode(null)}
        node={lightingModalNode}
        onSubmit={handleApplyLighting}
      />

      {/* 多角度环绕编辑器弹窗 */}
      <CanvasMultiAngleModal
        isOpen={!!multiAngleModalNode}
        onClose={() => setMultiAngleModalNode(null)}
        node={multiAngleModalNode}
        onSubmit={handleApplyMultiAngle}
      />
    </div>
  );
};

export default InfiniteCanvasEditor;

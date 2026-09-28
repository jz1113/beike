import { persistCanvasMedia } from '../model/canvasMediaImport';
import { buildLightingDerivedNode, buildMultiAngleDerivedNode } from '../utils/canvasNodeHelpers';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { type CanvasQuickNodeType } from '../components/CanvasNodeMenu';
import { type LightingParams } from '../components/CanvasLightingModal';
import { type MultiAngleParams } from '@client/shared/modals/multiAngle';
import type { CanvasNode, CanvasProject, CanvasSubject } from '../model/types';
import type { GenerationTask } from '@client/store/appStoreTypes';
import type { useCanvasStore } from '../store/useCanvasStore';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type RefObject } from 'react';

type CanvasStore = ReturnType<typeof useCanvasStore.getState>;

type StarterNodeKind = 'text-video' | 'image-background' | 'first-frame-video';

function isGenerationTaskVideo(task: GenerationTask) {
  const url = task.resultUrl || (task as GenerationTask & { videoUrl?: string; outputUrl?: string }).videoUrl
    || (task as GenerationTask & { outputUrl?: string }).outputUrl;
  const extra = task as GenerationTask & { videoUrl?: string };
  return Boolean(
    task.mediaType === 'video'
      || task.mediaType === 'depth-video'
      || (task.model && String(task.model).toLowerCase().includes('video'))
      || (task.id && String(task.id).startsWith('depth_video_'))
      || extra.videoUrl
      || isVideoMediaUrl(url),
  );
}

export function useCanvasNodeActions(options: {
  currentProject: CanvasProject | undefined;
  pan: { x: number; y: number };
  zoom: number;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  draggingNodeId: string | null;
  isEditingTitle: boolean;
  addNode: CanvasStore['addNode'];
  updateNode: CanvasStore['updateNode'];
  deleteNode: CanvasStore['deleteNode'];
  generationTasks: GenerationTask[];
}) {
  const {
    currentProject, pan, zoom, canvasViewportRef, setSelectedNodeId,
    addNode, updateNode, generationTasks,
  } = options;

  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const drawingPress = useRef<{ x: number; y: number } | null>(null);
  const [editingNodeTitleId, setEditingNodeTitleId] = useState<string | null>(null);
  const [tempNodeTitle, setTempNodeTitle] = useState('');
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [lightingModalNode, setLightingModalNode] = useState<CanvasNode | null>(null);
  const [multiAngleModalNode, setMultiAngleModalNode] = useState<CanvasNode | null>(null);
  const [composerReference, setComposerReference] = useState<{ name: string; url: string; type: 'image' | 'video'; timestamp: number; attachOnly: boolean } | null>(null);
  const [isAssetSubmenuOpen, setIsAssetSubmenuOpen] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetModalTab, setAssetModalTab] = useState<'image' | 'video'>('image');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replacementNodeRef = useRef<string | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ screenX: number; screenY: number; x: number; y: number } | null>(null);

  const handleStartEditNodeTitle = (node: CanvasNode, e?: MouseEvent) => {
    e?.stopPropagation();
    setEditingNodeTitleId(node.id);
    setTempNodeTitle(node.title || '');
  };

  const handleSaveNodeTitle = (nodeId: string) => {
    if (currentProject) {
      const trimmed = tempNodeTitle.trim();
      const node = currentProject.nodes.find((item) => item.id === nodeId);
      updateNode(currentProject.id, nodeId, {
        title: trimmed || (node?.type === 'video' ? '视频素材' : '图片素材'),
      });
    }
    setEditingNodeTitleId(null);
  };

  const handleApplyLighting = (params: LightingParams, applyOptions?: { model?: string; quality?: string; aspectRatio?: string }) => {
    if (!currentProject || !lightingModalNode) return;
    addNode(currentProject.id, buildLightingDerivedNode(lightingModalNode, params, applyOptions));
  };

  const handleApplyMultiAngle = (params: MultiAngleParams, applyOptions?: { model?: string; quality?: string; aspectRatio?: string }) => {
    if (!currentProject || !multiAngleModalNode) return;
    addNode(currentProject.id, buildMultiAngleDerivedNode(multiAngleModalNode, params, applyOptions));
  };

  const handleAddNodeToComposer = (node: CanvasNode, e?: MouseEvent) => {
    e?.stopPropagation();
    const url = (node.type === 'video' || node.generationKind === 'video') ? node.videoUrl : node.imageUrl;
    if (!url) return;
    const isVideo = node.type === 'video';
    setComposerReference({
      name: node.title || (isVideo ? '视频素材' : '图片素材'),
      url,
      type: isVideo ? 'video' : 'image',
      timestamp: Date.now(),
      attachOnly: true,
    });
  };

  const handleOpenAssetModal = useCallback((type: 'image' | 'video') => {
    setAssetModalTab(type);
    setShowAssetModal(true);
    setIsAssetSubmenuOpen(false);
  }, []);

  const closeNodeMenu = useCallback(() => setNodeMenu(null), []);
  useEffect(closeNodeMenu, [currentProject?.id, closeNodeMenu]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const replacementId = replacementNodeRef.current;
    replacementNodeRef.current = null;
    e.target.value = '';
    if (!file || !currentProject) return;
    const viewCenterX = (-pan.x + (canvasViewportRef.current?.clientWidth || 900) / 2) / zoom;
    const viewCenterY = (-pan.y + (canvasViewportRef.current?.clientHeight || 600) / 2) / zoom;
    try {
      const media = await persistCanvasMedia(file, viewCenterX, viewCenterY);
      if (replacementId) {
        updateNode(currentProject.id, replacementId, { missingMedia: false, imageUrl: media.imageUrl, videoUrl: media.videoUrl, type: media.type });
        replacementNodeRef.current = null;
      } else addNode(currentProject.id, media);
    } catch (error) {
      window.alert(`素材保存失败，请重新选择文件重试：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const nodes = useMemo(() => currentProject?.nodes ?? [], [currentProject?.nodes]);
  const displayProjectTitle = !currentProject || currentProject.draft || currentProject.title === '新建画布' || (!nodes.length && /^\d+$/.test(currentProject.title.trim()))
    ? '未命名项目'
    : currentProject.title;

  const canvasSubjects = useMemo<CanvasSubject[]>(() => {
    return nodes
      .filter((n) => (n.type === 'image' || n.type === 'video') && (n.imageUrl || n.videoUrl))
      .map((n) => ({
        id: n.id,
        name: n.title || (n.type === 'video' ? '视频素材' : '图片素材'),
        type: n.type as 'image' | 'video',
        url: (n.imageUrl || n.videoUrl)!,
      }));
  }, [nodes]);

  const validTasks = useMemo(() => {
    return generationTasks.filter((task) => {
      const extra = task as GenerationTask & { outputUrl?: string; videoUrl?: string };
      return (task.status === 'SUCCESS' || !task.status) && (task.resultUrl || extra.outputUrl || extra.videoUrl);
    });
  }, [generationTasks]);

  const imageAssets = useMemo(() => validTasks.filter((task) => !isGenerationTaskVideo(task)), [validTasks]);
  const videoAssets = useMemo(() => validTasks.filter((task) => isGenerationTaskVideo(task)), [validTasks]);

  const handleConfirmImportAssets = useCallback((selectedTasks: GenerationTask[]) => {
    if (!currentProject || selectedTasks.length === 0) return;
    const viewCenterX = (-pan.x + (canvasViewportRef.current?.clientWidth || 900) / 2) / zoom;
    const viewCenterY = (-pan.y + (canvasViewportRef.current?.clientHeight || 600) / 2) / zoom;

    selectedTasks.forEach((task, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const offsetX = (col - 1) * 320;
      const offsetY = (row - 1) * 440;
      const extra = task as GenerationTask & { outputUrl?: string; videoUrl?: string };

      if (assetModalTab === 'image') {
        addNode(currentProject.id, {
          type: 'image',
          title: (task.title || task.prompt || '资产图片').replace(/[\r\n]+/g, ' ').slice(0, 36),
          imageUrl: task.resultUrl || extra.outputUrl,
          x: Math.round(viewCenterX - 150 + offsetX),
          y: Math.round(viewCenterY - 200 + offsetY),
          width: 300,
          height: 400,
        });
      } else {
        addNode(currentProject.id, {
          type: 'video',
          title: (task.title || task.prompt || '资产视频').replace(/[\r\n]+/g, ' ').slice(0, 36),
          videoUrl: task.resultUrl || extra.videoUrl || extra.outputUrl,
          imageUrl: task.productImageUrl || task.referenceImageUrl,
          x: Math.round(viewCenterX - 140 + offsetX),
          y: Math.round(viewCenterY - 240 + offsetY),
          width: 280,
          height: 480,
        });
      }
    });

    setShowAssetModal(false);
  }, [currentProject, pan.x, pan.y, zoom, assetModalTab, addNode, canvasViewportRef]);

  const handleCreateStarterNode = useCallback((kind: StarterNodeKind) => {
    if (!currentProject) return;
    const viewport = canvasViewportRef.current;
    const centerX = (-pan.x + (viewport?.clientWidth || 900) / 2) / zoom;
    const centerY = (-pan.y + (viewport?.clientHeight || 600) / 2) / zoom;
    const isImage = kind === 'image-background';
    const title = kind === 'text-video' ? '文字生视频' : kind === 'image-background' ? '图片换背景' : '首帧生成视频';
    const id = crypto.randomUUID();

    addNode(currentProject.id, {
      id,
      type: 'drawing',
      generationKind: isImage ? 'image' : 'video',
      title,
      x: Math.round(centerX - 280),
      y: Math.round(centerY - 250),
      width: 560,
      height: 500,
      drawing: isImage
        ? { model: '', quality: 'medium', aspect: '1:1', count: 1, references: [] }
        : {
            model: '',
            quality: '720P',
            aspect: '16:9',
            count: 1,
            references: [],
            ...(kind === 'first-frame-video' ? { refMode: 'first_frame' } : {}),
          },
    });
    setSelectedNodeId(id);
    setEditingDrawingId(id);
  }, [addNode, currentProject, pan.x, pan.y, setSelectedNodeId, zoom, canvasViewportRef]);

  const openNodeMenuAt = useCallback((clientX: number, clientY: number) => {
    const rect = canvasViewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setNodeMenu({
      screenX: clientX,
      screenY: clientY,
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    });
  }, [pan.x, pan.y, zoom, canvasViewportRef]);

  const handleCreateQuickNode = useCallback((kind: CanvasQuickNodeType) => {
    if (!currentProject) return;
    const isImageGeneration = kind === 'image-generation';
    const isVideoGeneration = kind === 'video-generation';
    const type = isImageGeneration || isVideoGeneration ? 'drawing' : kind;
    const id = crypto.randomUUID();
    const dimensions = kind === 'prompt' ? { width: 300, height: 280 } : kind === 'file'
      ? { width: 252, height: 252 }
      : { width: 560, height: 500 };
    const title = isImageGeneration
      ? '图片生成'
      : isVideoGeneration
        ? '视频生成'
        : kind === 'prompt' ? '文本' : '导入素材';

    addNode(currentProject.id, {
      id,
      type,
      generationKind: isImageGeneration ? 'image' : isVideoGeneration ? 'video' : undefined,
      title,
      x: nodeMenu?.x ?? ((canvasViewportRef.current?.clientWidth || 1000) / 2 - pan.x) / zoom - dimensions.width / 2,
      y: nodeMenu?.y ?? ((canvasViewportRef.current?.clientHeight || 700) / 2 - pan.y) / zoom - dimensions.height / 2,
      ...dimensions,
    });
    setSelectedNodeId(id);
    if (isImageGeneration || isVideoGeneration) setEditingDrawingId(id);
    closeNodeMenu();
  }, [addNode, closeNodeMenu, currentProject, nodeMenu, setSelectedNodeId, canvasViewportRef, pan.x, pan.y, zoom]);

  return {
    nodes,
    displayProjectTitle,
    canvasSubjects,
    imageAssets,
    videoAssets,
    editingDrawingId,
    setEditingDrawingId,
    drawingPress,
    editingNodeTitleId,
    setEditingNodeTitleId,
    tempNodeTitle,
    setTempNodeTitle,
    previewMedia,
    setPreviewMedia,
    lightingModalNode,
    setLightingModalNode,
    multiAngleModalNode,
    setMultiAngleModalNode,
    composerReference,
    isAssetSubmenuOpen,
    setIsAssetSubmenuOpen,
    showAssetModal,
    setShowAssetModal,
    assetModalTab,
    fileInputRef,
    replacementNodeRef,
    nodeMenu,
    closeNodeMenu,
    handleStartEditNodeTitle,
    handleSaveNodeTitle,
    handleApplyLighting,
    handleApplyMultiAngle,
    handleAddNodeToComposer,
    handleOpenAssetModal,
    handleFileChange,
    handleConfirmImportAssets,
    handleCreateStarterNode,
    openNodeMenuAt,
    handleCreateQuickNode,
  };
}

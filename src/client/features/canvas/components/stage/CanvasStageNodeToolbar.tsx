import { useContext, useEffect, useRef, useState, type SVGProps } from 'react';
import type React from 'react';
import { drawingGeometry, calculateDisplayResolution } from '../../model/canvasNodeFactory';
import '../../canvasMediaToolbar.css';
import { downloadMediaOrOpen } from '@client/shared/media/downloadMedia';
import {
  Aperture, AudioLines, Ban, Check, ChevronLeft, ChevronRight, Crop,
  Download, Film, GitCompare, Highlighter, Image as ImageIcon, Layers as LayersIcon,
  ImagePlus, Loader2, Maximize2,
  MoreHorizontal, Palette, PenLine,
  Upload, UserRound, Video as VideoIcon,
} from 'lucide-react';
import { DEFAULT_PORTRAIT_TEXTURE } from '../../model/canvasGraph';
import { extractVideoFrame } from '../../model/canvasVideoFrame';
import { useSeedancePrecheck } from '@client/shared/api/generation/seedancePrecheck';
import { SeedanceComplianceBadge } from '@client/shared/ui/SeedanceComplianceBadge';
import { useCanvasStore } from '../../store/useCanvasStore';
import { NativeStudioCommandsContext } from '../../hooks/useNativeStudioCommands';
import { canvasWorkflowUploadAccept, canvasWorkflowUploadSlot } from '../../model/videoWorkflowRecovery';
import {
  CanvasGridSkillsSubmenu,
  CanvasQuickSplitSubmenu,
} from './CanvasImageToolSubmenus';
import type { CanvasNode } from '../../model/types';

export interface CanvasStageNodeProps {
  isSelected: boolean;
  multiSelected: boolean;
  handleNodeClick?: (node: CanvasNode, event: React.MouseEvent) => boolean;
  onNodeContextMenu?: (node: CanvasNode, event: React.MouseEvent) => void;
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
  zoom: number;
  draggingNodeId: string | null;
  draggingNodePos: { x: number; y: number } | null;
  editingDrawingId: string | null;
  editingNodeTitleId: string | null;
  tempNodeTitle: string;
  drawingPress: React.MutableRefObject<{ x: number; y: number } | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  replacementNodeRef: React.MutableRefObject<string | null>;
  setSelectedNodeId: (id: string | null) => void;
  setEditingDrawingId: (id: string | null) => void;
  setTempNodeTitle: (value: string) => void;
  setEditingNodeTitleId: (id: string | null) => void;
  handleNodeDragStart: (node: CanvasNode, e: React.MouseEvent) => void;
  handleStartEditNodeTitle: (node: CanvasNode, e?: React.MouseEvent) => void;
  handleSaveNodeTitle: (nodeId: string) => void;
  handleAddNodeToComposer: (node: CanvasNode, e?: React.MouseEvent) => void;
  setLightingModalNode: (node: CanvasNode | null) => void;
  setMultiAngleModalNode: (node: CanvasNode | null) => void;
  setPreviewMedia: (media: { url: string; type: 'image' | 'video' } | null) => void;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
  onRegenerate: (node: CanvasNode) => void;
}

interface Props extends CanvasStageNodeProps {
  isSelected: boolean;
  isGenerating: boolean;
}

export function MultiAngleIcon({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>
      <path d="M4.5 9.5 12 5.5l7.5 4v8L12 21.5l-7.5-4v-8Z" />
      <path d="M4.5 9.5 12 13.5 19.5 9.5" />
      <path d="M12 13.5V21.5" />
      <path d="M13.8 3.6c1.7.15 3.2 1.15 3.95 2.7" />
      <path d="m16.55 4.55 1.35 2.05-2.2.55" />
    </svg>
  );
}

export function LightingIcon({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true" className={className} {...props}>
      <path d="M8 11.73c.33 0 .6.27.6.6V14a.6.6 0 0 1-1.2 0v-1.67c0-.33.27-.6.6-.6m-4.02-1.55a.6.6 0 0 1 .85.84l-.94.94a.6.6 0 0 1-.85-.85zm7.2 0a.6.6 0 0 1 .85 0l.93.93a.6.6 0 0 1-.85.85l-.93-.94a.6.6 0 0 1 0-.84m-.51-3.78c.33 0 .6.27.6.6a3.27 3.27 0 0 1-6.54 0 .6.6 0 1 1 1.2 0 2.07 2.07 0 1 0 4.14 0c0-.33.27-.6.6-.6m-8 0a.6.6 0 0 1 0 1.2H1.33a.6.6 0 0 1 0-1.2zm12 0a.6.6 0 0 1 0 1.2h-1.34a.6.6 0 0 1 0-1.2zm0-2.67a.6.6 0 0 1 0 1.2H1.33a.6.6 0 0 1 0-1.2zM12 1.4a.6.6 0 0 1 0 1.2H4a.6.6 0 0 1 0-1.2z" />
    </svg>
  );
}

const PIN_SWATCHES = [
  { color: '#ffffff', label: '白色' },
  { color: '#ef4444', label: '红色' },
  { color: '#f97316', label: '橙色' },
  { color: '#eab308', label: '黄色' },
  { color: '#22c55e', label: '绿色' },
  { color: '#06b6d4', label: '青色' },
  { color: '#3b82f6', label: '蓝色' },
  { color: '#8b5cf6', label: '紫色' },
];

const floatBtnClass = (active = false) =>
  `relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
    active ? 'text-white dark:text-white' : 'text-zinc-700 hover:text-zinc-900 dark:text-white/90 dark:hover:text-white'
  }`;

const menuItemClass = (active = false) =>
  `flex w-full items-center gap-2.5 whitespace-nowrap px-3.5 py-2 text-left transition-colors cursor-pointer disabled:opacity-50 ${
    active
      ? 'bg-zinc-100 text-zinc-900 dark:bg-[#362923] dark:text-[#f5b895]'
      : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-[#362923] dark:hover:text-[#f5b895]'
  }`;

export function CanvasStageNodeToolbar({
  node, isSelected, isGenerating, editingNodeTitleId, tempNodeTitle, projectId,
  fileInputRef, replacementNodeRef,
  setTempNodeTitle, setEditingNodeTitleId, handleSaveNodeTitle, handleStartEditNodeTitle,
  setMultiAngleModalNode, setPreviewMedia,
  setSelectedNodeId, setEditingDrawingId, updateNode,
}: Props) {
  const [extracting, setExtracting] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [pinMenuOpen, setPinMenuOpen] = useState(false);
  const [precheckRequested] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const studioCommands = useContext(NativeStudioCommandsContext);

  const addNode = useCanvasStore((s) => s.addNode);
  const switchNodeRun = useCanvasStore((s) => s.switchNodeRun);

  const isVideo = node.type === 'video' || node.generationKind === 'video';
  const videoUrl = node.videoUrl;
  const imageUrl = node.imageUrl;
  const hasMedia = Boolean(isVideo ? videoUrl : imageUrl);
  const mediaUrl = (isVideo ? videoUrl : imageUrl) || '';

  const precheckMap = useSeedancePrecheck(
    hasMedia && precheckRequested ? [{ url: mediaUrl, mediaType: isVideo ? 'video' : 'image' }] : [],
    Boolean(hasMedia && precheckRequested),
  );
  const mediaPrecheck = mediaUrl ? precheckMap.get(mediaUrl) : undefined;

  useEffect(() => {
    if (!isSelected) {
      setToolsMenuOpen(false);
      setPinMenuOpen(false);
    }
  }, [isSelected]);

  useEffect(() => {
    if (!toolsMenuOpen && !pinMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[data-grid-skills-submenu="true"], [data-quick-grid-split-picker="true"]')) {
        return;
      }
      if (!toolbarRef.current?.contains(e.target as Node)) {
        setToolsMenuOpen(false);
        setPinMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [toolsMenuOpen, pinMenuOpen]);

  const closeAllMenus = () => {
    setToolsMenuOpen(false);
    setPinMenuOpen(false);
  };

  const createDepthVideo = (resolution: '480p' | '720p') => {
    if (!studioCommands?.insert || !studioCommands.connect) return;
    const scene = studioCommands.read();
    const id = crypto.randomUUID();
    const x = node.x + node.width + 64;
    const height = 250;
    const y = Math.max(node.y, ...scene.nodes.filter(item => Number(item.x || 0) < x + 344 && Number(item.x || 0) + Number(item.width || 0) > x)
      .map(item => Number(item.y || 0) + Number(item.height || 0) + 32));
    studioCommands.insert({
      id, type: 'gen-video', nodeName: `深度视频 · ${resolution}`, x, y, width: 320, height,
      prompt: '深度动作捕捉',
      settings: { beikeOperation: 'depth-video', resolution },
    });
    studioCommands.connect([...scene.connections, { id: crypto.randomUUID(), from: node.id, to: id }]);
    void studioCommands.run(id).catch(error => {
      studioCommands.update(id, undefined, { errorMsg: error instanceof Error ? error.message : '深度视频生成失败' });
    });
  };

  const handleExtractSingleFrame = async (atSec: number, suffix: string) => {
    if (!videoUrl || extracting) return;
    try {
      setExtracting(true);
      const { dataUrl, width, height } = await extractVideoFrame(videoUrl, atSec);
      const w = Math.min(width || 280, 320);
      const h = Math.round(w * ((height || 280) / (width || 280)));
      const x = node.x + node.width + 64;
      let y = node.y;
      const siblings = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes ?? [];
      const column = siblings.filter(item => !item.layerHidden && item.x < x + w && item.x + item.width > x);
      for (const item of column.sort((a, b) => a.y - b.y)) {
        if (item.y < y + h + 24 && item.y + item.height + 24 > y) y = item.y + item.height + 24;
      }
      addNode(projectId, {
        type: 'image', title: `${node.title || '视频'}-${suffix}`, imageUrl: dataUrl,
        x, y,
        width: w, height: h, resultWidth: width, resultHeight: height,
        referenceNodeIds: [node.id],
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '抽帧失败');
    } finally {
      setExtracting(false);
    }
  };

  const handleSpawnDownstream = (kind: 'gen-image' | 'gen-video' | 'doodle' | 'panorama' | 'extract-audio' | 'hd' | 'json' | 'portrait-texture') => {
    const nextId = crypto.randomUUID();
    const x = node.x + node.width + 68;
    const y = node.y;
    if (kind === 'gen-image') {
      addNode(projectId, { id: nextId, type: 'drawing', generationKind: 'image', title: `${node.title || '图片'} · 智能改图`, referenceNodeIds: [node.id], x, y, width: 250, height: 250 });
      setSelectedNodeId(nextId); setEditingDrawingId(nextId);
    } else if (kind === 'portrait-texture') {
      const existing = useCanvasStore.getState().projects.find((p) => p.id === projectId)?.nodes.find(
        (n) =>
          n.type === 'drawing' &&
          (n.title === '人像质感调节' || n.drawing?.portraitTexture?.isActive) &&
          (n.referenceNodeIds || []).includes(node.id),
      );
      if (existing) {
        setSelectedNodeId(existing.id);
        setEditingDrawingId(existing.id);
      } else {
        addNode(projectId, {
          id: nextId,
          type: 'drawing',
          generationKind: 'image',
          title: '人像质感调节',
          referenceNodeIds: [node.id],
          x: node.x + node.width + 88,
          y: node.y,
          width: 540,
          height: 304,
          drawing: {
            model: '',
            quality: 'medium',
            aspect: '16:9',
            count: 1,
            references: imageUrl ? [imageUrl] : [],
            portraitTexture: { ...DEFAULT_PORTRAIT_TEXTURE, isActive: true },
          },
        });
        setSelectedNodeId(nextId);
        setEditingDrawingId(nextId);
      }
    } else if (kind === 'gen-video') {
      addNode(projectId, { id: nextId, type: 'drawing', generationKind: 'video', title: `${node.title || '图片'} · 图生视频`, referenceNodeIds: [node.id], x, y, width: 444, height: 250 });
      setSelectedNodeId(nextId); setEditingDrawingId(nextId);
    } else if (kind === 'doodle') {
      addNode(projectId, { id: nextId, type: 'drawing', studioSubType: 'doodle-canvas', generationKind: 'image', title: '画板节点', referenceImageUrl: imageUrl, referenceNodeIds: [node.id], x, y, width: 360, height: 360 });
      setSelectedNodeId(nextId);
    } else if (kind === 'panorama') {
      addNode(projectId, { id: nextId, type: 'drawing', studioSubType: 'global-perspective', generationKind: 'image', title: '360 全景视角', referenceImageUrl: imageUrl, referenceNodeIds: [node.id], x, y, width: 340, height: 360 });
      setSelectedNodeId(nextId);
    } else if (kind === 'extract-audio' && videoUrl) {
      addNode(projectId, { id: nextId, type: 'audio', title: `${node.title || '视频'} · 提取音频`, audioUrl: videoUrl, referenceNodeIds: [node.id], x, y, width: 320, height: 120 });
      setSelectedNodeId(nextId);
    } else if (kind === 'hd') {
      const existing = useCanvasStore.getState().projects.find((p) => p.id === projectId)?.nodes.find(
        (n) => n.studioSubType === 'jimeng-super-resolution' && (n.referenceNodeIds || []).includes(node.id),
      );
      if (existing) {
        setSelectedNodeId(existing.id);
      } else {
        addNode(projectId, {
          id: nextId,
          type: 'drawing',
          studioSubType: 'jimeng-super-resolution',
          title: '图片增强',
          referenceNodeIds: [node.id],
          x: node.x + node.width + 88,
          y: node.y,
          width: 250,
          height: 250,
        });
        setSelectedNodeId(nextId);
      }
    } else if (kind === 'json') {
      const info = JSON.stringify({
        id: node.id,
        title: node.title || '图片',
        type: node.type,
        resolution: calculateDisplayResolution(node) || `${Math.round(node.width)}x${Math.round(node.height)}`,
        url: imageUrl || videoUrl || '',
      }, null, 2);
      addNode(projectId, { id: nextId, type: 'prompt', title: `${node.title || '图片'} · JSON`, content: info, referenceNodeIds: [node.id], x, y, width: 320, height: 220 });
      setSelectedNodeId(nextId);
    }
  };

  const toggleInlineTool = (toolKey: string) => {
    closeAllMenus();
    updateNode(projectId, node.id, {
      activeUploadTool: node.activeUploadTool === toolKey ? null : toolKey,
    });
  };

  const handleTogglePinColor = (color: string) => {
    const current = node.colorPins || [];
    const next = current.includes(color) ? current.filter((c) => c !== color) : [...current, color];
    updateNode(projectId, node.id, { colorPins: next });
  };

  const totalRuns = node.runs?.length || 0;
  const activeRun = node.activeRunIndex ?? 0;
  const activePins = node.colorPins || [];
  const hasActiveTool = Boolean(
    toolsMenuOpen || node.highlighted || (node.activeUploadTool && node.activeUploadTool !== 'multiAngle' && node.activeUploadTool !== 'cropSelect'),
  );

  return (
    <>
      {(editingNodeTitleId === node.id || (
        (!isGenerating || node.specialized?.operation === 'quick-split') && node.type !== 'file' &&
        node.type !== 'prompt' && node.studioSubType !== 'script-parse' && node.studioSubType !== 'table-editor-node'
      )) && (
        <div
          style={node.type === 'drawing' && !node.studioSubType ? { left: '50%', right: 'auto', width: drawingGeometry(node).width, transform: 'translateX(-50%)' } : undefined}
          className={`absolute -top-6 left-0 right-0 flex items-center justify-between text-xs select-none px-0.5 transition-opacity duration-150 ${editingNodeTitleId === node.id ? 'z-30' : 'z-20'} ${
            ['image', 'video', 'audio', 'compare'].includes(node.type) || isSelected || editingNodeTitleId === node.id
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {editingNodeTitleId === node.id ? (
            <div className="flex items-center gap-1 bg-white dark:bg-[#1B1B1E] shadow-xs border border-zinc-400 dark:border-white/25 rounded px-1.5 py-0.5 z-30">
              <input
                autoFocus type="text" aria-label="节点名称" value={tempNodeTitle}
                onChange={(e) => setTempNodeTitle(e.target.value)}
                onBlur={() => handleSaveNodeTitle(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNodeTitle(node.id);
                  if (e.key === 'Escape') setEditingNodeTitleId(null);
                }}
                className="text-xs text-slate-800 dark:text-white bg-transparent focus:outline-none w-28"
              />
              <button type="button" onClick={() => handleSaveNodeTitle(node.id)} className="p-0.5 text-zinc-600 dark:text-zinc-200 cursor-pointer" title="保存">
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1.5 text-zinc-600 dark:text-[rgba(245,245,245,0.6)]">
              {isGenerating && node.specialized?.operation === 'quick-split' ? (
                <Upload className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              ) : isVideo ? (
                <VideoIcon className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              ) : node.type === 'audio' ? (
                <AudioLines className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              ) : node.type === 'compare' ? (
                <GitCompare className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              ) : node.type === 'drawing' ? (
                <Palette className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              )}
              <span
                onClick={(e) => handleStartEditNodeTitle(node, e)}
                title="点击重命名"
                className="font-medium truncate max-w-[160px] cursor-text hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                {node.type === 'drawing' && (node.title === '图片生成' || node.title === '绘图')
                  ? '图片'
                  : node.type === 'audio' && (!node.title || node.title === 'AI 配音 / 语音')
                    ? '音频'
                    : node.title || (isVideo ? '视频' : '图片')}
              </span>
              {activePins.length > 0 && (
                <span className="inline-flex items-center gap-1 ml-0.5">
                  {activePins.map((color) => (
                    <span
                      key={color}
                      className="h-2 w-2 rounded-full border border-black/15 dark:border-white/25"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
              )}
              {totalRuns > 1 && (
                <div className="flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[10px] text-slate-600 dark:text-slate-300">
                  <button type="button" disabled={activeRun >= totalRuns - 1} onClick={() => switchNodeRun(projectId, node.id, activeRun + 1)} className="disabled:opacity-30 cursor-pointer" title="上一个版本">
                    <ChevronLeft size={12} />
                  </button>
                  <span className="font-mono">v{totalRuns - activeRun}/{totalRuns}</span>
                  <button type="button" disabled={activeRun <= 0} onClick={() => switchNodeRun(projectId, node.id, activeRun - 1)} className="disabled:opacity-30 cursor-pointer" title="下一个版本">
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-[9px] font-light tabular-nums text-zinc-500 dark:text-zinc-200">
            {precheckRequested && hasMedia && (
              <SeedanceComplianceBadge entry={mediaPrecheck} mediaType={isVideo ? 'video' : 'image'} compact />
            )}
            <span>{(node.type !== 'drawing' || node.imageUrl || node.videoUrl) && !(isGenerating && node.specialized?.operation === 'quick-split') ? calculateDisplayResolution(node) : ''}</span>
          </div>
        </div>
      )}

      {!isGenerating && (['image', 'video'].includes(node.type) || (node.type === 'drawing' && hasMedia)) && !node.missingMedia && node.activeUploadTool !== 'multiAngle' && node.activeUploadTool !== 'lighting' && node.activeUploadTool !== 'cropSelect' && node.activeUploadTool !== 'smartEdit' && node.activeUploadTool !== 'depth' && (
        <div
          ref={toolbarRef}
          data-input-image-toolbar="true"
          data-input-image-video-toolbar={isVideo ? 'true' : undefined}
          className={`canvas-node-toolbar absolute left-1/2 bottom-full mb-[52px] -translate-x-1/2 z-[120] transition-all duration-150 select-none ${
            isSelected ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-1 pointer-events-none'
          }`}
          role="toolbar"
          aria-label="素材操作"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div
            data-canvas-pin-toolbar=""
            data-tapnow-float-toolbar=""
            className="inline-flex h-12 items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-[#f6f6f6] dark:bg-zinc-900 p-1 text-zinc-700 dark:text-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)] whitespace-nowrap"
          >
            {/* 左侧功能区：图片节点（多角度调整 -> 裁剪 -> 高清 -> 智能改图 -> 其他工具） */}
            {!isVideo && imageUrl && (
              <>
                <button
                  type="button"
                  className={floatBtnClass(node.activeUploadTool === 'multiAngle')}
                  data-toolbar-active={node.activeUploadTool === 'multiAngle' ? 'true' : 'false'}
                  data-tip="角度调整"
                  aria-label="角度调整"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeAllMenus();
                    setMultiAngleModalNode(null);
                    updateNode(projectId, node.id, {
                      activeUploadTool: node.activeUploadTool === 'multiAngle' ? null : 'multiAngle',
                    });
                  }}
                >
                  <MultiAngleIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className={floatBtnClass(node.activeUploadTool === 'cropSelect')}
                  data-toolbar-active={node.activeUploadTool === 'cropSelect' ? 'true' : 'false'}
                  data-tip="框选裁剪区域"
                  aria-label="框选裁剪区域"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleInlineTool('cropSelect');
                  }}
                >
                  <Crop size={16} />
                </button>
                <button
                  type="button"
                  className={floatBtnClass(false)}
                  data-tip="高清放大"
                  aria-label="高清放大"
                  onClick={() => { closeAllMenus(); handleSpawnDownstream('hd'); }}
                >
                  <span className="text-xs font-semibold tracking-tight">HD</span>
                </button>
                <button
                  type="button"
                  className={floatBtnClass(node.activeUploadTool === 'smartEdit')}
                  data-toolbar-active={node.activeUploadTool === 'smartEdit' ? 'true' : 'false'}
                  data-tip="智能改图"
                  aria-label="智能改图"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleInlineTool('smartEdit');
                  }}
                >
                  <PenLine size={16} />
                </button>
              </>
            )}

            {isVideo && videoUrl && (
              <>
                <button
                  type="button"
                  className={floatBtnClass(false)}
                  data-tip="高清放大"
                  aria-label="高清放大"
                  onClick={() => { closeAllMenus(); handleSpawnDownstream('hd'); }}
                >
                  <span className="text-xs font-semibold tracking-tight">HD</span>
                </button>
              </>
            )}

            {/* 工具菜单（⋯） */}
            <div className="flex items-center gap-1">
              <div className="relative flex items-center">
                <button
                  type="button"
                  className={floatBtnClass(hasActiveTool)}
                  data-toolbar-active={hasActiveTool ? 'true' : 'false'}
                  data-tip="工具"
                  aria-label="工具"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinMenuOpen(false);
                    setToolsMenuOpen((v) => !v);
                  }}
                >
                  {extracting ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
                </button>
                {toolsMenuOpen && (
                  <div
                    data-input-image-tools-menu="true"
                    className="absolute left-1/2 top-full mt-2 -translate-x-1/2 z-[140] inline-flex min-w-[144px] w-max flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1e] py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
                  >
                    {isVideo && videoUrl && (
                      <>
                        {(['480p', '720p'] as const).map(resolution => (
                          <button key={resolution} type="button" disabled={!studioCommands} className={menuItemClass()} onClick={() => {
                            closeAllMenus(); createDepthVideo(resolution);
                          }}>
                            <LayersIcon size={14} className="shrink-0 opacity-85" />深度视频 · {resolution}
                          </button>
                        ))}
                        <button type="button" disabled={extracting} className={menuItemClass()} onClick={() => { closeAllMenus(); void handleExtractSingleFrame(0, '首帧'); }}>
                          <Film size={14} className="shrink-0 opacity-85" />提取首帧
                        </button>
                        <button type="button" disabled={extracting} className={menuItemClass()} onClick={() => {
                          const current = toolbarRef.current?.closest('[data-canvas-node-id]')?.querySelector('video')?.currentTime ?? 0;
                          closeAllMenus(); void handleExtractSingleFrame(current, '当前帧');
                        }}>
                          <Film size={14} className="shrink-0 opacity-85" />提取当前帧
                        </button>
                        <button type="button" disabled={extracting} className={menuItemClass()} onClick={() => {
                          closeAllMenus();
                          window.postMessage({ kind: 'studio:storyboard', nodeId: node.id }, window.location.origin);
                        }}>
                          <Film size={14} className="shrink-0 opacity-85" />提取分镜图
                        </button>
                      </>
                    )}
                    {!isVideo && imageUrl && Boolean((node.studioRaw?.settings as Record<string, unknown> | undefined)?.beikeStoryboardSourceId) && (
                      <button type="button" className={menuItemClass()} onClick={() => {
                        closeAllMenus();
                        window.postMessage({ kind: 'studio:storyboard-mask', nodeId: node.id }, window.location.origin);
                      }}>
                        <PenLine size={14} className="shrink-0 opacity-85" />人脸打码
                      </button>
                    )}
                    {!isVideo && (
                      <button
                        type="button"
                        data-tool-id="imageDepth"
                        className={menuItemClass(node.activeUploadTool === 'depth')}
                        onClick={() => toggleInlineTool('depth')}
                      >
                        <Aperture size={14} className="shrink-0 opacity-85" />
                        <span>深度提取</span>
                      </button>
                    )}
                    <button
                      type="button"
                      data-tool-id="highlight"
                      className={menuItemClass(Boolean(node.highlighted))}
                      onClick={() => {
                        closeAllMenus();
                        updateNode(projectId, node.id, { highlighted: !node.highlighted });
                      }}
                    >
                      <Highlighter size={14} className="shrink-0 opacity-85" />
                      <span>高亮显示</span>
                    </button>
                    {!isVideo && (
                      <>
                        <button
                          type="button"
                          data-tool-id="portraitTexture"
                          className={menuItemClass(false)}
                          onClick={() => {
                            closeAllMenus();
                            handleSpawnDownstream('portrait-texture');
                          }}
                        >
                          <UserRound size={14} className="shrink-0 opacity-85" />
                          <span>人像质感调节</span>
                        </button>
                        <button
                          type="button"
                          data-tool-id="relight"
                          className={menuItemClass(node.activeUploadTool === 'lighting')}
                          onClick={() => toggleInlineTool('lighting')}
                        >
                          <LightingIcon className="w-3.5 h-3.5 shrink-0 opacity-85" />
                          <span>打光效果</span>
                        </button>
                        <CanvasGridSkillsSubmenu
                          node={node}
                          projectId={projectId}
                          onRequestClose={closeAllMenus}
                          setSelectedNodeId={setSelectedNodeId}
                          setEditingDrawingId={setEditingDrawingId}
                        />
                        <CanvasQuickSplitSubmenu
                          node={node}
                          projectId={projectId}
                          onRequestClose={closeAllMenus}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 分割线 */}
            <div data-toolbar-divider="" className="w-px h-[18px] mx-1.5 shrink-0 self-center bg-black/10 dark:bg-white/12" />

            {/* 右侧通用操作：标签选择、替换、下载、全屏 */}
            <div className="relative flex items-center" data-canvas-pin-ui="root">
              <button
                type="button"
                data-canvas-pin-ui="trigger"
                data-pin-popover-open={pinMenuOpen ? 'true' : 'false'}
                className={floatBtnClass(pinMenuOpen)}
                data-tip="标签选择"
                aria-label="标签选择"
                onClick={(e) => {
                  e.stopPropagation();
                  setToolsMenuOpen(false);
                  setPinMenuOpen((v) => !v);
                }}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2.4 8.85 8.85 2.4A1.6 1.6 0 0 1 10 2h3.2A.8.8 0 0 1 14 2.8V6a1.6 1.6 0 0 1-.4 1.15L7.15 13.6a1.2 1.2 0 0 1-1.7 0L2.4 10.55a1.2 1.2 0 0 1 0-1.7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <circle cx="11.15" cy="4.85" r="0.85" fill="currentColor" />
                </svg>
                {activePins.length > 0 && (
                  <span
                    className="absolute right-1.5 bottom-1.5 h-2 w-2 rounded-full border border-black/20 dark:border-white/40"
                    style={{ backgroundColor: activePins[0] }}
                  />
                )}
              </button>
              {pinMenuOpen && (
                <div
                  data-canvas-pin-ui="popover"
                  role="dialog"
                  aria-label="选择颜色标签"
                  className="absolute left-1/2 top-full mt-2 -translate-x-1/2 z-[140] flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1e] px-2.5 py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
                >
                  <button
                    type="button"
                    title="清除标签"
                    aria-label="清除标签"
                    disabled={activePins.length === 0}
                    onClick={() => updateNode(projectId, node.id, { colorPins: [] })}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 dark:border-white/20 text-zinc-500 dark:text-zinc-300 disabled:opacity-35 cursor-pointer"
                  >
                    <Ban size={11} />
                  </button>
                  {PIN_SWATCHES.map((swatch) => {
                    const selected = activePins.includes(swatch.color);
                    return (
                      <button
                        key={swatch.color}
                        type="button"
                        title={swatch.label}
                        aria-label={swatch.label}
                        onClick={() => handleTogglePinColor(swatch.color)}
                        className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                          selected ? 'scale-110 ring-2 ring-white/80 border-white' : 'border-black/15 dark:border-white/25'
                        }`}
                        style={{ backgroundColor: swatch.color }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              className={floatBtnClass(false)}
              data-tip="替换"
              aria-label="替换参考素材"
              onClick={(e) => {
                e.stopPropagation();
                closeAllMenus();
                replacementNodeRef.current = node.id;
                const input = fileInputRef.current;
                if (input) {
                  const project = useCanvasStore.getState().projects.find(item => item.id === projectId);
                  input.accept = canvasWorkflowUploadAccept(canvasWorkflowUploadSlot(project, node.id));
                  input.click();
                }
              }}
            >
              <ImagePlus size={16} />
            </button>

            <button
              type="button"
              className={floatBtnClass(false)}
              data-tip="下载"
              aria-label="下载素材"
              onClick={() => {
                closeAllMenus();
                void downloadMediaOrOpen(mediaUrl, `${node.title || '画布素材'}.${isVideo ? 'mp4' : 'png'}`).catch(console.error);
              }}
            >
              <Download size={16} />
            </button>

            <button
              type="button"
              data-input-image-open-lightbox="true"
              className={floatBtnClass(false)}
              data-tip="全屏"
              aria-label="预览素材"
              onClick={() => {
                closeAllMenus();
                setPreviewMedia({ url: mediaUrl, type: isVideo ? 'video' : 'image' });
              }}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

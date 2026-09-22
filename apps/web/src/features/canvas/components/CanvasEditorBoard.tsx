import { Image as ImageIcon, MousePointer2, Sparkles, Upload, Video as VideoIcon } from 'lucide-react';
import { CanvasNodeMenu, type CanvasQuickNodeType } from './CanvasNodeMenu';
import { DotGrid } from '@/shared/media/DotGrid';
import { CanvasConnections } from './CanvasConnections';
import { CanvasStageNode } from './CanvasStageNode';
import { CanvasLayersPanel } from './CanvasLayersPanel';
import CanvasPromptDock from './CanvasPromptDock';
import { useCanvasFileDrop } from '../hooks/useCanvasFileDrop';
import type { CanvasNode, CanvasProject, CanvasSubject } from '../types';
import type { MutableRefObject, RefObject, MouseEvent, WheelEvent } from 'react';

export interface CanvasEditorBoardProps {
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  canvasFileDrop: ReturnType<typeof useCanvasFileDrop>;
  handleMouseDownCanvas: (e: MouseEvent) => void;
  closeNodeMenu: () => void;
  handleWheel: (e: WheelEvent) => void;
  openNodeMenuAt: (x: number, y: number) => void;
  isPanning: boolean;
  isHandMode: boolean;
  pan: { x: number; y: number };
  zoom: number;
  nodeMenu: { screenX: number; screenY: number; x: number; y: number } | null;
  handleCreateQuickNode: (kind: CanvasQuickNodeType) => void;
  nodes: CanvasNode[];
  currentProject: CanvasProject;
  draggingNodeId: string | null;
  draggingNodePos: { x: number; y: number } | null;
  handleCreateStarterNode: (kind: 'text-video' | 'image-background' | 'first-frame-video') => void;
  replacementNodeRef: MutableRefObject<string | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  editingDrawingId: string | null;
  editingNodeTitleId: string | null;
  tempNodeTitle: string;
  drawingPress: MutableRefObject<{ x: number; y: number } | null>;
  setEditingDrawingId: (id: string | null) => void;
  setTempNodeTitle: (value: string) => void;
  setEditingNodeTitleId: (id: string | null) => void;
  handleNodeDragStart: (node: CanvasNode, e: MouseEvent) => void;
  handleStartEditNodeTitle: (node: CanvasNode, e?: MouseEvent) => void;
  handleSaveNodeTitle: (nodeId: string) => void;
  handleAddNodeToComposer: (node: CanvasNode, e?: MouseEvent) => void;
  setLightingModalNode: (node: CanvasNode | null) => void;
  setMultiAngleModalNode: (node: CanvasNode | null) => void;
  setPreviewMedia: (media: { url: string; type: 'image' | 'video' } | null) => void;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
  handleCanvasPromptSubmit: (promptText: string, refImage?: string, mode?: string, tasks?: Array<{ id?: string; taskId?: string; prompt?: string; title?: string }>) => void;
  canvasSubjects: CanvasSubject[];
  composerReference: { name: string; url: string; type: 'image' | 'video'; timestamp: number; attachOnly: boolean } | null;
}

export function CanvasEditorBoard(p: CanvasEditorBoardProps) {
  const {
    canvasViewportRef, canvasFileDrop, handleMouseDownCanvas, closeNodeMenu, handleWheel, openNodeMenuAt,
    isPanning, isHandMode, pan, zoom, nodeMenu, handleCreateQuickNode, nodes, currentProject,
    draggingNodeId, draggingNodePos, handleCreateStarterNode, replacementNodeRef, fileInputRef,
    selectedNodeId, setSelectedNodeId, editingDrawingId, editingNodeTitleId, tempNodeTitle, drawingPress,
    setEditingDrawingId, setTempNodeTitle, setEditingNodeTitleId, handleNodeDragStart, handleStartEditNodeTitle,
    handleSaveNodeTitle, handleAddNodeToComposer, setLightingModalNode, setMultiAngleModalNode, setPreviewMedia,
    updateNode, deleteNode, handleCanvasPromptSubmit, canvasSubjects, composerReference,
  } = p;
  return (
    <>
      {/* 🌟 4. 无限视口工作台核心区域 */}
      <div
        ref={canvasViewportRef}
        {...canvasFileDrop.dropProps}
        data-testid="canvas-viewport"
        onMouseDown={handleMouseDownCanvas}
        onWheel={event => { closeNodeMenu(); handleWheel(event); }}
        onDoubleClick={event => {
          if (event.defaultPrevented || event.button !== 0 || (event.target as HTMLElement).closest('.canvas-node-card, button, input, textarea, select, a, .canvas-fixed-ui')) return;
          openNodeMenuAt(event.clientX, event.clientY);
        }}
        className={`flex-1 w-full h-full relative overflow-hidden ${
          isPanning ? 'cursor-grabbing' : isHandMode ? 'cursor-grab' : 'cursor-default'
        }`}
      >
        {/* 🌟 动态点阵背景 (参考图 2 主页水波光影流动与鼠标交互质感，与画布坐标绝对锚定) */}
        <DotGrid
          variant="canvas"
          pan={pan}
          zoom={zoom}
          isPanning={isPanning}
          baseColor="#cbd5e1"
          activeColor="#818cf8"
          proximity={130}
        />

        {nodeMenu && <CanvasNodeMenu x={nodeMenu.screenX} y={nodeMenu.screenY} onClose={closeNodeMenu} onSelect={handleCreateQuickNode} />}
        {canvasFileDrop.dragging && <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/70"><span className="rounded-xl bg-white px-5 py-3 text-sm text-indigo-600 shadow-sm">松开以导入图片、视频或音频</span></div>}
        {canvasFileDrop.pending > 0 && <div role="status" className="pointer-events-none absolute right-4 top-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">素材上传中 · 剩余 {canvasFileDrop.pending} 个</div>}
        {canvasFileDrop.errors.length > 0 && <div role="alert" className="absolute right-4 top-16 z-50 max-h-48 max-w-sm overflow-auto rounded-xl border border-red-100 bg-white p-3 text-xs text-red-600 shadow-sm">{canvasFileDrop.errors.map((error, index) => <p key={index}>{error}</p>)}<button type="button" onClick={canvasFileDrop.dismissErrors} className="mt-2 text-slate-500">关闭</button></div>}
        {/* 空画布启动器：参考工作台式引导，直接提供可执行的创作起点。 */}
        {nodes.length === 0 && (
          <div className="absolute inset-x-0 top-14 bottom-24 z-20 flex items-center justify-center px-4 pointer-events-none">
            <div className="pointer-events-auto -translate-y-3 select-none text-center animate-in fade-in zoom-in-95 duration-200 sm:-translate-y-6">
              <div className="mb-5 flex items-center justify-center gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 text-indigo-500 shadow-[0_8px_24px_rgba(71,85,105,0.12)]">
                  <MousePointer2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-slate-700">双击空白画布，新建节点</p>
                  <p className="mt-0.5 text-xs text-slate-400">节点会出现在点击的位置，也可从下方开始创作</p>
                </div>
              </div>

              <div className="flex max-w-[min(100vw-2rem,780px)] flex-wrap justify-center gap-2.5">
                <button type="button" onClick={() => handleCreateStarterNode('text-video')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/88 px-3.5 text-sm font-medium text-slate-700 shadow-[0_5px_16px_rgba(71,85,105,0.1)] transition hover:bg-cyan-50 hover:text-cyan-700">
                  <VideoIcon className="h-4 w-4 text-cyan-600" />文字生视频
                </button>
                <button type="button" onClick={() => handleCreateStarterNode('image-background')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/88 px-3.5 text-sm font-medium text-slate-700 shadow-[0_5px_16px_rgba(71,85,105,0.1)] transition hover:bg-violet-50 hover:text-violet-700">
                  <ImageIcon className="h-4 w-4 text-violet-600" />图片换背景
                </button>
                <button type="button" onClick={() => handleCreateStarterNode('first-frame-video')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/88 px-3.5 text-sm font-medium text-slate-700 shadow-[0_5px_16px_rgba(71,85,105,0.1)] transition hover:bg-amber-50 hover:text-amber-700">
                  <Sparkles className="h-4 w-4 text-amber-600" />首帧生成视频
                </button>
                <button type="button" onClick={() => { replacementNodeRef.current = null; fileInputRef.current?.click(); }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/88 px-3.5 text-sm font-medium text-slate-700 shadow-[0_5px_16px_rgba(71,85,105,0.1)] transition hover:bg-emerald-50 hover:text-emerald-700">
                  <Upload className="h-4 w-4 text-emerald-600" />导入素材
                </button>
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
          {nodes.map((node) => (
            <CanvasStageNode
              key={node.id}
              node={node}
              nodes={nodes}
              projectId={currentProject.id}
              zoom={zoom}
              selectedNodeId={selectedNodeId}
              draggingNodeId={draggingNodeId}
              draggingNodePos={draggingNodePos}
              editingDrawingId={editingDrawingId}
              editingNodeTitleId={editingNodeTitleId}
              tempNodeTitle={tempNodeTitle}
              drawingPress={drawingPress}
              fileInputRef={fileInputRef}
              replacementNodeRef={replacementNodeRef}
              setSelectedNodeId={setSelectedNodeId}
              setEditingDrawingId={setEditingDrawingId}
              setTempNodeTitle={setTempNodeTitle}
              setEditingNodeTitleId={setEditingNodeTitleId}
              handleNodeDragStart={handleNodeDragStart}
              handleStartEditNodeTitle={handleStartEditNodeTitle}
              handleSaveNodeTitle={handleSaveNodeTitle}
              handleAddNodeToComposer={handleAddNodeToComposer}
              setLightingModalNode={setLightingModalNode}
              setMultiAngleModalNode={setMultiAngleModalNode}
              setPreviewMedia={setPreviewMedia}
              updateNode={updateNode}
              deleteNode={deleteNode}
              onRegenerate={(target) => {
                if (target.content) handleCanvasPromptSubmit(target.content, target.referenceImageUrl, target.type);
              }}
            />
          ))}

        </div>
      </div>

      <CanvasLayersPanel project={currentProject} selectedId={selectedNodeId} onSelect={setSelectedNodeId} />

      {/* 节点开始创作后再展示底部输入舱，空画布由中央起点负责引导。 */}
      {nodes.length > 0 && (
        <div className="canvas-fixed-ui absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl xl:max-w-4xl z-30 px-4 pointer-events-none flex justify-center">
          <CanvasPromptDock
            data-testid="canvas-prompt-dock"
            onSubmit={handleCanvasPromptSubmit}
            subjects={canvasSubjects}
            mentionTrigger={composerReference}
          />
        </div>
      )}


    </>
  );
}

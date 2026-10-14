import { CanvasMinimap } from '../CanvasMinimap';
import { CanvasSelectionToolbar } from '../CanvasSelectionToolbar';
import { Image as ImageIcon, MousePointer2, Type, Upload, Video as VideoIcon } from 'lucide-react';
import { CanvasNodeMenu, type CanvasQuickNodeType } from '../CanvasNodeMenu';
import { DotGrid } from '@client/shared/media/DotGrid';
import { CanvasConnections } from '../CanvasConnections';
import { CanvasStageNode } from '../stage/CanvasStageNode';
import { CanvasLayersPanel } from '../CanvasLayersPanel';
import CanvasPromptDock from '../prompt/CanvasPromptDock';
import { useCanvasFileDrop } from '../../hooks/useCanvasFileDrop';
import type { CanvasNode, CanvasProject, CanvasSubject } from '../../model/types';
import type { MutableRefObject, RefObject, MouseEvent, WheelEvent } from 'react';

export interface CanvasEditorBoardProps {
  centerAt: (x:number,y:number) => void;
  selectedNodeIds: string[];
  setSelectedNodeIds: (ids: string[]) => void;
  dragPositions: Record<string, {x:number; y:number}>;
  selectionBox: {x:number; y:number; width:number; height:number} | null;
  handleNodeClick: (node: CanvasNode, event: MouseEvent) => void;
  composerOpen: boolean;
  onRegenerate: (node: CanvasNode) => void;
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
    draggingNodeId, draggingNodePos,  replacementNodeRef, fileInputRef,
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
        onContextMenu={event=>event.preventDefault()}
        onWheel={event => { closeNodeMenu(); handleWheel(event); }}
        onDoubleClick={event => {
          if (event.defaultPrevented || event.button !== 0 || (event.target as HTMLElement).closest('.canvas-node-card, button, input, textarea, select, a, .canvas-fixed-ui')) return;
          openNodeMenuAt(event.clientX, event.clientY);
        }}
        className={`flex-1 w-full h-full relative overflow-clip ${
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
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-6 pl-20 sm:px-20">
            <div className="mx-auto max-w-[880px] select-none text-center animate-in fade-in duration-200">
              <p className="mb-8 flex items-center justify-center gap-2.5 text-sm font-normal text-slate-500">
                <MousePointer2 size={18} strokeWidth={1.5} />双击画布，自由生成节点
              </p>
              <div className="pointer-events-auto grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: '图片生成', Icon: ImageIcon, action: () => handleCreateQuickNode('image-generation') },
                  { label: '视频生成', Icon: VideoIcon, action: () => handleCreateQuickNode('video-generation') },
                  { label: '文本生成', Icon: Type, action: () => handleCreateQuickNode('prompt') },
                  { label: '导入素材', Icon: Upload, action: () => { replacementNodeRef.current = null; fileInputRef.current?.click(); } },
                ].map(({ label, Icon, action }) => <button key={label} type="button" onClick={action} className="group flex h-16 min-w-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-2 text-left text-sm font-medium text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 motion-reduce:transform-none">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-200/70"><Icon size={20} strokeWidth={1.6} /></span>
                  <span>{label}</span>
                </button>)}
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
          <CanvasConnections projectId={currentProject.id} zoom={zoom} nodes={nodes.filter(node=>!node.layerHidden).map(node => p.dragPositions[node.id] ? {...node, ...p.dragPositions[node.id]} : node)} />
          {p.selectionBox && <div className="pointer-events-none absolute z-50 border border-indigo-400 bg-indigo-400/10" style={{left:p.selectionBox.x,top:p.selectionBox.y,width:p.selectionBox.width,height:p.selectionBox.height}} />}
          {nodes.map((node) => (
            <CanvasStageNode
              key={node.id}
              node={p.dragPositions[node.id] ? {...node,...p.dragPositions[node.id]} : node}
              multiSelected={p.selectedNodeIds.includes(node.id)}
              handleNodeClick={p.handleNodeClick}
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
              onRegenerate={p.onRegenerate}
            />
          ))}

        </div>
        {!p.selectionBox && !isHandMode && <CanvasSelectionToolbar projectId={currentProject.id} nodes={nodes} selectedIds={p.selectedNodeIds} onSelect={p.setSelectedNodeIds} pan={pan} zoom={zoom} positions={p.dragPositions} viewportRef={canvasViewportRef} />}
      </div>

      {!editingDrawingId && <CanvasMinimap nodes={nodes} pan={pan} zoom={zoom} viewportRef={canvasViewportRef} onCenter={p.centerAt} />}
      <CanvasLayersPanel project={currentProject} selectedId={selectedNodeId} onSelect={setSelectedNodeId} />

      {/* 节点开始创作后再展示底部输入舱，空画布由中央起点负责引导。 */}
      {p.composerOpen && !editingDrawingId && (
        <div className="canvas-fixed-ui absolute bottom-20 left-1/2 -translate-x-1/2 w-full max-w-3xl xl:max-w-4xl z-30 px-4 pointer-events-none flex justify-center">
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

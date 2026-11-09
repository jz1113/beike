import { useCanvasHistory } from '../../hooks/useCanvasHistory';
import { useCanvasSelectionActions } from '../../hooks/useCanvasSelectionActions';
import { CanvasEditorChrome } from './CanvasEditorChrome';
import { CanvasArchiveDialog } from '../projects/CanvasRecentProjects';
import { CanvasPublishDialog } from '../projects/CanvasPublishDialog';
import { CanvasEditorBoard } from './CanvasEditorBoard';
import { NativeStudioHostOverlays } from './NativeStudioHostOverlays';
import { retryCanvasGeneration, useCanvasFileDrop, useCanvasGenerationSync } from '../../hooks/useCanvasGenerationSync';
import { useCanvasNodeActions } from '../../hooks/useCanvasNodeActions';
import { useCanvasGestures } from '../../hooks/useCanvasGestures';
import { canvasSaveError, hasCanvasSaveFailure } from '../../store/canvasProjectDefaults';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import CanvasLightingModal, { type LightingParams } from '../tools/CanvasLightingModal';
import { CanvasMultiAngleModal, type MultiAngleParams } from '@client/shared/modals/multi-angle/CanvasMultiAngleModal';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { useAppStore } from '@client/store';
import type { CanvasNode } from '../../model/types';

export function CanvasBootSplash() {
  const [phase, setPhase] = useState<'playing' | 'leaving' | 'done'>('playing');
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('done');
      return;
    }
    const fade = window.setTimeout(() => setPhase('leaving'), 1800);
    const finish = window.setTimeout(() => setPhase('done'), 2100);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(finish);
    };
  }, []);
  if (phase === 'done') return null;

  return (
    <div className="canvas-boot" data-phase={phase} role="status" aria-label="画布加载中">
      <div className="canvas-boot-brand">
        <div className="canvas-boot-mark">
          <div className="canvas-boot-dots" aria-hidden="true" />
          <span className="canvas-boot-logo" aria-hidden="true">
            <img src="/app_logo.png" alt="" draggable={false} />
          </span>
        </div>
        <span>贝壳云图</span>
      </div>
    </div>
  );
}

interface CanvasEditorOverlaysProps {
  previewMedia: { url: string; type: 'image' | 'video' } | null;
  setPreviewMedia: (media: { url: string; type: 'image' | 'video' } | null) => void;
  lightingModalNode: CanvasNode | null;
  setLightingModalNode: (node: CanvasNode | null) => void;
  handleApplyLighting: (params: LightingParams, options?: { model?: string; quality?: string; aspectRatio?: string }) => void;
  multiAngleModalNode: CanvasNode | null;
  setMultiAngleModalNode: (node: CanvasNode | null) => void;
  handleApplyMultiAngle: (params: MultiAngleParams, options?: { model?: string; quality?: string; aspectRatio?: string }) => void;
}

function CanvasEditorOverlays(p: CanvasEditorOverlaysProps) {
  return (
    <>
      {p.previewMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-150 select-none"
          onClick={() => p.setPreviewMedia(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {p.previewMedia.type === 'video' ? (
              <video src={proxyMediaUrl(p.previewMedia.url) || p.previewMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-2xl" />
            ) : (
              <img src={proxyMediaUrl(p.previewMedia.url) || p.previewMedia.url} alt="素材全屏预览" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl select-none" />
            )}
            <button type="button" onClick={() => p.setPreviewMedia(null)} className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors backdrop-blur-md dark:bg-[#18191c]/95" title="关闭预览">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      <CanvasLightingModal isOpen={!!p.lightingModalNode} onClose={() => p.setLightingModalNode(null)} node={p.lightingModalNode} onSubmit={p.handleApplyLighting} />
      <CanvasMultiAngleModal isOpen={!!p.multiAngleModalNode} onClose={() => p.setMultiAngleModalNode(null)} node={p.multiAngleModalNode} onSubmit={p.handleApplyMultiAngle} />
    </>
  );
}

interface InfiniteCanvasEditorProps {
  onHome: () => void;
  projectId: string;
}

export const InfiniteCanvasEditor: React.FC<InfiniteCanvasEditorProps> = ({ projectId, onHome }) => {
  const { projects, selectProject, selectNode, addNode, updateNode, deleteNode } =
    useCanvasStore();
  const currentProject = projects.find((p) => p.id === projectId);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const generationTasks = useAppStore((s) => s.generationTasks);
  const [canvasSaveFailed, setCanvasSaveFailed] = useState(hasCanvasSaveFailure);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [archiveMode, setArchiveMode] = useState<'export' | 'import' | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [showStudioTasks, setShowStudioTasks] = useState(false);
  const [historyHost, setHistoryHost] = useState<HTMLDivElement | null>(null);

  const history = useCanvasHistory(projectId);
  const {
    centerAt, panForPrompt, pan, zoom, readView, isPanning, isHandMode, draggingNodeId, draggingNodePos, selectedNodeId, setSelectedNodeId,
    handleZoom, setZoom, handleWheel, handleMouseDownCanvas, handleNodeDragStart, handleNodeClick,
    handTool, setHandTool, selectedNodeIds, setSelectedNodeIds, dragPositions, selectionBox, alignmentGuides,
  } = useCanvasGestures(currentProject, updateNode, () => {
    setEditingDrawingId(null);
  }, canvasViewportRef);

  const selectionActions = useCanvasSelectionActions(projectId, selectedNodeIds, setSelectedNodeIds, history);
  useEffect(() => {
    selectNode(selectedNodeId);
  }, [selectedNodeId, selectNode]);

  useEffect(() => {
    const onSelectNode = (event: Event) => {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (nodeId) setSelectedNodeId(nodeId);
    };
    window.addEventListener('canvas:select-node', onSelectNode);
    return () => window.removeEventListener('canvas:select-node', onSelectNode);
  }, [setSelectedNodeId]);


  useEffect(() => {
    const onSaveError = () => { setCanvasSaveFailed(true); };
    const onSaveComplete = () => { setCanvasSaveFailed(false); };
    window.addEventListener('canvas-save-error', onSaveError);
    window.addEventListener('canvas-save-complete', onSaveComplete);
    return () => {
      window.removeEventListener('canvas-save-error', onSaveError);
      window.removeEventListener('canvas-save-complete', onSaveComplete);
    };
  }, []);

  useCanvasGenerationSync(currentProject, generationTasks, updateNode);
  const canvasFileDrop = useCanvasFileDrop(projectId, readView);

  const actions = useCanvasNodeActions({
    currentProject, readView, canvasViewportRef, selectedNodeId, setSelectedNodeId,
    draggingNodeId, addNode, updateNode, deleteNode, generationTasks,
  });
  const { setEditingDrawingId } = actions;
  useEffect(() => {
    if (selectedNodeIds.length > 1) setEditingDrawingId(null);
  }, [selectedNodeIds.length, setEditingDrawingId]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 dark:text-slate-400">
        <p className="text-base font-semibold mb-3">未找到对应画布项目</p>
        <button
          onClick={onHome}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex-1 w-full h-full flex overflow-hidden relative select-none rounded-[18px] border border-black/10 bg-[#f5f5f7] dark:border-white/10 dark:bg-[#191919]"
    >
      {showStudioTasks && <div ref={setHistoryHost}
        className="absolute inset-y-0 left-0 z-[64] flex w-[260px] max-w-[85%] shrink-0 sm:relative sm:z-auto" />}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {canvasSaveFailed && createPortal(
          <div role="alert" className="fixed bottom-5 left-4 right-4 z-[90] w-fit rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:text-slate-200 dark:bg-[#18191c] sm:left-20">
            {canvasSaveError() || '画布尚未保存，请勿关闭窗口。'}
            <button type="button" className="ml-3 text-indigo-600" onClick={() => {
              void saveCanvasProjects().catch(() => {});
            }}>重试保存</button>
            <button type="button" className="ml-3 text-indigo-600" onClick={() => setArchiveMode('export')}>导出当前编辑</button>
          </div>, document.body,
        )}
        <input ref={actions.fileInputRef} type="file" accept="image/*,video/*,audio/*" onChange={actions.handleFileChange} className="hidden" />
        {archiveMode && <CanvasArchiveDialog mode={archiveMode} snapshot={() => {
          const project = useCanvasStore.getState().projects.find(item => item.id === projectId);
          if (!project) throw new Error('项目不存在，请重新打开');
          return project;
        }} onClose={() => setArchiveMode(null)} onRestored={project => selectProject(project.id)} />}
        {publishOpen && <CanvasPublishDialog project={currentProject} onClose={() => setPublishOpen(false)} />}
        <CanvasBootSplash />
        <CanvasEditorChrome
          minimapVisible={minimapVisible}
          onToggleMinimap={() => setMinimapVisible(value => !value)}
          onArchive={setArchiveMode}
          onPublish={() => setPublishOpen(true)}
          onToggleComposer={() => useAppStore.getState().setIsAssistantOpen(true)}
          onOpenTasks={() => setShowStudioTasks((v) => !v)}
          tasksOpen={showStudioTasks}
          handTool={handTool} setHandTool={setHandTool}
          handleBackToHome={onHome}
          setZoom={setZoom}
          handleZoom={handleZoom}
          zoom={zoom}
        />
        <NativeStudioHostOverlays
          project={currentProject}
          onFocusNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            const targetNode = currentProject.nodes.find((n) => n.id === nodeId);
            if (targetNode) {
              centerAt(targetNode.x + targetNode.width / 2, targetNode.y + targetNode.height / 2);
            }
          }}
          historyHost={historyHost}
          onCloseTasks={() => setShowStudioTasks(false)}
        >
        <CanvasEditorBoard
          minimapVisible={minimapVisible}
          alignmentGuides={alignmentGuides}
          selectedNodeIds={selectedNodeIds} setSelectedNodeIds={setSelectedNodeIds} dragPositions={dragPositions} selectionBox={selectionBox}
          centerAt={centerAt} panForPrompt={panForPrompt} handleNodeClick={handleNodeClick}
          onRegenerate={node => { void retryCanvasGeneration(projectId, node).catch(error => {
            window.alert(error instanceof Error ? error.message : '无法重新生成，请重试');
          }); }}
          canvasViewportRef={canvasViewportRef}
          canvasFileDrop={canvasFileDrop}
          handleMouseDownCanvas={handleMouseDownCanvas}
          closeNodeMenu={actions.closeNodeMenu}
          duplicateNodes={selectionActions.duplicate}
          removeNodes={selectionActions.remove}
          handleWheel={handleWheel}
          openNodeMenuAt={actions.openNodeMenuAt}
          isPanning={isPanning}
          isHandMode={isHandMode}
          pan={pan}
          zoom={zoom}
          nodeMenu={actions.nodeMenu}
          handleCreateQuickNode={actions.handleCreateQuickNode}
          nodes={actions.nodes}
          currentProject={currentProject}
          draggingNodeId={draggingNodeId}
          draggingNodePos={draggingNodePos}
          handleCreateStarterNode={actions.handleCreateStarterNode}
          replacementNodeRef={actions.replacementNodeRef}
          fileInputRef={actions.fileInputRef}
          setSelectedNodeId={setSelectedNodeId}
          editingDrawingId={actions.editingDrawingId}
          editingNodeTitleId={actions.editingNodeTitleId}
          tempNodeTitle={actions.tempNodeTitle}
          drawingPress={actions.drawingPress}
          setEditingDrawingId={actions.setEditingDrawingId}
          setTempNodeTitle={actions.setTempNodeTitle}
          setEditingNodeTitleId={actions.setEditingNodeTitleId}
          handleNodeDragStart={handleNodeDragStart}
          handleStartEditNodeTitle={actions.handleStartEditNodeTitle}
          handleSaveNodeTitle={actions.handleSaveNodeTitle}
          handleAddNodeToComposer={actions.handleAddNodeToComposer}
          setLightingModalNode={actions.setLightingModalNode}
          setMultiAngleModalNode={actions.setMultiAngleModalNode}
          setPreviewMedia={actions.setPreviewMedia}
          updateNode={updateNode}
          deleteNode={deleteNode}
        />
        </NativeStudioHostOverlays>
        <CanvasEditorOverlays
          previewMedia={actions.previewMedia}
          setPreviewMedia={actions.setPreviewMedia}
          lightingModalNode={actions.lightingModalNode}
          setLightingModalNode={actions.setLightingModalNode}
          handleApplyLighting={actions.handleApplyLighting}
          multiAngleModalNode={actions.multiAngleModalNode}
          setMultiAngleModalNode={actions.setMultiAngleModalNode}
          handleApplyMultiAngle={actions.handleApplyMultiAngle}
        />
      </div>
    </div>
  );
};

export default InfiniteCanvasEditor;

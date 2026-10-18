import { useCanvasHistory } from '../hooks/useCanvasHistory';
import { useCanvasSelectionActions } from '../hooks/useCanvasSelectionActions';
import { CanvasEditorChrome } from './editor/CanvasEditorChrome';
import { CanvasEditorBoard } from './editor/CanvasEditorBoard';
import { CanvasEditorOverlays } from './editor/CanvasEditorOverlays';
import { CanvasStoryboardView } from './storyboard/CanvasStoryboardView';
import { useCanvasPromptSubmit } from '../hooks/useCanvasPromptSubmit';
import { retryCanvasGeneration } from '../hooks/canvasGenerationActions';
import { useCanvasTitleEditing } from '../hooks/useCanvasTitleEditing';
import { useCanvasNodeActions } from '../hooks/useCanvasNodeActions';
import { useCanvasFileDrop } from '../hooks/useCanvasFileDrop';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
import { canvasStorage, hasCanvasSaveFailure } from '../store/canvasPersistence';
import { useCanvasGenerationSync } from '../hooks/useCanvasGenerationSync';
import React, { useState, useRef, useEffect } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '@client/store';
interface InfiniteCanvasEditorProps {
  projectId: string;
}

export const InfiniteCanvasEditor: React.FC<InfiniteCanvasEditorProps> = ({ projectId }) => {
  const { projects, selectProject, selectNode, createProject, updateProjectTitle, addNode, updateNode, deleteNode } =
    useCanvasStore();
  const currentProject = projects.find((p) => p.id === projectId);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const generationTasks = useAppStore((s) => s.generationTasks);
  const [canvasSaveFailed, setCanvasSaveFailed] = useState(hasCanvasSaveFailure);
  const [viewMode, setViewMode] = useState<'canvas' | 'storyboard'>('canvas');

  const history = useCanvasHistory(projectId);
  const {
    centerAt, pan, zoom, isPanning, isHandMode, draggingNodeId, draggingNodePos, selectedNodeId, setSelectedNodeId,
    handleZoom, handleResetView, handleWheel, handleMouseDownCanvas, handleNodeDragStart, handleNodeClick,
    handTool, setHandTool, selectedNodeIds, setSelectedNodeIds, dragPositions, selectionBox, alignmentGuides,
  } = useCanvasGestures(currentProject, updateNode, () => {
    setIsAssetSubmenuOpen(false);
    setEditingDrawingId(null);
  }, canvasViewportRef);

  useCanvasSelectionActions(projectId, selectedNodeIds, setSelectedNodeIds, history);
  useEffect(() => {
    selectNode(selectedNodeId);
  }, [selectedNodeId, selectNode]);

  const {
    isEditingTitle, setIsEditingTitle,
    tempTitle, setTempTitle,
    titleError, setTitleError,
    titleInputRef, skipTitleSaveOnBlurRef,
    handleCancelTitleEdit, handleSaveTitle,
  } = useCanvasTitleEditing(currentProject, updateProjectTitle);

  useEffect(() => {
    const onSaveError = () => {setCanvasSaveFailed(true);};
    const onSaveComplete = () => {setCanvasSaveFailed(false);};
    window.addEventListener('canvas-save-error', onSaveError);
    window.addEventListener('canvas-save-complete', onSaveComplete);
    return () => {
      window.removeEventListener('canvas-save-error', onSaveError);
      window.removeEventListener('canvas-save-complete', onSaveComplete);
    };
  }, []);

  useCanvasGenerationSync(currentProject, generationTasks, updateNode);
  const canvasFileDrop = useCanvasFileDrop(projectId, pan, zoom);
  const submitCanvasPrompt = useCanvasPromptSubmit(currentProject?.id, pan, zoom, canvasViewportRef);

  const actions = useCanvasNodeActions({
    currentProject, pan, zoom, canvasViewportRef, selectedNodeId, setSelectedNodeId,
    draggingNodeId, isEditingTitle, addNode, updateNode, deleteNode, generationTasks,
  });
  const { setIsAssetSubmenuOpen, setEditingDrawingId } = actions;
  useEffect(() => {
    if (selectedNodeIds.length > 1) setEditingDrawingId(null);
  }, [selectedNodeIds.length, setEditingDrawingId]);
  const handleCanvasPromptSubmit: typeof submitCanvasPrompt = (...args) => {
    submitCanvasPrompt(...args);
    actions.closeComposer();
  };

  const handleBackToHome = () => {
    selectProject(null);
    useAppStore.getState().setCurrentView('home');
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 dark:text-slate-400">
        <p className="text-base font-semibold mb-3">未找到对应画布项目</p>
        <button
          onClick={handleBackToHome}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex-1 w-full h-full flex flex-col overflow-hidden relative select-none bg-[#f6f8fc] dark:bg-[#121214]"
    >
      {canvasSaveFailed && (
        <div role="alert" className="absolute bottom-5 left-20 z-50 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:text-slate-200 dark:bg-[#18191c]">
          画布尚未保存，请勿关闭窗口。
          <button type="button" className="ml-3 text-indigo-600" onClick={() => {
            void canvasStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: useCanvasStore.getState().projects }, version: 0 }));
          }}>重试保存</button>
        </div>
      )}
      <input ref={actions.fileInputRef} type="file" accept="image/*,video/*,audio/*" onChange={actions.handleFileChange} className="hidden" />
      <CanvasEditorChrome
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        openNodeMenuAt={actions.openNodeMenuAt}
        handTool={handTool} setHandTool={setHandTool} history={history}
        handleBackToHome={handleBackToHome}
        isEditingTitle={isEditingTitle}
        titleInputRef={titleInputRef}
        tempTitle={tempTitle}
        titleError={titleError}
        setTempTitle={setTempTitle}
        setTitleError={setTitleError}
        skipTitleSaveOnBlurRef={skipTitleSaveOnBlurRef}
        handleSaveTitle={handleSaveTitle}
        handleCancelTitleEdit={handleCancelTitleEdit}
        displayProjectTitle={actions.displayProjectTitle}
        setIsEditingTitle={setIsEditingTitle}
        createProject={createProject}
        projects={projects}
        currentProject={currentProject}
        selectProject={selectProject}
        nodes={actions.nodes}
        handleResetView={handleResetView}
        handleZoom={handleZoom}
        zoom={zoom}
        addNode={addNode}
        pan={pan}
        canvasViewportRef={canvasViewportRef}
        replacementNodeRef={actions.replacementNodeRef}
        fileInputRef={actions.fileInputRef}
        isAssetSubmenuOpen={actions.isAssetSubmenuOpen}
        setIsAssetSubmenuOpen={actions.setIsAssetSubmenuOpen}
        handleOpenAssetModal={actions.handleOpenAssetModal}
      />
      {viewMode === 'storyboard' && currentProject ? (
        <CanvasStoryboardView
          project={currentProject}
          onBackToCanvas={(focusNodeId) => {
            setViewMode('canvas');
            if (focusNodeId) {
              setSelectedNodeId(focusNodeId);
              const targetNode = currentProject.nodes.find(n => n.id === focusNodeId);
              if (targetNode) {
                centerAt(targetNode.x + targetNode.width / 2, targetNode.y + targetNode.height / 2);
              }
            }
          }}
          onRegenerateNode={(node) => {
            void retryCanvasGeneration(projectId, node).catch((error) => {
              window.alert(error instanceof Error ? error.message : '无法重新生成，请重试');
            });
          }}
        />
      ) : (
        <CanvasEditorBoard
          alignmentGuides={alignmentGuides}
          selectedNodeIds={selectedNodeIds} setSelectedNodeIds={setSelectedNodeIds} dragPositions={dragPositions} selectionBox={selectionBox}
          centerAt={centerAt} handleNodeClick={handleNodeClick} composerOpen={Boolean(actions.composerReference)}
          onRegenerate={node => { void retryCanvasGeneration(projectId, node).catch(error => {
            window.alert(error instanceof Error ? error.message : '无法重新生成，请重试');
          }); }}
          canvasViewportRef={canvasViewportRef}
          canvasFileDrop={canvasFileDrop}
          handleMouseDownCanvas={handleMouseDownCanvas}
          closeNodeMenu={actions.closeNodeMenu}
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
          selectedNodeId={selectedNodeId}
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
          handleCanvasPromptSubmit={handleCanvasPromptSubmit}
          canvasSubjects={actions.canvasSubjects}
          composerReference={actions.composerReference}
        />
      )}
      <CanvasEditorOverlays
        showAssetModal={actions.showAssetModal}
        assetModalTab={actions.assetModalTab}
        imageAssets={actions.imageAssets}
        videoAssets={actions.videoAssets}
        setShowAssetModal={actions.setShowAssetModal}
        handleConfirmImportAssets={actions.handleConfirmImportAssets}
        replacementNodeRef={actions.replacementNodeRef}
        fileInputRef={actions.fileInputRef}
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
  );
};

export default InfiniteCanvasEditor;

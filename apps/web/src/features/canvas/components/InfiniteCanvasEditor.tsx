import { CanvasEditorChrome } from './CanvasEditorChrome';
import { CanvasEditorBoard } from './CanvasEditorBoard';
import { CanvasEditorOverlays } from './CanvasEditorOverlays';
import { useCanvasPromptSubmit } from '../hooks/useCanvasPromptSubmit';
import { useCanvasTitleEditing } from '../hooks/useCanvasTitleEditing';
import { useCanvasNodeActions } from '../hooks/useCanvasNodeActions';
import { useCanvasFileDrop } from '../hooks/useCanvasFileDrop';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
import { canvasStorage, hasCanvasSaveFailure } from '../store/canvasPersistence';
import { useCanvasGenerationSync } from '../hooks/useCanvasGenerationSync';
import React, { useState, useRef, useEffect } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '@/store';
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

  const {
    pan, zoom, isPanning, isHandMode, draggingNodeId, draggingNodePos, selectedNodeId, setSelectedNodeId,
    handleZoom, handleResetView, handleWheel, handleMouseDownCanvas, handleMouseMove, handleMouseUp, handleNodeDragStart,
  } = useCanvasGestures(currentProject, updateNode, () => {
    setIsTitleMenuOpen(false);
    setIsAssetSubmenuOpen(false);
    setEditingDrawingId(null);
  }, canvasViewportRef);

  useEffect(() => {
    selectNode(selectedNodeId);
  }, [selectedNodeId, selectNode]);

  const {
    isTitleMenuOpen, setIsTitleMenuOpen,
    isEditingTitle, setIsEditingTitle,
    tempTitle, setTempTitle,
    titleError, setTitleError,
    titleInputRef, skipTitleSaveOnBlurRef,
    handleCancelTitleEdit, handleSaveTitle,
  } = useCanvasTitleEditing(currentProject, updateProjectTitle);

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

  useCanvasGenerationSync(currentProject, generationTasks, updateNode);
  const canvasFileDrop = useCanvasFileDrop(projectId, pan, zoom);
  const handleCanvasPromptSubmit = useCanvasPromptSubmit(currentProject?.id, pan, zoom, canvasViewportRef);

  const actions = useCanvasNodeActions({
    currentProject, pan, zoom, canvasViewportRef, selectedNodeId, setSelectedNodeId,
    draggingNodeId, isEditingTitle, addNode, updateNode, deleteNode, generationTasks,
  });
  const { setIsAssetSubmenuOpen, setEditingDrawingId } = actions;

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

  return (
    <div
      className="flex-1 w-full h-full flex flex-col overflow-hidden relative select-none bg-[#f6f8fc]"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {canvasSaveFailed && (
        <div role="alert" className="absolute bottom-5 left-20 z-50 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          画布尚未保存，请勿关闭窗口。
          <button type="button" className="ml-3 text-indigo-600" onClick={() => {
            void canvasStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: useCanvasStore.getState().projects }, version: 0 }));
          }}>重试保存</button>
        </div>
      )}
      <input ref={actions.fileInputRef} type="file" accept="image/*,video/*" onChange={actions.handleFileChange} className="hidden" />
      <CanvasEditorChrome
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
        isTitleMenuOpen={isTitleMenuOpen}
        setIsTitleMenuOpen={setIsTitleMenuOpen}
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
      <CanvasEditorBoard
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

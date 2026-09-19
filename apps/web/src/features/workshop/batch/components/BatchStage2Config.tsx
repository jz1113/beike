import React, { useState, useMemo, useEffect } from 'react';
import BatchImageSelectionPanel from './BatchImageSelectionPanel';
import { useBatchConfig } from './BatchConfigContext';
import { BatchStage2ReplicationRefs } from './BatchStage2ReplicationRefs';
import { BatchStage2PresetBar } from './BatchStage2PresetBar';
import { useAppStore } from '@/store';
import type { AppState } from '../../../../types/store';

export default function BatchStage2Config() {
  const {
    batchMode,
    currentStage,
    successfulItems,
    setItems,
    recipes,
    selectedArchId,
    availableVisionModels,
    selectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
    hasHumanPersona,
    selectedAspect,
    selectedShotCount,
    activeImgFilter,
    setActiveImgFilter,
    batchSetProductImages,
    toggleReferenceImageSelection,
    handleRemoveItem,
    replicationInputMode,
    setReplicationInputMode,
    matrixMasterRefUrl,
    setMatrixMasterRefUrl,
    isMatrixParsing,
    isBatchRefParsing,
    handleParseMatrixMasterRef,
    handleBatchParse1to1Refs,
    onPreviewGallery,
    onPreviewImage,
    onNextStage,
    openWorkshopConfig,
  } = useBatchConfig();
  const setIsWorkshopConfigOpen = useAppStore((s: AppState) => s.setIsWorkshopConfigOpen);
  const handleOpenSettings = openWorkshopConfig || (() => setIsWorkshopConfigOpen(true));

  // Replication stage 2 view (对标配对输入界面)
  if (batchMode === 'replication' && currentStage === 2) {
    return (
      <BatchStage2ReplicationRefs
        replicationInputMode={replicationInputMode}
        setReplicationInputMode={setReplicationInputMode}
        matrixMasterRefUrl={matrixMasterRefUrl}
        setMatrixMasterRefUrl={setMatrixMasterRefUrl}
        handleParseMatrixMasterRef={handleParseMatrixMasterRef}
        isMatrixParsing={isMatrixParsing}
        isBatchRefParsing={isBatchRefParsing}
        handleBatchParse1to1Refs={handleBatchParse1to1Refs}
        successfulItems={successfulItems}
        setItems={setItems}
        handleRemoveItem={handleRemoveItem}
        onNextStage={onNextStage}
      />
    );
  }

  // ── Original 模式 & Replication 模式选图阶段 ──

  // 商品筛选状态（全部 / 待选图 / 已就绪）
  const [productFilter, setProductFilter] = useState<'pending' | 'completed' | 'all'>('all');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // 计算已就绪 / 待选商品
  const completedIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const i of successfulItems) {
      const ready = batchMode === 'replication'
        ? i.selectedProductImages.length > 0 && (i.selectedReferenceImages.length > 0 || i.availableReferenceImages.length === 0)
        : i.selectedProductImages.length > 0;
      if (ready) ids.add(i.id);
    }
    return ids;
  }, [successfulItems, batchMode]);

  const completedItems = useMemo(
    () => successfulItems.filter(i => completedIdSet.has(i.id)),
    [successfulItems, completedIdSet],
  );
  const pendingItems = useMemo(
    () => successfulItems.filter(i => !completedIdSet.has(i.id)),
    [successfulItems, completedIdSet],
  );

  const displayedItems = useMemo(() => {
    if (productFilter === 'pending') {
      return pendingItems.length > 0 ? pendingItems : successfulItems;
    }
    if (productFilter === 'completed') {
      return completedItems.length > 0 ? completedItems : successfulItems;
    }
    return successfulItems;
  }, [productFilter, pendingItems, completedItems, successfulItems]);

  // 当显示列表变化时，确保焦点在有效范围内
  useEffect(() => {
    if (focusedIndex >= displayedItems.length && displayedItems.length > 0) {
      setFocusedIndex(displayedItems.length - 1);
    }
  }, [displayedItems.length, focusedIndex]);

  const readyCount = completedItems.length;

  return (
    <div className="space-y-4">
      {/* 🌟 极简紧凑全局生产预设微指示条（仅 36px 高度，点击可打开独立设置面板） */}
      <BatchStage2PresetBar
        recipes={recipes}
        selectedArchId={selectedArchId}
        selectedShotCount={selectedShotCount}
        selectedAspect={selectedAspect}
        hasHumanPersona={hasHumanPersona}
        selectedVisionModel={selectedVisionModel}
        availableVisionModels={availableVisionModels}
        selectedImageGenModel={selectedImageGenModel}
        availableImageModels={availableImageModels}
        onOpenSettings={handleOpenSettings}
        readyCount={readyCount}
        totalCount={successfulItems.length}
      />

      {/* 🌟 选图工作台：统一单面板 */}
      <div className="space-y-3.5">

        {/* 统一选图面板（左侧商品轨 + 右侧选图区 + 底部确认流转条） */}
        <BatchImageSelectionPanel
          onConfirmAndNext={onNextStage}
          displayedItems={displayedItems}
          focusedIndex={focusedIndex}
          activeImgFilter={activeImgFilter}
          batchMode={batchMode}
          productFilter={productFilter}
          onFilterChange={setActiveImgFilter}
          onProductFilterChange={setProductFilter}
          setFocusedIndex={setFocusedIndex}
          setItems={setItems}
          batchSetProductImages={batchSetProductImages}
          handleRemoveItem={handleRemoveItem}
          toggleReferenceImageSelection={toggleReferenceImageSelection}
          onPreviewGallery={onPreviewGallery}
          onPreviewImage={onPreviewImage}
          pendingItems={pendingItems}
          completedItems={completedItems}
        />
      </div>
    </div>
  );
}

import { useState, type DragEvent } from 'react';
import { type WorkflowModel } from '../settingsShared';
import { isMultimodalWorkflowModel } from '@beike/domain/workflowModels';

interface UseModelDragSortProps {
  customModels: WorkflowModel[];
  modelCapabilityFilter: 'all' | 'multimodal' | 'image' | 'video';
  handleMoveModel?: (modelId: string, direction: 'up' | 'down' | 'top') => void;
  handleReorderModels?: (newOrder: WorkflowModel[]) => void;
}

export function useModelDragSort({
  customModels,
  modelCapabilityFilter,
  handleMoveModel,
  handleReorderModels,
}: UseModelDragSortProps) {
  const [draggedModelId, setDraggedModelId] = useState<string | null>(null);
  const [dragOverModelId, setDragOverModelId] = useState<string | null>(null);

  const handleDragStart = (e: DragEvent, id: string) => {
    setDraggedModelId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverModelId !== id) {
      setDragOverModelId(id);
    }
  };

  const getCategoryPredicate = (filter: 'all' | 'multimodal' | 'image' | 'video') => {
    if (filter === 'video') return (m: WorkflowModel) => Boolean(m.isVideo);
    if (filter === 'image') return (m: WorkflowModel) => Boolean(m.isImage);
    if (filter === 'multimodal') return (m: WorkflowModel) => isMultimodalWorkflowModel(m);
    return () => true;
  };

  const reorderWithinCategory = (
    allModels: WorkflowModel[],
    predicate: (m: WorkflowModel) => boolean,
    action:
      | { type: 'move'; modelId: string; direction: 'up' | 'down' | 'top' }
      | { type: 'reorder'; sourceId: string; targetId: string }
  ): WorkflowModel[] => {
    const categoryIndices: number[] = [];
    const categoryItems: WorkflowModel[] = [];

    allModels.forEach((m, idx) => {
      if (predicate(m)) {
        categoryIndices.push(idx);
        categoryItems.push(m);
      }
    });

    if (categoryItems.length <= 1) return allModels;
    const newCategoryItems = [...categoryItems];

    if (action.type === 'move') {
      const idx = newCategoryItems.findIndex((m) => m.id === action.modelId);
      if (idx === -1) return allModels;

      if (action.direction === 'top') {
        if (idx === 0) return allModels;
        const [item] = newCategoryItems.splice(idx, 1);
        newCategoryItems.unshift(item);
      } else if (action.direction === 'up') {
        if (idx === 0) return allModels;
        const temp = newCategoryItems[idx];
        newCategoryItems[idx] = newCategoryItems[idx - 1];
        newCategoryItems[idx - 1] = temp;
      } else if (action.direction === 'down') {
        if (idx === newCategoryItems.length - 1) return allModels;
        const temp = newCategoryItems[idx];
        newCategoryItems[idx] = newCategoryItems[idx + 1];
        newCategoryItems[idx + 1] = temp;
      }
    } else if (action.type === 'reorder') {
      const sourceIdx = newCategoryItems.findIndex((m) => m.id === action.sourceId);
      const targetIdx = newCategoryItems.findIndex((m) => m.id === action.targetId);
      if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return allModels;

      const [moved] = newCategoryItems.splice(sourceIdx, 1);
      newCategoryItems.splice(targetIdx, 0, moved);
    }

    const result = [...allModels];
    categoryIndices.forEach((origIdx, i) => {
      result[origIdx] = newCategoryItems[i];
    });

    return result;
  };

  const onMoveModel = (modelId: string, direction: 'up' | 'down' | 'top') => {
    if (modelCapabilityFilter === 'all') {
      if (handleMoveModel) handleMoveModel(modelId, direction);
    } else {
      const updated = reorderWithinCategory(
        customModels,
        getCategoryPredicate(modelCapabilityFilter),
        { type: 'move', modelId, direction }
      );
      if (handleReorderModels) {
        handleReorderModels(updated);
      }
    }
  };

  const handleDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverModelId(null);
    const sourceId = draggedModelId || e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) return;

    if (modelCapabilityFilter === 'all') {
      const sourceIdx = customModels.findIndex(m => m.id === sourceId);
      const targetIdx = customModels.findIndex(m => m.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return;

      const updated = [...customModels];
      const [moved] = updated.splice(sourceIdx, 1);
      updated.splice(targetIdx, 0, moved);

      if (handleReorderModels) {
        handleReorderModels(updated);
      }
    } else {
      const updated = reorderWithinCategory(
        customModels,
        getCategoryPredicate(modelCapabilityFilter),
        { type: 'reorder', sourceId, targetId }
      );
      if (handleReorderModels) {
        handleReorderModels(updated);
      }
    }
    setDraggedModelId(null);
  };

  return {
    draggedModelId,
    dragOverModelId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    onMoveModel,
  };
}

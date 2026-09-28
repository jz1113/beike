import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BatchProductItem, GenerationStrategy } from '../model/batchTypes';
import type { TaskExecutionConfig } from '../model/generation/batchTaskExecution';
import { createRunControl, type RunControl } from '../model/workspace/runControl';
import {
  startBatchGenerationCoordinator,
  retryFailedImageTasksCoordinator,
  retrySingleShotTaskCoordinator,
  type BatchCoordinatorDeps,
} from './batchGenerationCoordinator';

interface WorkshopGenerationOptions {
  config: TaskExecutionConfig;
  generationStrategy: GenerationStrategy;
  imageGenConcurrency: number;
  itemsRef: MutableRefObject<BatchProductItem[]>;
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  runControlRef: MutableRefObject<RunControl>;
  batchId: string;
  storyboardRevision: number;
  showToast: (message: string) => void;
  setCurrentStage: (stage: number) => void;
  autoGenerateCopywriting: boolean;
  generateAllCopywriting: () => Promise<void>;
  successfulItems: BatchProductItem[];
}

export function useWorkshopGeneration(options: WorkshopGenerationOptions) {
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [completedTaskCount, setCompletedTaskCount] = useState(0);
  const [successTaskCount, setSuccessTaskCount] = useState(0);
  const [failTaskCount, setFailTaskCount] = useState(0);

  const coordinator: BatchCoordinatorDeps = {
    config: options.config,
    generationStrategy: options.generationStrategy,
    imageGenConcurrency: options.imageGenConcurrency || 4,
    itemsRef: options.itemsRef,
    setItems: options.setItems,
    runControlRef: options.runControlRef,
    batchId: options.batchId,
    storyboardRevision: options.storyboardRevision,
    showToast: options.showToast,
    setCurrentStage: options.setCurrentStage,
    setIsGeneratingBatch,
    setTotalTaskCount,
    setCompletedTaskCount,
    setSuccessTaskCount,
    setFailTaskCount,
    autoGenerateCopywriting: options.autoGenerateCopywriting,
    generateAllCopywriting: options.generateAllCopywriting,
  };

  const startBatchGeneration = () => startBatchGenerationCoordinator(coordinator);
  const retryFailedImageTasks = () => retryFailedImageTasksCoordinator(coordinator, options.successfulItems, isGeneratingBatch);
  const retrySingleShotTask = async (itemId: string, shotIndex: number) => {
    if (isGeneratingBatch || options.itemsRef.current.some(item => item.tasks.some(task => task.status === 'IN_PROGRESS'))) {
      options.showToast('已有任务执行中，请等待结束后再重新生成');
      return;
    }
    const task = options.itemsRef.current.find(item => item.id === itemId)?.tasks[shotIndex];
    if (task?.recoveryRequired) {
      if (!window.confirm('原任务可能仍在生成并计费。建议先核对原任务。确定放弃本镜恢复并重新生成？这可能重复计费。')) return;
      options.setItems(previous => previous.map(item => item.id === itemId ? { ...item, tasks: item.tasks.map(entry => entry.id === task.id ? { ...entry, recoveryRequired: false } : entry) } : item));
    }
    options.runControlRef.current = createRunControl();
    await retrySingleShotTaskCoordinator(
      itemId, shotIndex, options.itemsRef.current, options.setItems, options.config, options.showToast,
    );
  };

  return {
    isGeneratingBatch, totalTaskCount, completedTaskCount, successTaskCount, failTaskCount,
    startBatchGeneration, retryFailedImageTasks, retrySingleShotTask,
  };
}

import { useCallback, useState } from 'react';
import { useAppStore } from '@client/store';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { buildMultiAnglePrompt, buildSmartEditPrompt } from '@shared/domain/media/drawing';
import { calculateTargetDimensions } from '@client/shared/modals/lightbox/lightboxDimensions';

export function useLightboxEditActions(
  previewTask: GenerationTask | null,
  isVideo: boolean,
  showToast: (message: string) => void,
) {
  const addGenerationTask = useAppStore((state) => state.addGenerationTask);
  const setPreviewTask = useAppStore((state) => state.setPreviewTask);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const [isMultiAngleOpen, setIsMultiAngleOpen] = useState(false);
  const [isSmartEditOpen, setIsSmartEditOpen] = useState(false);
  const [isOutpaintOpen, setIsOutpaintOpen] = useState(false);

  const handleToolAction = useCallback((actionKey: string, label: string) => {
    if (isVideo) {
      showToast('图像编辑仅支持图片结果');
      return;
    }
    if (actionKey === 'multi_angle') {
      setIsMultiAngleOpen(true);
    } else if (actionKey === 'smart_edit') {
      setIsSmartEditOpen(true);
    } else if (actionKey === 'outpaint') {
      setIsOutpaintOpen(true);
    } else {
      showToast(`✨ ${label} 功能已准备就绪`);
    }
  }, [isVideo, showToast]);

  const handleSubmitNovelView = useCallback(
    ({
      azimuth,
      elevation,
      angleName,
      model,
      quality,
      aspectRatio,
    }: {
      azimuth: number;
      elevation: number;
      angleName: string;
      model?: string;
      quality?: string;
      aspectRatio?: string;
    }) => {
      setIsMultiAngleOpen(false);
      setPreviewTask(null);
      setCurrentView('generate');

      if (!previewTask || !previewTask.resultUrl) {
        showToast(`🎥 已提交多角度生成任务（${angleName}视角）`);
        return;
      }

      const multiAnglePrompt = buildMultiAnglePrompt({
        originalPrompt: previewTask.prompt || '',
        azimuth,
        elevation,
        angleName,
      });

      const chosenModel = model || previewTask.model || 'gpt-image-2';
      const chosenQuality = quality || previewTask.quality || 'medium';
      const targetSize = calculateTargetDimensions(
        aspectRatio,
        chosenQuality,
        previewTask.size || '2448x3264',
      );

      const newTaskId = `fast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newTask: GenerationTask = {
        id: newTaskId,
        title: `多角度视角转换(${angleName})`,
        prompt: multiAnglePrompt,
        model: chosenModel,
        size: targetSize,
        quality: chosenQuality,
        referenceImageUrl: previewTask.resultUrl,
        referenceImages: [previewTask.resultUrl],
        images: [previewTask.resultUrl],
        useReferenceImage: true,
        taskType: 'multi_angle',
        angleName,
        sourceImageUrl: previewTask.resultUrl,
        status: 'IN_PROGRESS',
        progress: '15%',
        createdAt: Date.now(),
      };

      addGenerationTask(newTask, false);
      showToast(`🎥 已提交多角度视角转换任务（${angleName}）`);
    },
    [previewTask, addGenerationTask, setPreviewTask, setCurrentView, showToast],
  );

  const handleSubmitSmartEdit = useCallback(
    ({
      markers,
      prompt,
      model,
      quality,
      aspectRatio,
    }: {
      markers: any[];
      prompt: string;
      model: string;
      quality: string;
      aspectRatio?: string;
    }) => {
      setIsSmartEditOpen(false);
      setPreviewTask(null);
      setCurrentView('generate');

      if (previewTask && previewTask.resultUrl) {
        // 🌟 1. 组装具备空间方位定位与一致性约束的高质量智能改图提示词
        const smartEditPrompt = buildSmartEditPrompt({
          originalPrompt: previewTask.prompt || '',
          userPrompt: prompt,
          markers,
        });

        // 🌟 2. 比例与尺寸精准匹配
        const chosenModel = model || previewTask.model || 'gpt-image-2';
        const chosenQuality = quality || previewTask.quality || 'medium';
        const targetSize = calculateTargetDimensions(
          aspectRatio,
          chosenQuality,
          previewTask.size || '2448x3264',
        );

        const newTaskId = `fast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newTask: GenerationTask = {
          id: newTaskId,
          title: `智能改图: ${prompt.slice(0, 15)}`,
          prompt: smartEditPrompt,
          model: chosenModel,
          size: targetSize,
          quality: chosenQuality,
          referenceImageUrl: previewTask.resultUrl,
          referenceImages: [previewTask.resultUrl],
          images: [previewTask.resultUrl],
          useReferenceImage: true,
          taskType: 'smart_edit',
          sourceImageUrl: previewTask.resultUrl,
          status: 'IN_PROGRESS',
          progress: '15%',
          createdAt: Date.now(),
        };
        addGenerationTask(newTask, false);
      }

      showToast(`✨ 已提交局部修改任务：${prompt.slice(0, 15)}...`);
    },
    [previewTask, addGenerationTask, setPreviewTask, setCurrentView, showToast],
  );

  const handleSubmitOutpaint = useCallback(
    ({
      ratio,
      prompt,
      model,
      quality,
    }: {
      ratio: string;
      scale: number;
      prompt: string;
      model?: string;
      quality?: string;
    }) => {
      setIsOutpaintOpen(false);
      setPreviewTask(null);
      setCurrentView('generate');

      if (previewTask && previewTask.resultUrl) {
        const chosenModel = model || previewTask.model || 'gpt-image-2';
        const chosenQuality = quality || previewTask.quality || 'medium';
        const targetSize = calculateTargetDimensions(
          ratio === 'original' ? 'smart' : ratio,
          chosenQuality,
          previewTask.size || '2448x3264',
        );

        const newTaskId = `fast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newTask: GenerationTask = {
          id: newTaskId,
          title: `扩图(${ratio})`,
          prompt: prompt || previewTask.prompt || '保持画风和内容自然延伸扩展画幅',
          model: chosenModel,
          size: targetSize,
          quality: chosenQuality,
          referenceImageUrl: previewTask.resultUrl,
          referenceImages: [previewTask.resultUrl],
          images: [previewTask.resultUrl],
          useReferenceImage: true,
          status: 'IN_PROGRESS',
          progress: '15%',
          createdAt: Date.now(),
        };
        addGenerationTask(newTask, false);
      }

      showToast(`📐 已提交扩图任务（比例：${ratio}）`);
    },
    [previewTask, addGenerationTask, setPreviewTask, setCurrentView, showToast],
  );

  return {
    isMultiAngleOpen, setIsMultiAngleOpen,
    isSmartEditOpen, setIsSmartEditOpen,
    isOutpaintOpen, setIsOutpaintOpen,
    handleToolAction, handleSubmitNovelView, handleSubmitSmartEdit, handleSubmitOutpaint,
  };
}

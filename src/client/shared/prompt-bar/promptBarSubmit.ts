import type { GenerationTask } from '@client/store';
import {
  cleanPromptText,
  stripWorkshopPromptGuards,
  normalizeReferenceMentions,
} from '@shared/domain/media/drawing';
import {
  DEPTH_IMAGE_MODEL_ID,
  DEPTH_VIDEO_MODEL_ID,
  isDepthGenMode,
} from '@shared/domain/media/depthVideo';
import { normalizeVideoReferenceMentions } from '@client/shared/media/videoReferences';
import { normalizeSubjectReferences } from './promptSubjectReferences';
import {
  collectEffectiveImages,
  buildOrderedMentionNames,
  validateSubmitInput,
  buildPromptBarSubjects,
} from './promptBarValidation';
import type { PromptBarSubmitInput, PromptBarSubmitResult } from './promptBarSubmitTypes';
import { formatAgentAttachmentNote } from './agentAttachments';

export type { PromptBarSubmitInput, PromptBarSubmitResult } from './promptBarSubmitTypes';
export { buildPromptBarSubjects };

/** 发送按钮 / 快捷键是否与提交校验一致 */
export function canSubmitPromptBar(
  input: PromptBarSubmitInput & { isSubmitting?: boolean },
): boolean {
  if (input.isSubmitting) return false;
  if (input.quickGenMode === 'image' && !input.hasImageModels) return false;
  if (input.quickGenMode === 'video' && input.hasVideoModels === false) return false;
  if (isDepthGenMode(input.quickGenMode) && input.depthModelReady === false) return false;
  const effectiveImages = collectEffectiveImages(input);
  return validateSubmitInput(input, effectiveImages) === null;
}

export function buildPromptBarGenerationTasks(
  input: PromptBarSubmitInput,
): PromptBarSubmitResult {
  const effectiveImages = collectEffectiveImages(input);
  const error = validateSubmitInput(input, effectiveImages);
  if (error) {
    return { ok: false, error };
  }

  const {
    quickGenMode,
    quickPrompt,
    quickCount,
    quickVideoCount,
    quickModel,
    quickVideoModel,
    sizeStr,
    quickQuality,
    quickVideoAspectId,
    quickVideoResolution,
    quickVideoDuration,
    quickVideoRefMode,
    quickDepthStyle,
    quickDepthQuality,
    quickVideoGenerateAudio,
  } = input;

  if (quickGenMode === 'agent') {
    const batchTimestamp = Date.now();
    const batchId = `agent-batch-${batchTimestamp}`;
    const cleaned = quickPrompt.trim();
    const attachmentNote = formatAgentAttachmentNote(input.quickRefImages);
    const prompt = attachmentNote ? `${cleaned}\n\n${attachmentNote}` : cleaned;
    const title = cleaned.slice(0, 32) || 'Agent 创作对话';
    const activeModel = 'deepseek-flash';
    const task: GenerationTask = {
      id: `agent-task-${batchTimestamp}-0`,
      batchId,
      shotNo: 1,
      title,
      prompt,
      mediaType: 'agent',
      model: activeModel,
      size: '-',
      quality: 'high',
      useReferenceImage: effectiveImages.length > 0,
      referenceImages: effectiveImages,
      status: 'SUCCESS',
      progress: '100%',
      createdAt: batchTimestamp,
    };
    return {
      ok: true,
      tasks: [task],
      cleanedPrompt: cleaned,
      sessionTitle: title,
      shouldCreateNewSession: input.currentView !== 'generate' && input.currentView !== 'canvas',
    };
  }

  if (isDepthGenMode(quickGenMode)) {
    const batchTimestamp = Date.now();
    const batchId = `batch-${batchTimestamp}`;
    const isDepthVideo = quickGenMode === 'depth-video';
    const refUrl = effectiveImages[0];
    const task: GenerationTask = {
      id: `hub-gen-${batchTimestamp}-0`,
      batchId,
      shotNo: 1,
      title: isDepthVideo ? '深度动作捕捉' : '深度图片',
      prompt: isDepthVideo ? '深度动作捕捉' : '深度图片',
      mediaType: quickGenMode,
      depthStyle: quickDepthStyle,
      model: isDepthVideo ? DEPTH_VIDEO_MODEL_ID : DEPTH_IMAGE_MODEL_ID,
      size: '-',
      quality: quickDepthQuality,
      referenceImageUrl: refUrl,
      referenceImages: [refUrl],
      useReferenceImage: true,
      status: 'IN_PROGRESS',
      progress: '15%',
      createdAt: batchTimestamp,
    };
    return {
      ok: true,
      tasks: [task],
      cleanedPrompt: task.prompt,
      sessionTitle: task.title,
      shouldCreateNewSession: input.currentView !== 'generate' && input.currentView !== 'canvas',
    };
  }

  let finalPrompt = quickPrompt.trim();
  if (effectiveImages.length > 0) {
    const orderedMentionNames = buildOrderedMentionNames(effectiveImages, input.allSubjects);
    finalPrompt = quickGenMode === 'video'
      ? normalizeVideoReferenceMentions(finalPrompt, effectiveImages, input.allSubjects)
      : normalizeReferenceMentions(
          normalizeSubjectReferences(
            finalPrompt,
            effectiveImages.map((url, index) => ({ url, name: `图片${index + 1}` })),
          ),
          orderedMentionNames,
        );
  }

  const cleanedPrompt = stripWorkshopPromptGuards(cleanPromptText(finalPrompt));
  const batchId = `batch-${Date.now()}`;
  const batchTimestamp = Date.now();
  const countToGen = quickGenMode === 'video' ? quickVideoCount || 1 : quickCount || 1;
  const refImg = effectiveImages[0] || undefined;
  const tasksToCreate: GenerationTask[] = [];

  for (let i = 0; i < countToGen; i++) {
    const taskId = `hub-gen-${batchTimestamp}-${i}`;
    tasksToCreate.push({
      id: taskId,
      batchId,
      shotNo: i + 1,
      title: cleanedPrompt.slice(0, 25) || (quickGenMode === 'video' ? '智能视频创作' : '快速商用生图'),
      prompt: cleanedPrompt,
      mediaType: quickGenMode === 'video' ? 'video' : 'image',
      model: quickGenMode === 'video' ? quickVideoModel : quickModel,
      size: quickGenMode === 'video' ? quickVideoAspectId : sizeStr,
      quality: quickGenMode === 'video' ? quickVideoResolution : quickQuality,
      videoDuration: quickGenMode === 'video' ? quickVideoDuration : undefined,
      videoResolution: quickGenMode === 'video' ? quickVideoResolution : undefined,
      videoRefMode: quickGenMode === 'video' ? quickVideoRefMode : undefined,
      generateAudio: quickGenMode === 'video' ? quickVideoGenerateAudio : undefined,
      referenceImageUrl: refImg,
      referenceImages: effectiveImages,
      useReferenceImage: effectiveImages.length > 0,
      status: 'IN_PROGRESS',
      progress: '15%',
      createdAt: batchTimestamp,
    });
  }

  return {
    ok: true,
    tasks: tasksToCreate,
    cleanedPrompt,
    sessionTitle: cleanedPrompt.slice(0, 25) || (quickGenMode === 'video' ? '智能视频创作' : '快速商用生图'),
    shouldCreateNewSession: input.currentView !== 'generate' && input.currentView !== 'canvas',
  };
}

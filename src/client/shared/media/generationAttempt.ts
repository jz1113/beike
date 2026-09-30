import type { GenerationTask } from '@client/store';
import { cleanPromptText, stripWorkshopPromptGuards } from '@shared/domain/media/drawing';
import type { DepthQuality, DepthVideoStyle } from '@shared/domain/media/depthVideo';
import { peekDepthSubmit, registerDepthSubmit, resolveDepthSubmit } from '@client/shared/api/depthGeneration';
import { registerRefMedia, resolveRefMediaFile } from '@client/shared/media/refMediaRegistry';
import { isDepthImageTask, isDepthVideoTask } from './generationTaskMedia';

export function createGenerationAttemptId(prefix = 'hub-gen'): string {
  const randomId = globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

/** Each user-requested attempt has a fresh submission identity and joins the current conversation. */
export async function prepareGenerationAttempt(
  task: GenerationTask,
  batchId: string,
  file?: File,
): Promise<GenerationTask | null> {
  if (task.submissionRecoveryRequired) return null;
  if (task.referenceMediaMissing && !isDepthImageTask(task) && !isDepthVideoTask(task)) return null;
  const attempt: GenerationTask = {
    ...task,
    id: createGenerationAttemptId(),
    batchId,
    taskId: undefined,
    dbId: undefined,
    sessionId: undefined,
    sessionTitle: undefined,
    prompt: stripWorkshopPromptGuards(cleanPromptText(task.prompt || '')),
    status: 'IN_PROGRESS',
    progress: '15%',
    resultUrl: undefined,
    failReason: undefined,
    referenceMediaMissing: false,
    submissionRecoveryRequired: undefined,
    createdAt: Date.now(),
  };
  if (!isDepthImageTask(task) && !isDepthVideoTask(task)) return attempt;

  const options = {
    style: (task.depthStyle as DepthVideoStyle) || 'mocap',
    quality: (task.quality as DepthQuality) || 'standard',
    mode: isDepthVideoTask(task) ? 'depth-video' as const : 'depth-image' as const,
  };
  // Read the original task key first so a refreshed page can recover its exact cached file.
  const payload = file ? { file, ...options } : peekDepthSubmit(task.id) ||
    await resolveDepthSubmit(task.id, task.referenceImages?.[0] || task.referenceImageUrl, options);
  if (!payload?.file) return null;
  registerDepthSubmit(attempt.id, payload);
  if (file || !attempt.referenceImageUrl ||
    (attempt.referenceImageUrl.startsWith('blob:') && !resolveRefMediaFile(attempt.referenceImageUrl))) {
    const url = URL.createObjectURL(payload.file);
    registerRefMedia(url, payload.file);
    attempt.referenceImageUrl = url;
    attempt.referenceImages = [url];
    attempt.images = [url];
  }
  return attempt;
}

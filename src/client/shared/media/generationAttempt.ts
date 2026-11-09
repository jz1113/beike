import type { GenerationTask } from '@client/store/appStoreTypes';
import { DEPTH_IMAGE_MODEL_ID, DEPTH_VIDEO_MODEL_ID, type DepthQuality, type DepthVideoStyle } from '@shared/domain/media/depthVideo';
import { peekDepthSubmit, registerDepthSubmit, resolveDepthSubmit } from '@client/shared/api/generation/depthGeneration';
import { registerRefMedia, resolveRefMediaFile } from '@client/shared/media/refMediaRegistry';

export function isDepthImageTask(task: GenerationTask): boolean {
  return task.mediaType === 'depth-image' || task.model === DEPTH_IMAGE_MODEL_ID;
}

export function isDepthVideoTask(task: GenerationTask): boolean {
  if (isDepthImageTask(task)) return false;
  return task.mediaType === 'depth-video' || task.model === DEPTH_VIDEO_MODEL_ID ||
    task.id.startsWith('depth_') || Boolean(task.taskId?.startsWith('depth_'));
}

export function isGenerationVideoTask(task: GenerationTask): boolean {
  if (isDepthImageTask(task)) return false;
  return isDepthVideoTask(task) || task.mediaType === 'video' ||
    /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(task.resultUrl || '') ||
    /seedance|veo|kling|sora|gen3|minimax|h3|hailuo|wan|vidu|luma|hunyuan/i.test(task.model || '');
}

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
  const isAgent = task.mediaType === 'agent' || task.id.startsWith('agent-task-');
  const attempt: GenerationTask = {
    ...task,
    id: createGenerationAttemptId(isAgent ? 'agent-task' : 'hub-gen'),
    batchId,
    mediaType: isAgent ? 'agent' : task.mediaType,
    taskId: undefined,
    dbId: undefined,
    // A new attempt uses the credentials at its own dispatch, unlike receipt recovery.
    usageScope: undefined,
    sessionId: task.sessionId,
    sessionTitle: task.sessionTitle,
    status: 'IN_PROGRESS',
    progress: '15%',
    resultUrl: undefined,
    failReason: undefined,
    referenceMediaMissing: false,
    submissionRecoveryRequired: undefined,
    createdAt: Date.now(),
    agentTurn: isAgent ? {
      turnId: `turn-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      threadId: task.sessionId || `session-${batchId}`,
      modelUsed: task.model,
      thinking: '',
      reply: '',
      steps: [],
      toolActivity: [],
      suggestions: [],
    } : undefined,
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

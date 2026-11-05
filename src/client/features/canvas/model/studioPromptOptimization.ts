import { optimizeVideoPrompt, type VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { studioChannels, type StudioRequest, type prepareStudioGeneration } from './studioGeneration';
import { reusableVideoPromptDraft,videoPromptReviewKey } from './videoPromptApproval';

export async function optimizeStudioGeneration(prepared: NonNullable<ReturnType<typeof prepareStudioGeneration>>, request: StudioRequest, signal: AbortSignal, cached?:VideoPromptOptimization) {
  const channel = studioChannels().find(model => model.id === request.model);
  if (channel?.kind !== 'video' || request.optimizePrompt === false) return prepared;
  const input={
    model: channel.modelId, prompt: prepared.task.prompt, mode: prepared.task.videoRefMode,
    duration: prepared.task.videoDuration, aspect: prepared.settings?.ratio, resolution: prepared.settings?.resolution, audio: prepared.task.generateAudio,
    images: request.refs.filter(ref => typeof ref === 'string' || ref.type === 'image').length,
    videos: request.refs.filter(ref => typeof ref !== 'string' && ref.type === 'video').length,
  };
  const inputKey=videoPromptReviewKey(input,request.refs,request.model);
  const optimization=reusableVideoPromptDraft(cached,input,request.refs,request.model) ?? await optimizeVideoPrompt(input,signal);
  return optimization ? { ...prepared, task: { ...prepared.task, prompt: optimization.optimized }, optimization:{...optimization,inputKey} } : prepared;
}

import { isSeedance25, videoInputError } from '@shared/domain/media/videoCapabilities';
import type { VideoAdapterInput } from '../types';
import { normalizeResolution } from './payloads';

/** Roles follow the chosen workflow; one reference image is not implicitly a first frame. */
export function buildSeedanceOfficialPayload(input: VideoAdapterInput, model: string): Record<string, unknown> {
  const mode = input.refMode || (input.lastFrame ? 'first_last_frame' : input.firstFrame ? 'first_frame' : 'omni');
  const images = [...(input.images || [])];
  if (input.firstFrame && !images.includes(input.firstFrame)) images.unshift(input.firstFrame);
  if (input.lastFrame && !images.includes(input.lastFrame)) images.push(input.lastFrame);
  const error = videoInputError({ ...input, model, images, refMode: mode });
  if (error) throw new Error(error);
  const content: Array<Record<string, unknown>> = [];
  if (input.prompt.trim()) content.push({ type: 'text', text: input.prompt.trim() });
  const framed = mode === 'first_frame' || mode === 'first_last_frame';
  if (framed) {
    content.push({ type: 'image_url', image_url: { url: input.firstFrame || images[0] }, role: 'first_frame' });
    if (mode === 'first_last_frame') content.push({ type: 'image_url', image_url: { url: input.lastFrame || images[1] }, role: 'last_frame' });
  } else {
    for (const url of images) content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  }
  for (const url of input.videos || []) content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  const locked = isSeedance25(model) && (framed || mode === 'edit' || mode === 'extend');
  const payload: Record<string, unknown> = {
    model, content,
    duration: mode === 'edit' ? -1 : input.duration ?? 5,
    ratio: locked ? 'adaptive' : input.aspectRatio || '16:9',
    resolution: normalizeResolution(input.resolution),
    generate_audio: input.audio ?? true,
  };
  if (isSeedance25(model) && (mode === 'edit' || mode === 'extend')) payload.omni_reference_task_type = mode;
  if (input.watermark !== undefined) payload.watermark = input.watermark;
  if (input.seed !== undefined && Number.isFinite(Number(input.seed))) payload.seed = Number(input.seed);
  return payload;
}

import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { isMetasoH3, isMiniMaxOfficialBase } from '@shared/domain/media/videoChannels';
import type { VideoAdapterInput } from '../types';
import { collectVideoImages } from './payloads';

/** Metaso uses V2 content; other gateways retain their documented flat protocol. */
export function buildMiniMaxH3GatewayPayload(input: VideoAdapterInput, model: string): Record<string, unknown> {
  const images = collectVideoImages(input);
  const mode = input.refMode || (input.lastFrame ? 'first_last_frame' : input.firstFrame ? 'first_frame' : 'omni');
  const error = videoInputError({ ...input, model, images, refMode: mode });
  if (error) throw new Error(error);
  let prompt = input.prompt;
  if (!prompt.trim()) throw new Error('MiniMax-H3 需要非空的视频提示词');
  if (input.audio === false && !/silent|无声|静音/.test(prompt)) prompt = `${prompt.trim()} (silent video, no sound)`;
  const framed = mode === 'first_frame' || mode === 'first_last_frame';
  const metaso = isMetasoH3(model, input.baseUrl);
  if (metaso || isMiniMaxOfficialBase(input.baseUrl)) {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    for (let index = 0; index < images.length; index++) content.push({ type: 'image_url', image_url: { url: images[index] },
      role: framed ? index === 0 ? 'first_frame' : 'last_frame' : 'reference_image' });
    for (const url of input.videos || []) content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
    for (const url of input.audios || []) content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
    const tier = input.resolution?.toUpperCase();
    const resolution = metaso ? (tier === '720P' ? '768P' : tier || '480P')
      : (tier === '1080P' || tier === '2K' ? '2K' : tier === '480P' ? tier : '768P');
    return { model, content, duration: input.duration ?? 5, resolution,
      ratio: framed ? 'adaptive' : input.aspectRatio || '16:9', ...(metaso ? { fast_mode: false, context_ir_enabled: input.contextIrEnabled ?? true } : {}) };
  }
  const payload: Record<string, unknown> = {
    model, prompt, seconds: String(input.duration ?? 5),
    mode: mode === 'text' ? 'text-to-video' : framed ? 'image-to-video' : 'multimodal-to-video',
    resolution: /^(?:1080P|2K)$/i.test(input.resolution || '') ? '2k' : '768P',
    aspect_ratio: framed ? 'adaptive' : input.aspectRatio || '16:9',
  };
  if (images.length) payload.imageUrls = images;
  if (input.videos?.length) payload.videoUrls = input.videos;
  if (input.audios?.length) payload.audioUrls = input.audios;
  return payload;
}

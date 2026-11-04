import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { videoInputError } from '@shared/domain/media/videoCapabilities';
import type { VideoModelAdapter } from '../types';
import { collectVideoImages, normalizeVideoModelId } from './payloads';

export const omniFlashVideoAdapter: VideoModelAdapter = {
  id: 'omni-flash',
  match: model => normalizeVideoModelId(model).toLowerCase() === 'omni_flash-10s',
  build(input) {
    const model = 'omni_flash-10s';
    const images = collectVideoImages(input);
    const error = videoInputError({ ...input, model, images });
    if (error) throw new Error(error);
    const payload: Record<string, unknown> = {
      model, prompt: input.prompt, size: input.aspectRatio === '9:16' ? '720x1280' : '1280x720',
    };
    if (input.videos?.length || images.some(ref => !/^https?:\/\//i.test(ref))) {
      // Go resolves these references to binary parts after claiming the task.
      payload.input_reference = [...images, ...(input.videos || [])];
    } else if (images.length) payload.images = images;
    return { family: 'omni-flash', modelId: model, payload, endpoints(base) {
      const path = `${normalizeGatewayBaseUrl(base)}/v1/videos`;
      return { submit: [path], query: [`${path}/{taskId}`] };
    } };
  },
};

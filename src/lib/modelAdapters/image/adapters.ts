import { cleanPromptText, formatModelPayload, getAspectRatioFromSize } from '@/lib/drawing';
import { normalizeOpenAiImageRequest } from '@/lib/modelAdapters/image/normalizeOpenAiImageModel';
import type { GatewayEndpoints, ImageAdapterInput, ImageAdapterResult, ImageModelAdapter } from '../types';

/** Grok Image API 仅支持 aspect_ratio，不支持 size / quality / negative_prompt */
const GROK_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '9:16', '16:9']);

function mapToGrokAspectRatio(ratio: string): string {
  if (GROK_ASPECT_RATIOS.has(ratio)) return ratio;
  const fallback: Record<string, string> = {
    '3:4': '2:3',
    '4:3': '3:2',
    '4:5': '2:3',
    '5:4': '3:2',
    '21:9': '16:9',
    auto: '1:1',
  };
  return fallback[ratio] || '1:1';
}

/** 网关文档模型 id：grok-4.1-image / grok-4.2-image */
function resolveGrokApiModelId(modelId: string): string {
  const m = modelId.toLowerCase();
  if (m.includes('4.2') || m.includes('4-2')) return 'grok-4.2-image';
  if (m === 'grok-4.1-image' || m === 'grok-4.2-image') return modelId;
  return 'grok-4.1-image';
}

function collectRefImages(input: ImageAdapterInput): string[] {
  if (input.images?.length) return input.images.filter(Boolean) as string[];
  if (input.primaryImage) return [input.primaryImage];
  return [];
}

function dalleEndpoints(baseUrl: string, useEdits: boolean): GatewayEndpoints {
  const root = baseUrl.replace(/\/+$/, '');
  if (useEdits) {
    return {
      submit: [`${root}/v1/images/edits?async=true`],
      query: [
        `${root}/v1/images/tasks/{taskId}`,
        `${root}/v1/images/generations/{taskId}`,
      ],
    };
  }
  return {
    submit: [`${root}/v1/images/generations?async=true`],
    query: [
      `${root}/v1/images/generations/{taskId}`,
      `${root}/v1/images/tasks/{taskId}`,
    ],
  };
}

function midjourneyEndpoints(baseUrl: string): GatewayEndpoints {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    submit: [
      `${root}/mj/submit/imagine`,
      `${root}/mj/submit/imagine/fast`,
      `${root}/v1/images/generations?async=true`,
    ],
    query: [
      `${root}/mj/task/{taskId}/fetch`,
      `${root}/mj/task/{taskId}/fetch-status`,
      `${root}/v1/images/generations/{taskId}`,
      `${root}/v1/images/tasks/{taskId}`,
    ],
  };
}

function attachReferenceFields(
  payload: Record<string, unknown>,
  input: ImageAdapterInput
): Record<string, unknown> {
  const next = { ...payload };
  const primary = input.primaryImage || input.images?.[0];
  if (primary) {
    next.image = primary;
    next.image_url = primary;
    next.reference_image = primary;
    next.reference_image_url = primary;
  }
  if (input.productImage) {
    next.product_image = input.productImage;
    next.product_image_url = input.productImage;
  }
  if (input.faceImage) {
    next.face_image = input.faceImage;
    next.face_url = input.faceImage;
    next.anchor_face = input.faceImage;
  }
  if (input.sceneImage) {
    next.scene_image = input.sceneImage;
    next.scene_anchor = input.sceneImage;
    next.environment_anchor_image = input.sceneImage;
  }
  if (input.compositionImage) {
    next.composition_image = input.compositionImage;
    next.composition_url = input.compositionImage;
  }
  if (input.images && input.images.length > 0) {
    next.images = input.images;
    next.reference_images = input.images;
    next.image = input.images[0];
    next.image_url = input.images[0];
    next.reference_image = input.images[0];
    next.reference_image_url = input.images[0];
  }
  return next;
}

function toMjBase64Array(images?: string[]): string[] {
  if (!images?.length) return [];
  return images
    .map((img) => {
      if (!img) return '';
      if (img.startsWith('data:')) {
        const comma = img.indexOf(',');
        return comma >= 0 ? img.slice(comma + 1) : img;
      }
      return img;
    })
    .filter(Boolean);
}

function buildFormatPayloadInput(input: ImageAdapterInput) {
  return {
    prompt: input.prompt,
    size: input.size,
    quality: input.quality,
    n: input.n,
    hasHuman: input.plainMode
      ? false
      : input.hasHuman === true || (input.hasHuman !== false && Boolean(input.faceImage)),
    shotType: input.shotType,
    socialMode: input.socialMode,
    hasFace: Boolean(input.faceImage),
    plainMode: input.plainMode,
  };
}

/** GPT-Image / DALL·E：有参考图时优先 Edits */
export const openaiImageAdapter: ImageModelAdapter = {
  id: 'openai-dalle',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return (
      m.includes('gpt-image') ||
      m.includes('dall-e') ||
      m.includes('dalle')
    );
  },
  build: (input) => {
    const normalized = normalizeOpenAiImageRequest(
      input.model,
      input.size,
      input.quality
    );
    const base = formatModelPayload(normalized.modelId, {
      ...buildFormatPayloadInput(input),
      size: normalized.size,
      quality: normalized.quality,
      omitQuality: normalized.omitQuality,
    });
    const hasRefs = Boolean(input.primaryImage || (input.images && input.images.length > 0));
    const useEdits = Boolean((input.preferEdits || hasRefs) && hasRefs);
    const refs = collectRefImages(input);
    const payload: Record<string, unknown> = {
      model: base.model,
      prompt: base.prompt,
      size: base.size,
      n: base.n,
    };
    if (base.quality !== undefined && base.quality !== null && base.quality !== '') {
      payload.quality = base.quality;
    }
    if (refs.length > 0) {
      payload.image = refs;
    }
    return {
      family: 'openai-dalle',
      modelId: String(base.model),
      useEdits,
      payload: useEdits ? attachReferenceFields(payload, input) : payload,
      endpoints: (baseUrl) => dalleEndpoints(baseUrl, useEdits),
    };
  },
};

/** xAI Grok Image：仅 model + prompt + aspect_ratio + image[]，禁止 size */
export const grokImageAdapter: ImageModelAdapter = {
  id: 'grok-image',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('grok') && (m.includes('image') || m.includes('imagine'));
  },
  build: (input) => {
    const inputSize = input.size && input.size !== 'auto' ? input.size : '2448x3264';
    const aspectRatio = mapToGrokAspectRatio(getAspectRatioFromSize(inputSize));
    const apiModel = resolveGrokApiModelId(input.model);
    const refs = collectRefImages(input);
    const payload: Record<string, unknown> = {
      model: apiModel,
      prompt: cleanPromptText(input.prompt),
      aspect_ratio: aspectRatio,
    };
    if (refs.length > 0) payload.image = refs;
    return {
      family: 'grok-image',
      modelId: apiModel,
      useEdits: false,
      payload,
      endpoints: (baseUrl) => dalleEndpoints(baseUrl, false),
    };
  },
};

/** Gemini / Nano-Banana：走 generations，参考图挂 image 字段 */
export const geminiImageAdapter: ImageModelAdapter = {
  id: 'gemini-nano',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return (
      m.includes('nano-banana') ||
      (m.includes('gemini') && m.includes('image'))
    );
  },
  build: (input) => {
    const base = formatModelPayload(input.model, buildFormatPayloadInput(input));
    return {
      family: 'gemini-nano',
      modelId: String(base.model),
      useEdits: false,
      payload: attachReferenceFields(base, input),
      endpoints: (baseUrl) => dalleEndpoints(baseUrl, false),
    };
  },
};

/** 即梦 / Seedream 绘图 */
export const seedreamImageAdapter: ImageModelAdapter = {
  id: 'seedream',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('seedream') || (m.includes('doubao') && !m.includes('seedance'));
  },
  build: (input) => {
    const base = formatModelPayload(input.model, buildFormatPayloadInput(input));
    return {
      family: 'seedream',
      modelId: String(base.model),
      useEdits: false,
      payload: attachReferenceFields(base, input),
      endpoints: (baseUrl) => dalleEndpoints(baseUrl, false),
    };
  },
};

/** FLUX / Recraft / Ideogram */
export const fluxImageAdapter: ImageModelAdapter = {
  id: 'flux',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('flux') || m.includes('recraft') || m.includes('kontext') || m.includes('ideogram');
  },
  build: (input) => {
    const base = formatModelPayload(input.model, buildFormatPayloadInput(input));
    const payload = attachReferenceFields(base, input);
    // flux-kontext 部分网关习惯把参考图 URL 拼进 prompt
    if (
      input.model.toLowerCase().includes('kontext') &&
      input.primaryImage &&
      typeof input.primaryImage === 'string' &&
      !input.primaryImage.startsWith('data:')
    ) {
      payload.prompt = `${base.prompt} ${input.primaryImage}`.trim();
    }
    return {
      family: 'flux',
      modelId: String(base.model),
      useEdits: false,
      payload,
      endpoints: (baseUrl) => dalleEndpoints(baseUrl, false),
    };
  },
};

/** Midjourney：优先 MJ imagine 通道，失败可回落到 DALL·E 兼容 generations */
export const midjourneyImageAdapter: ImageModelAdapter = {
  id: 'midjourney',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('midjourney') || m.includes('mj_') || m === 'mj' || m.includes('niji');
  },
  build: (input) => {
    const base = formatModelPayload(input.model, buildFormatPayloadInput(input));
    const ar = String(base.aspect_ratio || '1:1');
    const promptWithAr = /--ar\s/i.test(String(base.prompt))
      ? String(base.prompt)
      : `${base.prompt} --ar ${ar}`.trim();
    const base64Array = toMjBase64Array(input.images?.length ? input.images : (input.primaryImage ? [input.primaryImage] : []));
    const payload: Record<string, unknown> = {
      ...attachReferenceFields(base, input),
      prompt: promptWithAr,
      botType: 'MID_JOURNEY',
      base64Array,
    };
    // 部分网关用 mj_fast_imagine 作为 model id
    if (!String(payload.model).toLowerCase().includes('mj_')) {
      payload.model = 'mj_fast_imagine';
    }
    return {
      family: 'midjourney',
      modelId: String(payload.model),
      useEdits: false,
      payload,
      endpoints: midjourneyEndpoints,
    };
  },
};

export const defaultImageAdapter: ImageModelAdapter = {
  id: 'default-image',
  match: () => true,
  build: (input) => openaiImageAdapter.build(input),
};

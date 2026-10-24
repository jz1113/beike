import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { cleanPromptText, formatModelPayload, getAspectRatioFromSize } from '@shared/domain/media/drawing';
import { normalizeOpenAiImageRequest } from '@shared/domain/models/model-adapters/image/normalizeOpenAiImageModel';
import {
  GEMINI_MAX_REFERENCE_IMAGES,
  isGeminiImageModel,
  resolveGeminiAspectRatio,
  resolveGeminiImageSizeTier,
} from '@shared/domain/models/model-adapters/image/geminiImageSizes';
import type { GatewayEndpoints, ImageAdapterInput, ImageModelAdapter } from '../types';

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
  const aliases: Record<string, string> = { 'grok 4.1 image': 'grok-4.1-image', 'grok 4.2 image': 'grok-4.2-image' };
  return aliases[modelId.trim().toLowerCase()] || modelId.trim();
}

function collectRefImages(input: ImageAdapterInput): string[] {
  if (input.images?.length) return input.images.filter(Boolean) as string[];
  if (input.primaryImage) return [input.primaryImage];
  return [];
}

function dalleEndpoints(baseUrl: string, useEdits: boolean): GatewayEndpoints {
  const root = normalizeGatewayBaseUrl(baseUrl);
  if (useEdits) {
    return {
      submit: [
        `${root}/v1/images/edits?async=true`,
        `${root}/v1/images/edits`,
        `${root}/v1/images/generations?async=true`,
        `${root}/v1/images/generations`,
      ],
      query: [
        `${root}/v1/images/tasks/{taskId}`,
        `${root}/v1/images/generations/{taskId}`,
      ],
    };
  }
  return {
    submit: [
      `${root}/v1/images/generations?async=true`,
      `${root}/v1/images/generations`,
    ],
    query: [
      `${root}/v1/images/tasks/{taskId}`,
      `${root}/v1/images/generations/{taskId}`,
    ],
  };
}

function midjourneyEndpoints(baseUrl: string): GatewayEndpoints {
  const root = normalizeGatewayBaseUrl(baseUrl);
  return {
    submit: [
      `${root}/mj/submit/imagine`,
      `${root}/mj/submit/imagine/fast`,
      `${root}/v1/images/generations?async=true`,
    ],
    query: [
      `${root}/mj/task/{taskId}/fetch`,
      `${root}/mj/task/{taskId}/fetch-status`,
      `${root}/v1/images/tasks/{taskId}`,
      `${root}/v1/images/generations/{taskId}`,
    ],
  };
}

let presignedUrlSigner: ((url: string) => string | null) | null = null;

export function setPresignedUrlSigner(signer: ((url: string) => string | null) | null): void {
  presignedUrlSigner = signer;
}

function ensureSafePublicMediaUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  // 若是 Data URL 或已包含签名参数，无需二次处理
  if (
    trimmed.startsWith('data:') ||
    trimmed.includes('OSSAccessKeyId=') ||
    trimmed.includes('X-Amz-Signature=') ||
    trimmed.includes('q-signature=')
  ) {
    return trimmed;
  }
  // 若配置了对象存储签名器，自动转换为带授权签名的 Presigned URL，允许第三方 AI 无密码下载
  const signed = presignedUrlSigner?.(trimmed);
  return signed || trimmed;
}

function attachReferenceFields(
  payload: Record<string, unknown>,
  input: ImageAdapterInput
): Record<string, unknown> {
  const next = { ...payload };
  const primary = ensureSafePublicMediaUrl(input.primaryImage || input.images?.[0]);
  if (primary) {
    next.image = primary;
    next.image_url = primary;
    next.reference_image = primary;
    next.reference_image_url = primary;
  }
  if (input.productImage) {
    const safeProduct = ensureSafePublicMediaUrl(input.productImage);
    next.product_image = safeProduct;
    next.product_image_url = safeProduct;
  }
  if (input.faceImage) {
    const safeFace = ensureSafePublicMediaUrl(input.faceImage);
    next.face_image = safeFace;
    next.face_url = safeFace;
    next.anchor_face = safeFace;
  }
  if (input.sceneImage) {
    const safeScene = ensureSafePublicMediaUrl(input.sceneImage);
    next.scene_image = safeScene;
    next.scene_anchor = safeScene;
    next.environment_anchor_image = safeScene;
  }
  if (input.images && input.images.length > 0) {
    const safeList = input.images.map((img) => ensureSafePublicMediaUrl(img) || img);
    next.images = safeList;
    next.reference_images = safeList;
    next.image = safeList[0];
    next.image_url = safeList[0];
    next.reference_image = safeList[0];
    next.reference_image_url = safeList[0];
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
      m.includes('gpt image') ||
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
    if (useEdits && refs.length > 16) {
      throw new Error('GPT Image 图像编辑最多支持 16 张参考图。');
    }
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

/** Gemini / Nano-Banana：走 generations，省略 size/n/quality，发送 aspect_ratio 与大写 image_size */
export const geminiImageAdapter: ImageModelAdapter = {
  id: 'gemini-nano',
  match: (modelId) => isGeminiImageModel(modelId),
  build: (input) => {
    const base = formatModelPayload(input.model, buildFormatPayloadInput(input));
    const refs = collectRefImages(input).map(url => ensureSafePublicMediaUrl(url) || url);
    if (refs.length > GEMINI_MAX_REFERENCE_IMAGES) {
      throw new Error(`Gemini / Nano Banana 模型最多支持 ${GEMINI_MAX_REFERENCE_IMAGES} 张参考图。`);
    }
    const ratio = resolveGeminiAspectRatio(input.model, input.size);
    const imageSize = resolveGeminiImageSizeTier(input.model, input.quality, input.size);
    const payload: Record<string, unknown> = {
      model: base.model,
      prompt: base.prompt,
      response_format: 'url',
      ...(ratio ? { aspect_ratio: ratio, aspectRatio: ratio } : {}),
      ...(imageSize ? { image_size: imageSize, imageSize } : {}),
      ...(refs.length ? { image: refs } : {}),
    };
    return {
      family: 'gemini-nano', modelId: String(base.model), useEdits: false, payload,
      endpoints: (baseUrl) => dalleEndpoints(baseUrl, false),
    };
  },
};

/** Qwen edit is a multipart image-edit endpoint, never a text-to-image fallback. */
export const qwenEditImageAdapter: ImageModelAdapter = {
  id: 'qwen-edit',
  match: model => ['qwen-image-edit', 'qwen-image-edit-2509'].includes(model.toLowerCase()),
  build: input => {
    const refs = collectRefImages(input);
    if (!refs.length) throw new Error('Qwen 图像编辑需要至少一张参考图。');
    if (input.model.toLowerCase() === 'qwen-image-edit' && refs.length > 1) {
      throw new Error('qwen-image-edit 仅支持一张参考图；多图编辑请选择 qwen-image-edit-2509。');
    }
    return {
      family: 'qwen-edit', modelId: input.model, useEdits: true,
      payload: { model: input.model, prompt: cleanPromptText(input.prompt), image: refs },
      endpoints: baseUrl => ({
        submit: [`${normalizeGatewayBaseUrl(baseUrl)}/v1/images/edits`],
        query: [`${normalizeGatewayBaseUrl(baseUrl)}/v1/images/tasks/{taskId}`],
      }),
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
    if (input.model.toLowerCase() === 'seedream-v5-pro') {
      const requested = String(input.size || '2K').trim();
      let size: string;
      if (/^[3-9]k$/i.test(requested)) throw new Error('seedream-v5-pro 仅支持 1K～2K，请调整分辨率。');
      if (/^(?:1k|2k|1024|2048)$/i.test(requested)) {
        size = /^(?:1k|1024)$/i.test(requested) ? '1024x1024' : '2048x2048';
      } else if (/^\d+\s*x\s*\d+$/i.test(requested)) {
        const dimensions = requested.split(/x/i).map(Number);
        if (dimensions.some(value => value < 1024 || value > 2048)) {
          throw new Error('seedream-v5-pro 支持 1K～2K 尺寸，请将分辨率改为 2K 或使用支持 4K 的模型。');
        }
        size = dimensions.join('x');
      } else {
        const ratio = getAspectRatioFromSize(requested).split(':').map(Number);
        const scale = 2048 / Math.max(...ratio);
        const dimensions = ratio.map(value => Math.round(value * scale));
        if (dimensions.some(value => !Number.isFinite(value) || value < 1024)) {
          throw new Error('seedream-v5-pro 当前比例超出已验证的 1K～2K 尺寸范围，请选择 1:1、3:4、4:3、9:16 或 16:9。');
        }
        size = dimensions.join('x');
      }
      const refs = collectRefImages(input).map(ensureSafePublicMediaUrl).filter(Boolean);
      return {
        family: 'seedream', modelId: input.model, useEdits: false,
        payload: { model: input.model, prompt: cleanPromptText(input.prompt), size, response_format: 'url', ...(refs.length ? { image: refs } : {}) },
        endpoints: baseUrl => dalleEndpoints(baseUrl, false),
      };
    }

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
    return m.includes('midjourney') || m.includes('mj_') || m === 'mj' || m.includes('niji') || /^mjv?\d/.test(m);
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

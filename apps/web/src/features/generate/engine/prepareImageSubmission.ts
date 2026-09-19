import { compressImageForSubmission } from '@/shared/media/image-utils';
import { resolveRefMediaFile } from '@/shared/media/refMediaRegistry';

// Leave headroom below the API/gateway's approximately 8 MB request boundary.
export const IMAGE_SUBMISSION_MAX_BYTES = 6_000_000;
const MAX_REFERENCE_CHARS = 800_000;
const IMAGE_FIELDS = ['referenceImageUrl', 'productImageUrl', 'sourceImageUrl', 'anchorFaceImageUrl', 'sceneAnchorImageUrl', 'socialReferenceImageUrl'] as const;
const ARRAY_FIELDS = ['images', 'referenceImages'] as const;
const isLocalImage = (value: unknown): value is string => typeof value === 'string' && /^(data:image\/|blob:)/i.test(value);

function mapImageFields(body: Record<string, unknown>, transform: (value: string) => string) {
  const next = { ...body };
  for (const key of IMAGE_FIELDS) if (typeof body[key] === 'string') next[key] = transform(body[key] as string);
  for (const key of ARRAY_FIELDS) {
    if (Array.isArray(body[key])) next[key] = (body[key] as string[]).map(transform);
  }
  return next;
}

/** Budget all occurrences, including the primary and source image aliases, without removing any slots. */
export async function prepareImageSubmission(body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const occurrences: string[] = [];
  const skeleton = mapImageFields(body, (value) => {
    if (!isLocalImage(value)) return value;
    occurrences.push(value);
    return '';
  });
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const overhead = bytes(skeleton);
  const budget = IMAGE_SUBMISSION_MAX_BYTES - overhead - 1024;
  if (budget <= 0) throw new Error('提示词或附加数据超过提交上限，请缩短内容后重试');
  const allowance = Math.min(MAX_REFERENCE_CHARS, Math.floor(budget / Math.max(1, occurrences.length)));
  const converted = new Map<string, string>();
  // Sequential decoding prevents many large reference images filling browser memory at once.
  for (const [index, source] of [...new Set(occurrences)].entries()) {
    signal?.throwIfAborted();
    try {
      const input = source.startsWith('blob:') ? resolveRefMediaFile(source) || source : source;
      converted.set(source, await compressImageForSubmission(input, allowance, signal));
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(`第 ${index + 1} 张本地参考图处理失败：${error instanceof Error ? error.message : '无法读取图片'}。请重新载入此图后重试`);
    }
  }
  signal?.throwIfAborted();
  const prepared = mapImageFields(body, (value) => converted.get(value) || value);
  const payload = JSON.stringify(prepared);
  if (new TextEncoder().encode(payload).byteLength > IMAGE_SUBMISSION_MAX_BYTES) {
    throw new Error('参考图自动压缩后仍超过提交上限，请重新载入原图后重试');
  }
  return payload;
}

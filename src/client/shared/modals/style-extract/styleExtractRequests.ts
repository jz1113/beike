import { apiFetch } from '@client/shared/api/apiClient';
import { getExternalScraperCredentials } from '@client/shared/utils/externalScraperCredentials';
import { normalizeImageSource } from '@shared/domain/media/drawing';
import { pickOrderedMultimodalFallbacks } from '@shared/domain/models/workflowModels';
import { getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import type { BaseStyleSkill, ExtractedRecipeData } from './types';

function currentSessionGuard(signal: AbortSignal, isCurrent: () => boolean) {
  return () => {
    signal.throwIfAborted();
    if (!isCurrent()) throw new DOMException('素材会话已结束', 'AbortError');
  };
}

/** Bound parsing concurrency and honor cancellation before credential loading and every request. */
export async function parseStyleReferences(lines: string[], signal: AbortSignal, isCurrent: () => boolean) {
  const assertCurrent = currentSessionGuard(signal, isCurrent);
  assertCurrent();
  const { scraperId, scraperSecret, qiyunAppId, qiyunAppKey } = await getExternalScraperCredentials();
  assertCurrent();
  const results: PromiseSettledResult<Record<string, unknown>>[] = new Array(lines.length);
  let next = 0;
  const worker = async () => {
    while (next < lines.length) {
      assertCurrent();
      const index = next++;
      try {
        const response = await apiFetch('/api/catalog/styles/parse-link', {
          method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: lines[index], text: lines[index], scraperId, customScraperId: scraperId,
            scraperSecret, customApiKey: scraperSecret, qiyunAppId, qiyunAppKey }),
        });
        const value = await response.json();
        assertCurrent();
        results[index] = { status: 'fulfilled', value: response.ok ? value : { ...value, success: false } };
      } catch (reason) {
        assertCurrent();
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, lines.length) }, worker));
  assertCurrent();
  const images: string[] = [], titles: string[] = [];
  let failCount = 0, lastError = '';
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value?.success === true) {
      const values = Array.isArray(result.value.images) && result.value.images.length
        ? result.value.images : [result.value.cover];
      images.push(...values.filter((value): value is string => typeof value === 'string').map(normalizeImageSource).filter(Boolean));
      if (typeof result.value.title === 'string') titles.push(result.value.title);
    } else {
      failCount++;
      if (result.status === 'fulfilled' && result.value?.error) lastError = String(result.value.error);
      else if (result.status === 'rejected' && result.reason instanceof Error) lastError = result.reason.message;
    }
  }
  return { images: [...new Set(images)], titles, failCount, lastError };
}

export async function extractStyleRecipe(input: {
  images: string[]; userHint: string; model: string; modelIds: string[];
  baseSkill?: BaseStyleSkill;
}, signal: AbortSignal, isCurrent: () => boolean): Promise<ExtractedRecipeData> {
  const assertCurrent = currentSessionGuard(signal, isCurrent);
  assertCurrent();
  const { customBaseUrl } = getGatewayClientOverrides();
  const response = await apiFetch('/api/catalog/styles/extract', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrls: input.images, userHint: input.userHint.trim(), baseSkill: input.baseSkill, model: input.model,
      fallbackModels: pickOrderedMultimodalFallbacks(input.model, input.modelIds), customBaseUrl }),
  });
  const data = await response.json();
  assertCurrent();
  if (!response.ok || !data.success) throw new Error(data.error || '风格提炼失败');
  try {
    recordChatTokens({ modelId: data.model || input.model, type: 'vision', usage: data.usage, mediaCount: input.images.length });
  } catch {}
  return data.recipe;
}

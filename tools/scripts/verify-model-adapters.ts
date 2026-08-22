#!/usr/bin/env npx tsx
/**
 * 验证 Grok / OpenAI 模型适配器 payload（无需真实 API Key）
 */
import { buildImageRequest } from '../../src/lib/modelAdapters/index';
import { normalizeOpenAiImageRequest } from '../../src/lib/modelAdapters/image/normalizeOpenAiImageModel';
import { humanizeUpstreamError } from '../../src/lib/upstreamErrors';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('OK:', msg);
}

const grok41 = buildImageRequest({
  model: 'grok-imagine-image-2.0',
  prompt: '一只猫',
  size: '2448x3264',
});
assert(grok41.family === 'grok-image', 'grok 4.1 family=grok-image');
assert(grok41.modelId === 'grok-4.1-image', 'grok 4.1 modelId mapped');
assert(!('size' in grok41.payload), 'grok 4.1 no size in payload');
assert(grok41.payload.aspect_ratio === '2:3', 'grok 4.1 aspect_ratio 3:4→2:3');
assert(grok41.useEdits === false, 'grok 4.1 useEdits=false');

const grok42 = buildImageRequest({
  model: 'grok-4.2-image',
  prompt: '一只猫',
  size: '2448x3264',
});
assert(grok42.family === 'grok-image', 'grok 4.2 family=grok-image');
assert(grok42.modelId === 'grok-4.2-image', 'grok 4.2 modelId');
assert(!('size' in grok42.payload), 'grok 4.2 no size in payload');

const gpt = buildImageRequest({
  model: 'gpt-image-2',
  prompt: '一只猫',
  size: '2448x3264',
  quality: 'high',
});
assert(gpt.family === 'openai-dalle', 'gpt family=openai-dalle');
assert('size' in gpt.payload, 'gpt has size');

const seedream = buildImageRequest({
  model: 'doubao-seedream-5-0-260128',
  prompt: '一只猫',
  size: '2448x3264',
});
assert(seedream.family === 'seedream', 'seedream family');

const human = humanizeUpstreamError('No available compatible accounts');
assert(human.includes('GPT Image'), 'humanize GPT account error');

// --- comfly gpt-image 按 model 固定参数（Apifox 三档）---
const std4k = buildImageRequest({
  model: 'gpt-image-2',
  prompt: '猫',
  size: '1:1',
  quality: 'high',
  plainMode: true,
});
assert(std4k.modelId === 'gpt-image-2', '标准+1:1+4K model 保持 gpt-image-2');
assert(std4k.payload.quality === 'high', '标准+4K 传 quality=high');
assert(std4k.payload.size === '2880x2880', '标准+1:1+4K size=2880x2880');

const std2k = buildImageRequest({
  model: 'gpt-image-2',
  prompt: '猫',
  size: '3:4',
  quality: 'medium',
  plainMode: true,
});
assert(std2k.modelId === 'gpt-image-2', '标准+2K model 保持 gpt-image-2');
assert(std2k.payload.quality === 'medium', '标准+2K 传 quality=medium');
assert(std2k.payload.size === '1536x2048', '标准+3:4+2K size=1536x2048');

const dedicated4k = buildImageRequest({
  model: 'gpt-image-2-4k',
  prompt: '猫',
  size: '3:4',
  quality: 'high',
  plainMode: true,
});
assert(dedicated4k.modelId === 'gpt-image-2-4k', '专线 model 保持 gpt-image-2-4k');
assert(dedicated4k.payload.quality == null || dedicated4k.payload.quality === undefined, '专线 omit quality');
assert(dedicated4k.payload.size === '2160x3840', '专线+3:4 size=2160x3840');

const suffix2k = buildImageRequest({
  model: 'gpt-image-2-2k',
  prompt: '猫',
  size: '3:4',
  quality: 'high',
  plainMode: true,
});
assert(suffix2k.modelId === 'gpt-image-2-2k', '2k suffix model 保持 gpt-image-2-2k');
assert(suffix2k.payload.quality == null || suffix2k.payload.quality === undefined, '2k suffix omit quality');
assert(suffix2k.payload.size === '1536x2048', '2k suffix+3:4 size=1536x2048');

const dirtyId = normalizeOpenAiImageRequest('gpt-image-2-4k-2k', '3:4', 'high');
assert(dirtyId.modelId === 'gpt-image-2-4k', '脏 id 清理为 gpt-image-2-4k');
assert(dirtyId.size === '2160x3840', '脏 id 专线 3:4 → 2160x3840');

console.log('\nAll adapter checks passed.');

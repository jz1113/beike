/** Standard-size compatibility profile for independent OpenAI image endpoints. */
export function usesStandardOpenAiImages(baseUrl: string, model: string, explicit = false): boolean {
  if (!/^(?:openai\/)?gpt-image-/i.test(model)) return false;
  try { return explicit || ['api.gapnet.ai', 'api.openai.com'].includes(new URL(baseUrl).hostname); }
  catch { return false; }
}

export function resolveImageGatewaySize(baseUrl: string, model: string, size: string, aspect?: string, explicit = false): string {
  if (!usesStandardOpenAiImages(baseUrl, model, explicit)) return size;
  if (size === 'auto') return 'auto';
  const match = /^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/i.exec(aspect || size);
  if (!match) return 'auto';
  const [w, h] = match.slice(1).map(Number);
  if (!w || !h) return 'auto';
  // Earlier GPT Image models only accept their fixed dimensions.
  if (!/gpt-image-2(?:[.-]|$)/i.test(model)) {
    return w === h ? '1024x1024' : w < h ? '1024x1536' : '1536x1024';
  }
  // Closest exact-ratio 1K sizes with 16-aligned edges and >=655,360 pixels.
  const presets: Array<[number, number, string]> = [
    [21, 9, '1344x576'], [16, 9, '1280x720'], [3, 2, '1008x672'],
    [4, 3, '1024x768'], [1, 1, '1024x1024'], [3, 4, '768x1024'],
    [2, 3, '672x1008'], [9, 16, '720x1280'],
  ];
  const preset = presets.find(([rw, rh]) => Math.abs(w / h - rw / rh) < 0.001);
  if (preset) return preset[2];
  const ratio = w / h;
  if (ratio < 1 / 3 || ratio > 3) throw Object.assign(new Error('GPT Image 图片比例须在 1:3 至 3:1 之间'), { upstreamStatus: 400 });
  const scale = Math.max(1024 / Math.max(w, h), Math.sqrt(655360 / (w * h)));
  return `${Math.ceil(w * scale / 16) * 16}x${Math.ceil(h * scale / 16) * 16}`;
}

/** Whitelist the fields this application's GPT Image workflow supports. References go in multipart. */
export function buildStandardOpenAiImagePayload(input: {
  baseUrl: string; model: string; prompt: string; size: string; aspect?: string; quality?: string;
}): Record<string, unknown> {
  const quality = input.quality || 'auto';
  const aliases: Record<string, string> = { '1k': 'low', '2k': 'medium', '4k': 'high' };
  const normalizedQuality = aliases[quality.toLowerCase()] || quality.toLowerCase();
  const allowed = /gpt-image-2\.5-(flare|sunburst)/i.test(input.model)
    ? ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] : ['auto', 'low', 'medium', 'high'];
  if (!allowed.includes(normalizedQuality)) throw Object.assign(new Error('GPT Image 画质须为 auto、low、medium 或 high'), { upstreamStatus: 400 });
  return {
    model: input.model,
    prompt: input.prompt,
    size: resolveImageGatewaySize(input.baseUrl, input.model, input.size, input.aspect, true),
    quality: normalizedQuality,
    n: 1,
    output_format: 'png',
  };
}

import { padMissingOriginalShots, shotNoOf } from './analyzeVisionCall';

/** The product-only model returns product_sentence, not a complete prompt. */
export function prepareProductSentenceShots(
  prompts: unknown,
  targetCount: number,
  context: Parameters<typeof padMissingOriginalShots>[2],
) {
  const rows = Array.isArray(prompts) ? prompts : [];
  const usable = new Set<number>();
  rows.forEach((row, index) => {
    const shotNo = shotNoOf(row, index);
    if (shotNo < 1 || shotNo > targetCount) return;
    const fields = row && typeof row === 'object' ? row as Record<string, unknown> : null;
    const text = fields
      ? String(fields.product_sentence || fields.prompt || fields.description || '').trim()
      : '';
    if (text) usable.add(shotNo);
  });
  if (usable.size < Math.ceil(targetCount * 0.5)) {
    throw new Error(`视觉分析只解析出 ${usable.size}/${targetCount} 个有效分镜，请重试`);
  }
  return {
    prompts: padMissingOriginalShots(rows, targetCount, context),
    parsedCount: usable.size,
  };
}

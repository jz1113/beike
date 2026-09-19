const fields = ['referenceImages', 'images', 'referenceImageUrl', 'sourceImageUrl', 'productImageUrl',
  'firstFrameUrl', 'first_frame_image', 'refImages', 'refImageUrls', 'inputImages', 'inputImage',
  'sourceImages', 'productImages'] as const;
/** Collect legacy reference fields in their original order, with cycle protection. */
export function extractTaskReferenceImages(task: unknown): string[] {
  const result: string[] = [];
  const visited = new Set<object>();
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) result.push(value.trim());
    else if (Array.isArray(value) && !visited.has(value)) {
      visited.add(value); value.forEach(push);
    }
  };
  const extract = (value: unknown) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    const item = value as Record<string, unknown>;
    fields.forEach(field => push(item[field]));
    for (const [group, keys] of [['params', ['referenceImages', 'referenceImageUrl', 'images']],
      ['options', ['referenceImages', 'images', 'referenceImageUrl']], ['extra', ['referenceImages']]] as const) {
      const nested = item[group];
      if (nested && typeof nested === 'object') keys.forEach(key => push((nested as Record<string, unknown>)[key]));
    }
    extract(item.rawTask);
  };
  extract(task);
  return [...new Set(result)];
}

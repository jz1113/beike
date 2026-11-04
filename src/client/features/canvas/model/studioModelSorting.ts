import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { inferVendorId } from '@shared/domain/models/modelSorting';

function versionParts(modelId: string): number[] {
  const id = canonicalModelId(modelId).toLowerCase()
    .replace(/[-_](?:20\d{6}|\d{6})(?=[-_]|$)/g, '')
    .replace(/\d+(?:ms|s)(?=[-_]|$)/g, '');
  // Accept both Seedance 2-5 and 2.5; dates and durations are not generations.
  return id.match(/\d+(?:[._-]\d{1,2}(?!\d))*/)?.[0].split(/[._-]/).map(Number) ?? [];
}

export function sortStudioModels<T extends { modelId: string }>(models: readonly T[]): T[] {
  const vendors = new Map<string, Array<{ model: T; version: number[] }>>();
  for (const model of models) {
    const vendor = inferVendorId(model.modelId);
    const group = vendors.get(vendor) ?? [];
    group.push({ model, version: versionParts(model.modelId) });
    vendors.set(vendor, group);
  }
  return [...vendors.values()].flatMap(group => group.sort((a, b) => {
    for (let index = 0; index < Math.max(a.version.length, b.version.length); index++) {
      const difference = (b.version[index] ?? 0) - (a.version[index] ?? 0);
      if (difference) return difference;
    }
    return 0;
  }).map(item => item.model));
}

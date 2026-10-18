import { parseModelDetails, type ParsedRawModel } from './modelParsing';

export { isLegacyOrDiscontinuedModel, parseModelDetails } from './modelParsing';
export type { ParsedRawModel } from './modelParsing';

export interface ModelSnapshotItem {
  modelId: string;
  date: string;
}

export interface VariantItem {
  variantKey: string;
  displayName: string;
  primaryModelId: string;
  allModelIds: string[];
  snapshots: ModelSnapshotItem[];
}

export interface GenerationRowItem {
  rowId: string;
  vendorId: string;
  vendorName: string;
  familyId: string;
  familyName: string;
  generationLabel: string;
  versionScore: number;
  variants: VariantItem[];
  allModelIds: string[];
  isArchived: boolean;
}

export interface VendorGenerationSection {
  vendorId: string;
  vendorName: string;
  rows: GenerationRowItem[];
  totalModels: number;
}

const TIER_WEIGHTS: Record<string, number> = {
  sol: 100,
  luna: 90,
  astra: 80,
  terra: 70,
  opus: 95,
  sonnet: 90,
  haiku: 75,
  pro: 90,
  max: 85,
  ultra: 80,
  flash: 80,
  fast: 78,
  mini: 60,
  nano: 50,
  default: 70,
};

/**
 * 将模型列表按厂商和代际行聚合。同一家族的 2.5 / 2.0 / 1.5 各自成行，
 * 行内再按规格（Pro、Fast、标准版）展开。
 */
export function groupModelsByGeneration(
  modelIds: string[],
  kind?: string,
): VendorGenerationSection[] {
  const parsedList = modelIds.map((id) => parseModelDetails(id, kind));

  const vendorMap = new Map<string, { vendorName: string; rowsMap: Map<string, ParsedRawModel[]> }>();

  for (const item of parsedList) {
    let vendorEntry = vendorMap.get(item.vendorId);
    if (!vendorEntry) {
      vendorEntry = { vendorName: item.vendorName, rowsMap: new Map() };
      vendorMap.set(item.vendorId, vendorEntry);
    }

    const rowKey = `${item.vendorId}-${item.familyId}-${item.versionKey}-${item.isArchived ? 'archived' : 'active'}`;
    let rowBucket = vendorEntry.rowsMap.get(rowKey);
    if (!rowBucket) {
      rowBucket = [];
      vendorEntry.rowsMap.set(rowKey, rowBucket);
    }
    rowBucket.push(item);
  }

  const sections: VendorGenerationSection[] = [];

  for (const [vendorId, { vendorName, rowsMap }] of vendorMap.entries()) {
    const rows: GenerationRowItem[] = [];
    let vendorTotal = 0;

    for (const [rowKey, items] of rowsMap.entries()) {
      vendorTotal += items.length;
      const first = items[0];

      const variantMap = new Map<string, ParsedRawModel[]>();
      for (const it of items) {
        const specKey = it.variantKey;
        let bucket = variantMap.get(specKey);
        if (!bucket) {
          bucket = [];
          variantMap.set(specKey, bucket);
        }
        bucket.push(it);
      }

      const variants: VariantItem[] = Array.from(variantMap.entries()).map(([variantKey, variantItems]) => {
        const nonDated = variantItems.find((it) => !it.snapshotDate);
        const snapshots: ModelSnapshotItem[] = variantItems
          .filter((it) => !!it.snapshotDate)
          .map((it) => ({ modelId: it.modelId, date: it.snapshotDate! }))
          .sort((a, b) => b.date.localeCompare(a.date));

        const primaryModelId = nonDated ? nonDated.modelId : (snapshots[0]?.modelId || variantItems[0].modelId);
        const primary = variantItems.find((it) => it.modelId === primaryModelId) || variantItems[0];

        return {
          variantKey,
          displayName: primary.displayName,
          primaryModelId,
          allModelIds: variantItems.map((it) => it.modelId),
          snapshots: snapshots.filter((snap) => snap.modelId !== primaryModelId),
        };
      });

      variants.sort((a, b) => {
        const left = TIER_WEIGHTS[a.variantKey.toLowerCase()] || 40;
        const right = TIER_WEIGHTS[b.variantKey.toLowerCase()] || 40;
        return right - left;
      });

      rows.push({
        rowId: rowKey,
        vendorId,
        vendorName,
        familyId: first.familyId,
        familyName: first.familyName,
        generationLabel: first.generationLabel,
        versionScore: first.versionScore,
        variants,
        allModelIds: items.map((it) => it.modelId),
        isArchived: first.isArchived,
      });
    }

    rows.sort((a, b) => {
      if (a.isArchived && !b.isArchived) return 1;
      if (!a.isArchived && b.isArchived) return -1;
      if (b.versionScore !== a.versionScore) return b.versionScore - a.versionScore;
      return b.allModelIds.length - a.allModelIds.length;
    });

    sections.push({
      vendorId,
      vendorName,
      rows,
      totalModels: vendorTotal,
    });
  }

  const vendorRank = ['openai', 'anthropic', 'google', 'deepseek', 'bytedance', 'alibaba', 'flux', 'xai'];
  sections.sort((a, b) => {
    const aIdx = vendorRank.indexOf(a.vendorId);
    const bIdx = vendorRank.indexOf(b.vendorId);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return b.totalModels - a.totalModels;
  });

  return sections;
}

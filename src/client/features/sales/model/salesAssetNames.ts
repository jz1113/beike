type AssetKind = 'persona' | 'scene';

export function salesAssetNumber(kind: AssetKind, name: string): number | undefined {
  const prefix = kind === 'persona' ? '人物' : '场景';
  const match = new RegExp(`^${prefix}\\s*0*(\\d+)$`).exec(name.trim());
  const value = match ? Number(match[1]) : undefined;
  return value !== undefined && Number.isSafeInteger(value) ? value : undefined;
}

export function nextSequentialSalesAssetName(kind: AssetKind, names: readonly string[]): string {
  const max = names.reduce((value, name) => Math.max(value, salesAssetNumber(kind, name) ?? 0), 0);
  return `${kind === 'persona' ? '人物' : '场景'}${max + 1}`;
}

const assetNameOrder = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base', ignorePunctuation: true });

export function compareSalesAssetNames(left: string, right: string): number {
  return assetNameOrder.compare(left.trim(), right.trim());
}

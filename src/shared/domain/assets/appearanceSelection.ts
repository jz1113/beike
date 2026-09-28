import { appearanceAudience, audienceOptions, type AppearanceAudience } from './appearanceAudience';
export type AppearanceSelection = { audiences: AppearanceAudience[]; ids?: string[] };
export function isAppearanceRotation(value: unknown): value is string {
  return typeof value === 'string' && (value === 'rotate' || value.startsWith('rotate:'));
}
export function parseAppearanceSelection(value: string, outfit = false): AppearanceSelection {
  if (value === 'rotate') return { audiences: audienceOptions(outfit).filter(row => row.id !== 'unknown').map(row => row.id) };
  try {
    const parsed = JSON.parse(value.slice(7));
    if (!Array.isArray(parsed.audiences) || (parsed.ids !== undefined && !Array.isArray(parsed.ids))) return { audiences: [] };
    return { audiences: audienceOptions(outfit).filter(row => row.id !== 'unknown' && parsed.audiences.includes(row.id)).map(row => row.id),
      ...(parsed.ids !== undefined ? { ids: parsed.ids.filter((id: unknown): id is string => typeof id === 'string') } : {}) };
  } catch { return { audiences: [] }; }
}
export function encodeAppearanceSelection(value: AppearanceSelection): string {
  return `rotate:${JSON.stringify(value)}`;
}
export function matchesAppearanceSelection(asset: Record<string, unknown>, selection: AppearanceSelection, outfit = false): boolean {
  return selection.audiences.includes(appearanceAudience(asset, outfit)) && (selection.ids === undefined || selection.ids.includes(String(asset.id)));
}

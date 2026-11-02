import type { AssetViewRequest } from './salesAssetViews';

export interface SalesAssetDraft {
  fields: Record<string, string>;
  views?: Record<string, string>;
  extraImages?: string[];
  model?: string;
  request?: AssetViewRequest | null;
}

export interface SalesAssetDraftPersistence {
  saved: SalesAssetDraft | null;
  update: (patch: Partial<SalesAssetDraft>) => boolean;
}

export function salesAssetDraftKey(workspace: string, kind: 'persona' | 'scene', id?: string): string {
  return `beike.sales.asset-draft.v1:${encodeURIComponent(workspace)}:${kind}:${encodeURIComponent(id || 'new')}`;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const fields = (value: unknown): Record<string, string> => Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));

export function readSalesAssetDraft(key: string): SalesAssetDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = record(JSON.parse(raw));
    if (!saved.fields || typeof saved.fields !== 'object') return null;
    const request = record(saved.request);
    return {
      fields: fields(saved.fields),
      ...(saved.views ? { views: fields(saved.views) } : {}),
      ...(Array.isArray(saved.extraImages) ? { extraImages: strings(saved.extraImages) } : {}),
      model: typeof saved.model === 'string' ? saved.model : undefined,
      request: typeof request.key === 'string' && typeof request.model === 'string' && strings(request.references).length ? {
        key: request.key, model: request.model, references: strings(request.references),
        ...(typeof request.jobId === 'string' ? { jobId: request.jobId } : {}),
        ...(typeof request.assetId === 'string' ? { assetId: request.assetId } : {}),
        ...(typeof request.prompt === 'string' ? { prompt: request.prompt } : {}),
        ...(typeof request.promptVersion === 'string' ? { promptVersion: request.promptVersion } : {}),
        ...(typeof request.taskId === 'string' ? { taskId: request.taskId } : {}),
        ...(typeof request.resultUrl === 'string' ? { resultUrl: request.resultUrl } : {}),
        ...(Object.keys(fields(request.images)).length ? { images: fields(request.images) } : {}),
      } : null,
    };
  } catch { return null; }
}

export function writeSalesAssetDraft(key: string, draft: SalesAssetDraft): void {
  localStorage.setItem(key, JSON.stringify(draft));
}

import type { AssetViewRequest } from './salesAssetViews';
import { readSalesAssetCreation, type SalesAssetCreation } from './salesAssetCreation';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';

export interface SalesAssetDraft {
  fields: Record<string, string>;
  views?: Record<string, string>;
  extraImages?: string[];
  model?: string;
  request?: AssetViewRequest | null;
  creation?: SalesAssetCreation;
  assetId?: string;
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
      creation: readSalesAssetCreation(JSON.stringify({ assetCreation: saved.creation })),
      assetId: typeof saved.assetId === 'string' ? saved.assetId : undefined,
      request: typeof request.key === 'string' && typeof request.model === 'string' && strings(request.references).length ? {
        key: request.key, model: request.model, references: strings(request.references),
        ...(typeof request.jobId === 'string' ? { jobId: request.jobId } : {}),
        ...(typeof request.assetId === 'string' ? { assetId: request.assetId } : {}),
        ...(typeof request.prompt === 'string' ? { prompt: request.prompt } : {}),
        ...(request.layout === '1x4' || request.layout === '3x3' ? { layout: request.layout } : {}),
        ...(typeof request.promptVersion === 'string' ? { promptVersion: request.promptVersion } : {}),
        ...(typeof request.analysisModel === 'string' ? { analysisModel: request.analysisModel } : {}),
        ...(request.creation ? { creation: readSalesAssetCreation(JSON.stringify({ assetCreation: request.creation })) } : {}),
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

export function findSalesAssetDraftJob(draft: SalesAssetDraft | null, kind: string, jobs: readonly SalesAssetViewJob[]): SalesAssetViewJob | undefined {
  if (!draft?.request) return undefined;
  const assetId = draft.assetId || draft.request.assetId;
  return jobs.find((job) => job.kind === kind && (!assetId || job.assetId === assetId)
    && (draft.request?.jobId ? job.id === draft.request.jobId : job.key === draft.request?.key));
}

/** Recover a confirmed submission receipt and results without replacing subsequent local edits. */
export function restoreSalesAssetDraftJob(draft: SalesAssetDraft, job: SalesAssetViewJob): SalesAssetDraft {
  const request = draft.request;
  if (!request || (request.jobId ? request.jobId !== job.id : request.key !== job.key)
    || (draft.assetId || request.assetId) && (draft.assetId || request.assetId) !== job.assetId) return draft;
  const completed = job.status === 'completed' && !request.images;
  const creation = job.creation && (!draft.creation || draft.creation.referenceImageUrl === job.creation.referenceImageUrl)
    ? { ...job.creation, ...Object.fromEntries(Object.entries(draft.creation || {}).filter(([, value]) => Boolean(value))) } : draft.creation;
  const views = { ...draft.views };
  if (completed) {
    for (const [view, url] of Object.entries(job.images)) if (!views[view]) views[view] = url;
    if (!views.main && creation?.imageUrl) views.main = creation.imageUrl;
  }
  return { ...draft, assetId: job.assetId, views, creation, request: { ...request, jobId: job.id, assetId: job.assetId,
    ...(job.creation ? { creation: job.creation } : {}), ...(completed ? { images: job.images } : {}) } };
}

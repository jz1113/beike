import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';
import { IMAGE_GEN_MODELS } from '@shared/domain/media/drawing';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';

export function supportsSalesAssetReferences(selection: string): boolean {
  const id = upstreamModalityModelId('image', selection);
  return IMAGE_GEN_MODELS.find((model) => model.id === id)?.supportEdits !== false;
}

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

export interface SalesAssetCreation {
  referenceImageUrl: string;
  prompt?: string;
  imageUrl?: string;
  promptModel?: string;
  imageModel?: string;
}

export function readSalesAssetCreation(dimensions?: string): SalesAssetCreation | undefined {
  const value = audienceDimensions(audienceDimensions(dimensions).assetCreation);
  if (typeof value.referenceImageUrl !== 'string' || !value.referenceImageUrl.trim()) return undefined;
  return {
    referenceImageUrl: value.referenceImageUrl,
    ...Object.fromEntries(['prompt', 'imageUrl', 'promptModel', 'imageModel'].flatMap((key) =>
      typeof value[key] === 'string' ? [[key, value[key]]] : [])),
  };
}

export function assetCreationDimensions(dimensions: string | undefined, creation?: SalesAssetCreation): string {
  const current = audienceDimensions(dimensions);
  return JSON.stringify({ ...current, assetCreation: creation });
}

export function readSalesAssetJobId(dimensions?: string): string | undefined {
  const value = audienceDimensions(dimensions).salesAssetViewJobId;
  return typeof value === 'string' && value ? value : undefined;
}

export const PERSONA_ANGLES = [
  { id: 'front', label: '正面全身', hint: '从头顶到鞋底的正面照' },
  { id: 'side', label: '侧面全身', hint: '左侧 90 度全身照' },
  { id: 'back', label: '背面全身', hint: '背对镜头的全身照' },
  { id: 'face', label: '脸部特写', hint: '正面头肩近景' },
] as const;

export function hasLegacyPersonaSheet(views: Record<string, string>) {
  return PERSONA_ANGLES.every(({ id }) => Boolean(views[id]));
}

export interface AssetViewDefinition<V extends string> {
  id: V | 'main';
  label: string;
  hint: string;
}

export interface AssetViewSet<V extends string> {
  views: Record<V | 'main', string>;
  extraImages: string[];
}

export interface AssetViewRequest {
  key: string;
  jobId?: string;
  assetId?: string;
  taskId?: string;
  recordId?: string;
  resultUrl?: string;
  images?: Record<string, string>;
  model: string;
  references: string[];
  prompt?: string;
  promptVersion?: string;
  layout?: '1x4' | '3x3';
  creation?: SalesAssetCreation;
  analysisModel?: string;
}

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
        ...(typeof request.recordId === 'string' ? { recordId: request.recordId } : {}),
        ...(typeof request.resultUrl === 'string' ? { resultUrl: request.resultUrl } : {}),
        ...(Object.keys(fields(request.images)).length ? { images: fields(request.images) } : {}),
      } : null,
    };
  } catch { return null; }
}

export function writeSalesAssetDraft(key: string, draft: SalesAssetDraft): void {
  localStorage.setItem(key, JSON.stringify(draft));
}

import type { z } from 'zod';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { salesScriptTemplateSchema, salesScriptVideoUploadResponseSchema } from '@shared/contracts/salesScripts';
import type { SalesScriptDomain, SalesScriptStatus } from '@shared/domain/sales';

export interface StoredSalesScript {
  id: string;
  title: string;
  videoUrl: string;
  videoHash: string;
  depthVideoUrl?: string;
  depthTaskId?: string;
  depthOperationId?: string;
  status: SalesScriptStatus;
  script: SalesScriptDomain;
  model: string;
  promptVersion: string;
  version: number;
  useCount: number;
  updatedAt: string;
  /** Local eligibility from the raw response, before legacy normalization can discard malformed fields. */
  analysisCacheEligible?: boolean;
}

export interface SalesScriptDraftResult {
  saveWarning?: string;
  depthWarning?: string;
  script: SalesScriptDomain;
  model: string;
  promptVersion: string;
  videoHash: string;
  existingId?: string;
  version?: number;
  status?: SalesScriptStatus;
  cached?: boolean;
}

export type SalesScriptImportVideo = z.infer<typeof salesScriptVideoUploadResponseSchema>;
export interface SalesScriptImportItem {
  key: string;
  name: string;
  size: number;
  lastModified: number;
  file?: File;
  status: 'queued' | 'uploading' | 'analyzing' | 'saving' | 'depth' | 'done' | 'error';
  error: string;
  video?: SalesScriptImportVideo;
  result?: SalesScriptDraftResult;
  saveId: string;
  scriptId?: string;
  includeDepth?: boolean;
  model?: string;
  depthState?: 'prepared' | 'submitted' | 'ready' | 'failed' | 'skipped';
  depthOperationId?: string;
  depthTaskId?: string;
  depthVideoUrl?: string;
  depthProgress?: string;
}

export const MAX_SCRIPT_IMPORT_FILES = 30;
export function addSalesScriptImportFiles(existing: readonly SalesScriptImportItem[], files: readonly File[]) {
  const items = [...existing];
  const errors: string[] = [];
  for (const file of files) {
    if (!/\.(mp4|mov|webm)$/i.test(file.name)) {
      errors.push(`${file.name}：请选择 MP4、MOV 或 WebM 视频`); continue;
    }
    if (!file.size || file.size > 64 * 1024 * 1024) {
      errors.push(`${file.name}：视频须大于 0 且不超过 64 MB`); continue;
    }
    const index = items.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
    if (index >= 0) {
      if (!items[index].file) items[index] = { ...items[index], file };
      continue;
    }
    if (items.length >= MAX_SCRIPT_IMPORT_FILES) {
      const message = '每批最多 30 个视频，请完成本批后继续导入';
      if (!errors.includes(message)) errors.push(message);
      continue;
    }
    items.push({ key: `script-import-${crypto.randomUUID()}`, name: file.name, size: file.size, lastModified: file.lastModified,
      file, saveId: `script_${crypto.randomUUID()}`, status: 'queued', error: '' });
  }
  return { items, errors };
}

const KEY = 'beike_sales_script_import_v1';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : undefined;

function readResult(value: unknown): SalesScriptDraftResult | undefined {
  const raw = record(value);
  const script = salesScriptTemplateSchema.safeParse(raw.script);
  if (!script.success || !['model', 'promptVersion', 'videoHash'].every((key) => typeof raw[key] === 'string')) return undefined;
  return { script: script.data, model: raw.model as string, promptVersion: raw.promptVersion as string, videoHash: raw.videoHash as string,
    existingId: text(raw.existingId), saveWarning: text(raw.saveWarning), depthWarning: text(raw.depthWarning), cached: raw.cached === true };
}

function readItem(value: unknown): SalesScriptImportItem | null {
  const raw = record(value);
  if (!['key', 'name', 'saveId'].every((key) => typeof raw[key] === 'string' && raw[key])
    || typeof raw.size !== 'number' || !Number.isFinite(raw.size) || raw.size <= 0
    || typeof raw.lastModified !== 'number' || !Number.isFinite(raw.lastModified)) return null;
  const video = salesScriptVideoUploadResponseSchema.safeParse(raw.video);
  const result = readResult(raw.result);
  const depthState = ['prepared', 'submitted', 'ready', 'failed', 'skipped'].includes(String(raw.depthState)) ? raw.depthState as SalesScriptImportItem['depthState'] : undefined;
  return { key: raw.key as string, name: raw.name as string, saveId: raw.saveId as string, size: raw.size, lastModified: raw.lastModified,
    status: raw.status === 'done' ? 'done' : raw.status === 'error' ? 'error' : 'queued',
    error: text(raw.error) || '', video: raw.status !== 'done' && video.success ? video.data : undefined, result,
    scriptId: text(raw.scriptId), model: text(raw.model), includeDepth: typeof raw.includeDepth === 'boolean' ? raw.includeDepth : undefined,
    depthState, depthOperationId: text(raw.depthOperationId), depthTaskId: text(raw.depthTaskId), depthVideoUrl: text(raw.depthVideoUrl), depthProgress: text(raw.depthProgress) };
}

export function readSalesScriptImport(): SalesScriptImportItem[] {
  try {
    const workspace = getWorkspaceSecret();
    const saved = record(JSON.parse(localStorage.getItem(`${KEY}:${workspace}`) || 'null'));
    if (saved.workspace !== workspace || !Array.isArray(saved.items)) return [];
    return saved.items.slice(0, MAX_SCRIPT_IMPORT_FILES).map(readItem).filter((item): item is SalesScriptImportItem => Boolean(item));
  } catch { return []; }
}

export function saveSalesScriptImport(items: readonly SalesScriptImportItem[]): void {
  const workspace = getWorkspaceSecret();
  if (!items.length) { localStorage.removeItem(`${KEY}:${workspace}`); return; }
  localStorage.setItem(`${KEY}:${workspace}`, JSON.stringify({ workspace, items: items.map((item) => ({ ...item, file: undefined })) }));
}


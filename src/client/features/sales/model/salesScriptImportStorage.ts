import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { salesScriptTemplateSchema, salesScriptVideoUploadResponseSchema } from '@shared/contracts/salesScripts';
import type { SalesScriptDraftResult } from './salesScriptTypes';
import { MAX_SCRIPT_IMPORT_FILES, type SalesScriptImportItem } from './salesScriptImport';

const KEY = 'beike_sales_script_import_v1';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : undefined;

function readResult(value: unknown): SalesScriptDraftResult | undefined {
  const raw = record(value);
  const script = salesScriptTemplateSchema.safeParse(raw.script);
  if (!script.success || !['model', 'promptVersion', 'videoHash'].every((key) => typeof raw[key] === 'string')) return undefined;
  return { script: script.data, model: raw.model as string, promptVersion: raw.promptVersion as string, videoHash: raw.videoHash as string,
    existingId: text(raw.existingId), saveWarning: text(raw.saveWarning), depthWarning:text(raw.depthWarning), cached: raw.cached === true };
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

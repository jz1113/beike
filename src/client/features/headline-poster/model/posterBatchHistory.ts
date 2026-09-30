import { COVER_FORMATS, parseCoverFormat } from './coverFormat';
import { normalizePosterProductionSettings } from './posterSettings';
import {
  isPosterImageUrl,
  normalizeProductName,
  posterInputError,
  type CoverDesignPlan,
  type PosterItem,
  type PosterProductionSettings,
  type PosterStatus,
} from './posterTypes';

export const POSTER_BATCH_HISTORY_KEY = 'headline_poster_batch_history_v1';
export const POSTER_BATCH_HISTORY_LIMIT = 24;
const LEGACY_SCOPE_KEY = `${POSTER_BATCH_HISTORY_KEY}:legacy_scope`;

export interface PosterHistoryWriteResult {
  records: PosterBatchRecord[];
  saved: boolean;
  removedResultCacheKeys: string[];
}

/** The workspace credential must never appear in browser history keys. */
export async function resolvePosterWorkspaceScope(secret: string): Promise<string> {
  if (secret.trim().length < 32 || !globalThis.crypto?.subtle) throw new Error('无法确认当前工作区，已停止读取和提交大字报任务');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret.trim()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function scopedHistoryKey(scope: string): string {
  if (!/^[a-f0-9]{64}$/.test(scope)) throw new Error('大字报工作区标识无效');
  return `${POSTER_BATCH_HISTORY_KEY}:${scope}`;
}

export interface PosterBatchSnapshotItem extends Omit<PosterItem, 'resultUrl'> {
  resultUrl?: string;
  resultCacheKey?: string;
}

export interface PosterBatchRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Identifies the exact saved snapshot for cross-page conflict checks. */
  revision?: string;
  settings: PosterProductionSettings;
  items: PosterBatchSnapshotItem[];
}

const STATUSES = new Set<PosterStatus>(['idle', 'rewriting', 'prompting', 'rendering', 'interrupted', 'complete', 'failed']);
const PLAN_FIELDS = ['name', 'rationale', 'palette', 'composition', 'material', 'typography', 'visualAnchor', 'generationDirection', 'eyebrow', 'supportLine'] as const;

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function savedMediaUrl(value: unknown): string | undefined {
  const url = stringValue(value)?.trim();
  if (!url) return undefined;
  // Blob URLs only work for their original document. Local media has stable paths.
  return isPosterImageUrl(url) || /^\/(?:storage\/|api\/assets\/storage\/)/.test(url) ? url : undefined;
}

function designPlan(value: unknown): CoverDesignPlan | undefined {
  const plan = objectValue(value);
  if (!plan || PLAN_FIELDS.some((field) => typeof plan[field] !== 'string')
    || !Array.isArray(plan.titleLines) || !plan.titleLines.every((line) => typeof line === 'string')) return undefined;
  return {
    name: plan.name as string, rationale: plan.rationale as string,
    palette: plan.palette as string, composition: plan.composition as string,
    material: plan.material as string, typography: plan.typography as string,
    visualAnchor: plan.visualAnchor as string, generationDirection: plan.generationDirection as string,
    eyebrow: plan.eyebrow as string, supportLine: plan.supportLine as string,
    titleLines: plan.titleLines as string[],
  };
}

function snapshotItem(value: unknown, batchId: string): PosterBatchSnapshotItem | undefined {
  const item = objectValue(value);
  const id = stringValue(item?.id)?.trim();
  if (!item || !id) return undefined;
  const storedFormat = objectValue(item.format);
  const formatValue = storedFormat?.id ?? storedFormat?.importValue ?? item.format;
  const format = parseCoverFormat(formatValue);
  const sourceImageUrl = stringValue(item.sourceImageUrl)?.trim() || '';
  const originalTitle = typeof item.originalTitle === 'string' ? item.originalTitle : '';
  const productName = normalizeProductName(typeof item.productName === 'string' ? item.productName : '');
  const legacyFormatError = typeof item.error === 'string' && /^第三列版式「/.test(item.error) ? item.error : undefined;
  const importError = stringValue(item.importError) || legacyFormatError || (!format
    ? '历史版式无法识别，请修正文字方向后重新导入'
    : posterInputError({ sourceImageUrl, originalTitle, productName }));
  const status = STATUSES.has(item.status as PosterStatus) ? item.status as PosterStatus : 'idle';
  const expectedCacheKey = `headline_poster_result:${batchId}:${id}`;
  const storedCacheKey = stringValue(item.resultCacheKey);
  const cacheRevision = storedCacheKey?.startsWith(`${expectedCacheKey}:`) ? storedCacheKey.slice(expectedCacheKey.length + 1) : undefined;
  const resultCacheKey = storedCacheKey === expectedCacheKey || (cacheRevision && /^poster_[a-z0-9_-]+$/i.test(cacheRevision))
    ? storedCacheKey : undefined;
  const imageTaskId = stringValue(item.imageTaskId)?.trim();
  const imageSubmissionKey = stringValue(item.imageSubmissionKey)?.trim();
  const generatedSceneUrl = savedMediaUrl(item.generatedSceneUrl);
  const resultUrl = savedMediaUrl(item.resultUrl);
  const generationRecoveryRequired = item.generationRecoveryRequired === true
    || Boolean(imageSubmissionKey && !imageTaskId && !generatedSceneUrl && status !== 'complete')
    || status === 'complete' && !resultUrl && !resultCacheKey;
  return {
    id, sourceImageUrl, originalTitle,
    productName,
    format: format || COVER_FORMATS.portrait,
    coverTitle: typeof item.coverTitle === 'string' ? item.coverTitle : originalTitle,
    isTitleEdited: item.isTitleEdited === true,
    prompt: stringValue(item.prompt), promptVersion: stringValue(item.promptVersion),
    designPlan: designPlan(item.designPlan),
    resultUrl, resultCacheKey,
    persistedResultKey: resultCacheKey,
    imageTaskId, imageSubmissionKey, generatedSceneUrl, generationRecoveryRequired,
    status: importError && !(status === 'complete' && (resultUrl || resultCacheKey)) ? 'failed' : status,
    importError, error: importError || stringValue(item.error),
    modelFallbackNote: stringValue(item.modelFallbackNote),
  };
}

function normalizeRecord(value: unknown): PosterBatchRecord | undefined {
  const record = objectValue(value);
  const id = stringValue(record?.id)?.trim();
  if (!record || !id || !Array.isArray(record.items)) return undefined;
  const validTime = (time: unknown): time is number => typeof time === 'number' && Number.isFinite(time)
    && time >= 0 && time <= 8.64e15;
  if (!validTime(record.createdAt) || !validTime(record.updatedAt)) return undefined;
  const seen = new Set<string>();
  const items = record.items.flatMap((value) => {
    const item = snapshotItem(value, id);
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  });
  if (!items.length) return undefined;
  const settings = normalizePosterProductionSettings(record.settings);
  const savedRevision = stringValue(record.revision)?.trim();
  const revision = savedRevision && savedRevision.length <= 128 && /^poster_[a-z0-9_-]+$/i.test(savedRevision)
    ? savedRevision : undefined;
  return {
    id, createdAt: record.createdAt, updatedAt: record.updatedAt,
    revision,
    settings: {
      imageModel: settings.imageModel || 'gpt-image-2', titleModel: settings.titleModel || 'gemini-3.7-flash',
      titleHandling: settings.titleHandling || 'rewrite', imageQuality: settings.imageQuality || 'high',
      concurrency: settings.concurrency || 5,
    },
    items,
  };
}

function parseHistory(raw: string): PosterBatchRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('历史批次格式无效');
  const seen = new Set<string>();
  return parsed.flatMap((value) => {
    const record = normalizeRecord(value);
    return record ? [record] : [];
  }).sort((a, b) => b.updatedAt - a.updatedAt).filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function readHistory(scope: string): { records: PosterBatchRecord[]; readable: boolean } {
  try {
    const key = scopedHistoryKey(scope);
    const raw = window.localStorage.getItem(key);
    if (raw !== null) return { records: parseHistory(raw), readable: true };
    const legacy = window.localStorage.getItem(POSTER_BATCH_HISTORY_KEY);
    if (legacy === null) return { records: [], readable: true };
    const owner = window.localStorage.getItem(LEGACY_SCOPE_KEY);
    if (owner && owner !== scope) return { records: [], readable: true };
    const records = parseHistory(legacy);
    // Claim only once; a failed destination write can be retried by its owner.
    // Without this marker, a failed legacy removal could copy paid tasks into
    // another workspace that cannot resolve their original operation keys.
    if (!owner) window.localStorage.setItem(LEGACY_SCOPE_KEY, scope);
    window.localStorage.setItem(key, JSON.stringify(records));
    try { window.localStorage.removeItem(POSTER_BATCH_HISTORY_KEY); } catch { /* scoped copy and ownership are durable */ }
    return { records, readable: true };
  } catch {
    // Never treat unreadable history as an empty writable store.
    return { records: [], readable: false };
  }
}

export function loadPosterBatchHistory(scope: string): PosterBatchRecord[] {
  return retainedHistory(readHistory(scope).records);
}

function retainedHistory(records: PosterBatchRecord[]): PosterBatchRecord[] {
  const needsRecovery = (record: PosterBatchRecord) => record.items.some((item) => item.generationRecoveryRequired
    || item.status === 'rewriting' || item.status === 'prompting' || item.status === 'rendering');
  const protectedRecords = records.filter(needsRecovery);
  const recentRecords = records.filter((record) => !needsRecovery(record))
    .slice(0, Math.max(0, POSTER_BATCH_HISTORY_LIMIT - protectedRecords.length));
  // An older running page still needs its operation key. Storage pressure must
  // block the next submission rather than turn an unresolved paid job into a
  // fresh one merely because newer batches crossed the normal history limit.
  return [...protectedRecords, ...recentRecords].sort((a, b) => b.updatedAt - a.updatedAt);
}

function unreferencedResultKeys(previous: PosterBatchRecord[], next: PosterBatchRecord[]): string[] {
  const retained = new Set(next.flatMap((record) => record.items.flatMap((item) => item.resultCacheKey ? [item.resultCacheKey] : [])));
  return Array.from(new Set(previous.flatMap((record) => record.items.flatMap((item) => item.resultCacheKey && !retained.has(item.resultCacheKey) ? [item.resultCacheKey] : []))));
}

export function persistPosterBatchRecord(record: PosterBatchRecord, scope: string): PosterHistoryWriteResult {
  const existing = readHistory(scope);
  const saved = existing.records;
  const failure = { records: retainedHistory(saved), saved: false, removedResultCacheKeys: [] };
  if (!existing.readable) return failure;
  try {
    const normalized = normalizeRecord(record);
    if (!normalized) return failure;
    const current = saved.find((entry) => entry.id === normalized.id);
    if (current && current.createdAt === normalized.createdAt
      && JSON.stringify(current.settings) === JSON.stringify(normalized.settings)
      && JSON.stringify(current.items) === JSON.stringify(normalized.items)) {
      // Viewing/restoring a batch must not expire another page's revision.
      // Only content changes create a new saved snapshot.
      return { records: retainedHistory(saved), saved: true, removedResultCacheKeys: [] };
    }
    if (current && current.updatedAt > normalized.updatedAt) return failure;
    const next = retainedHistory([normalized, ...saved.filter((entry) => entry.id !== normalized.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt));
    window.localStorage.setItem(scopedHistoryKey(scope), JSON.stringify(next));
    return { records: next, saved: true, removedResultCacheKeys: unreferencedResultKeys(saved, next) };
  } catch {
    return failure;
  }
}

export function removePosterBatchRecord(id: string, scope: string): PosterHistoryWriteResult {
  const existing = readHistory(scope);
  const failure = { records: retainedHistory(existing.records), saved: false, removedResultCacheKeys: [] };
  if (!existing.readable) return failure;
  try {
    const next = retainedHistory(existing.records.filter((entry) => entry.id !== id));
    window.localStorage.setItem(scopedHistoryKey(scope), JSON.stringify(next));
    return { records: next, saved: true, removedResultCacheKeys: unreferencedResultKeys(existing.records, next) };
  } catch {
    return failure;
  }
}

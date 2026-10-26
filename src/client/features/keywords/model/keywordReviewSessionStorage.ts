import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { getApiBase } from '@client/shared/api/apiBase';
import type { KeywordReviewMode, KeywordReviewRow } from '@shared/contracts/generate';
import type { KeywordReviewRecord, ParsedKeywordWorkbook } from './keywordReviewWorkbookTypes';
import type { ReviewTokenUsage } from './reviewCost';
import { normalizeKeywordReviewSettings, type KeywordReviewSettings } from './keywordReviewSettings';
import type { ReviewSubmission } from './reviewSubmission';
import { createKeywordReviewSessionOwnership, KeywordReviewOwnershipError } from './keywordReviewSessionOwnership';
import { isValidReviewVerdict } from './keywordReviewVerdict';

export interface KeywordReviewSessionContext {
  rulesVersion: number | null;
  reviewAttempted: boolean;
  retryVersions: Array<[number, number]>;
  hasUnexportedResults: boolean;
  usageProvider: 'deepseek' | 'gateway';
  estimatedYuan: number;
  tokenUsage: ReviewTokenUsage;
  modelValue: string;
  settings: KeywordReviewSettings;
  submissions: ReviewSubmission[];
}

export interface KeywordReviewSession {
  id: string;
  parsed: ParsedKeywordWorkbook;
  records: KeywordReviewRecord[];
  context: KeywordReviewSessionContext;
  updatedAt: number;
}

export interface KeywordReviewSessionPatch {
  records?: KeywordReviewRecord[];
  context?: Partial<KeywordReviewSessionContext>;
}

export interface KeywordReviewSessionStorage {
  acquireOwnership(): Promise<void>;
  releaseOwnership(): Promise<void>;
  load(): Promise<KeywordReviewSession | null>;
  replace(session: Omit<KeywordReviewSession, 'id' | 'updatedAt'>): Promise<string>;
  update(id: string, patch: KeywordReviewSessionPatch): Promise<void>;
  clear(id?: string): Promise<void>;
}

type StorageCode = 'unavailable' | 'blocked' | 'timeout' | 'quota' | 'stale' | 'corrupt' | 'write';
export class KeywordReviewStorageError extends Error {
  constructor(message: string, readonly code: StorageCode) {
    super(message);
    this.name = 'KeywordReviewStorageError';
  }
}

interface StoredSource {
  id: string;
  parsed: Omit<ParsedKeywordWorkbook, 'records'>;
  records: KeywordReviewRecord[];
}
type StoredSession = Pick<KeywordReviewSession, 'id' | 'context' | 'updatedAt'>;
interface SessionDatabase extends DBSchema {
  sources: { key: string; value: StoredSource };
  sessions: { key: string; value: StoredSession };
  recordPatches: {
    key: [string, string];
    value: { scope: string; id: string; record: KeywordReviewRecord };
    indexes: { scope: string };
  };
}
type SessionTransaction<Mode extends 'readwrite' | 'readonly' = 'readwrite'> = IDBPTransaction<SessionDatabase, ['sources', 'sessions', 'recordPatches'], Mode>;
const DATABASE_NAME = 'beike-keyword-review-sessions';
const STORAGE_TIMEOUT_MS = 10_000;
const queues = new Map<string, Promise<unknown>>();

function storageError(error: unknown): KeywordReviewStorageError {
  if (error instanceof KeywordReviewStorageError) return error;
  if (error instanceof KeywordReviewOwnershipError) return new KeywordReviewStorageError(error.message, 'unavailable');
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') {
    return new KeywordReviewStorageError('浏览器本地空间不足，审核进度未能保存；请导出当前进度后再继续', 'quota');
  }
  return new KeywordReviewStorageError('审核进度无法保存到当前浏览器；请导出当前进度后再继续', 'write');
}

/** Only task state is stored. Credentials and arbitrary caller fields never enter the context. */
function copyContext(context: KeywordReviewSessionContext): KeywordReviewSessionContext {
  return {
    rulesVersion: context.rulesVersion,
    reviewAttempted: context.reviewAttempted,
    retryVersions: context.retryVersions.map(([index, version]) => [index, version]),
    hasUnexportedResults: context.hasUnexportedResults,
    usageProvider: context.usageProvider,
    estimatedYuan: context.estimatedYuan,
    tokenUsage: {
      cacheHit: context.tokenUsage.cacheHit,
      cacheMiss: context.tokenUsage.cacheMiss,
      completion: context.tokenUsage.completion,
    },
    modelValue: context.modelValue || '',
    settings: normalizeKeywordReviewSettings(context.settings),
    submissions: (context.submissions || []).map((submission) => ({
      idempotencyKey: submission.idempotencyKey, attemptId: submission.attemptId,
      dispatchedAt: submission.dispatchedAt, rows: structuredClone(submission.rows),
      model: submission.model, provider: submission.provider, baseUrl: submission.baseUrl,
      reviewMode: submission.reviewMode, rulesVersion: submission.rulesVersion,
      lookup: submission.lookup, lookupBudget: submission.lookupBudget,
    })),
  };
}

async function database(): Promise<IDBPDatabase<SessionDatabase>> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout>;
  return new Promise((resolve, reject) => {
    const fail = (error: KeywordReviewStorageError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    timer = setTimeout(() => fail(new KeywordReviewStorageError('浏览器本地存储响应超时，未提交新的审核请求', 'timeout')), STORAGE_TIMEOUT_MS);
    const opening = openDB<SessionDatabase>(DATABASE_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('sources');
        db.createObjectStore('sessions');
        db.createObjectStore('recordPatches').createIndex('scope', 'scope');
      },
      blocked() { fail(new KeywordReviewStorageError('审核本地存储被其他页面占用，请关闭旧页面后重试', 'blocked')); },
      blocking() { void opening.then((db) => db.close()); },
    });
    void opening.then((db) => {
      if (settled) { db.close(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    }, (error) => fail(storageError(error)));
  });
}

async function transact<Mode extends 'readwrite' | 'readonly', T>(mode: Mode, operation: (tx: SessionTransaction<Mode>) => Promise<T>): Promise<T> {
  const db = await database();
  let tx: SessionTransaction<Mode>;
  try { tx = db.transaction(['sources', 'sessions', 'recordPatches'], mode, { durability: 'strict' }); }
  catch (error) { db.close(); throw error; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const action = (async () => {
    try {
      const result = await operation(tx);
      await tx.done;
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* Already completed or aborted. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  })();
  try {
    return await Promise.race([action, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try { tx.abort(); } catch { /* Already completed or aborted. */ }
        reject(new KeywordReviewStorageError('保存审核进度超时，未提交新的审核请求；请导出当前进度后重试', 'timeout'));
      }, STORAGE_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
    db.close();
  }
}

async function removePatches(tx: SessionTransaction, scope: string): Promise<void> {
  // Compound keys are [scope, string row ID]; array keys sort after every string key.
  await tx.objectStore('recordPatches').delete(IDBKeyRange.bound([scope], [scope, []]));
}

function sameInput(left: KeywordReviewRow, right: KeywordReviewRow): boolean {
  return left.id === right.id && left.query === right.query && left.expansion === right.expansion
    && left.entityExpansion === right.entityExpansion && left.contentType === right.contentType;
}

function validCompletedRecord(record: KeywordReviewRecord, mode: KeywordReviewMode): boolean {
  return record.status === 'done' && isValidReviewVerdict(record, mode);
}

function restoreRecord(record: KeywordReviewRecord, uncertain: boolean, mode: KeywordReviewMode): KeywordReviewRecord {
  // A committed result remains usable even if an older journal entry was left behind.
  if (validCompletedRecord(record, mode)) {
    return record.error || record.submissionUncertain ? { ...record, error: undefined, submissionUncertain: false } : record;
  }
  uncertain ||= record.submissionUncertain === true;
  if (record.status === 'done' && !uncertain) {
    return { ...record, status: 'error', submissionUncertain: true, error: '已保存的审核结果不完整，已隔离以避免重复费用；请导出并核对后再决定是否重新审核' };
  }
  if (!uncertain) return record.status === 'running' ? { ...record, status: 'idle' } : record;
  return {
    ...record, status: 'error', submissionUncertain: true,
    error: record.error || '页面关闭时此批请求尚未确认结果，已隔离以避免重复费用；请核对后再决定是否重新审核',
  };
}

/** The original workbook is written once; subsequent atomic writes contain only changed rows. */
export async function createKeywordReviewSessionStorage(): Promise<KeywordReviewSessionStorage> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) {
    throw new KeywordReviewStorageError('当前浏览器不支持可靠的本地进度保存', 'unavailable');
  }
  const secret = getWorkspaceSecret();
  if (!secret) throw new KeywordReviewStorageError('无法识别当前工作区，本地进度保存不可用', 'unavailable');
  const apiOrigin = new URL(getApiBase() || '/api', window.location.href).origin;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`keyword-review:${apiOrigin}:${secret}`));
  const scope = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const ownership = createKeywordReviewSessionOwnership(scope);
  let releasing: Promise<void> | null = null;
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      ownership.assertHeld();
      if (releasing) throw new KeywordReviewOwnershipError('审核页面正在关闭，请稍后重试');
    } catch (error) { return Promise.reject(storageError(error)); }
    const result = (queues.get(scope) || Promise.resolve()).catch(() => {}).then(() => {
      ownership.assertHeld();
      return operation();
    }).catch((error) => { throw storageError(error); });
    const tail = result.then(() => undefined, () => undefined);
    queues.set(scope, tail);
    void tail.then(() => { if (queues.get(scope) === tail) queues.delete(scope); });
    return result;
  };
  return {
    acquireOwnership: async () => {
      if (releasing) await releasing;
      try { await ownership.acquire(); } catch (error) { throw storageError(error); }
    },
    releaseOwnership: () => {
      if (releasing) return releasing;
      releasing = (queues.get(scope) || Promise.resolve()).catch(() => {}).then(() => ownership.release())
        .finally(() => { releasing = null; });
      return releasing;
    },
    load: () => enqueue(() => transact('readonly', async (tx) => {
      const [source, session, patches] = await Promise.all([
        tx.objectStore('sources').get(scope), tx.objectStore('sessions').get(scope),
        tx.objectStore('recordPatches').index('scope').getAll(scope),
      ]);
      if (!source && !session) return null;
      if (!source || !session || source.id !== session.id || !Array.isArray(source.records)) {
        throw new KeywordReviewStorageError('本地审核进度不完整，请重新导入已导出的进度表', 'corrupt');
      }
      const changed = new Map(patches.filter((patch) => patch.id === session.id).map((patch) => [patch.record.id, patch.record]));
      const submissions = session.context.submissions;
      const submitted = new Map<string, KeywordReviewRow[]>();
      for (const submission of submissions || []) {
        if (submission.reviewMode !== source.parsed.mode) continue;
        for (const row of submission.rows) {
          const inputs = submitted.get(row.id) || [];
          inputs.push(row);
          submitted.set(row.id, inputs);
        }
      }
      const records = source.records.map((original) => {
        const record = changed.get(original.id) || original;
        const uncertain = submissions ? Boolean(submitted.get(record.id)?.some((row) => sameInput(row, record))) : record.status === 'running';
        return restoreRecord(record, uncertain, source.parsed.mode);
      });
      const interrupted = records.some((record) => record.submissionUncertain);
      return {
        ...session, parsed: { ...source.parsed, records }, records,
        context: { ...copyContext({ ...session.context, submissions: submissions || [] }), hasUnexportedResults: session.context.hasUnexportedResults || interrupted },
      };
    })),
    replace: (session) => {
      const id = crypto.randomUUID();
      const parsed = { ...session.parsed };
      Reflect.deleteProperty(parsed, 'records');
      const source = structuredClone({ id, parsed, records: session.records });
      const context = copyContext(session.context);
      return enqueue(() => transact('readwrite', async (tx) => {
        await removePatches(tx, scope);
        await tx.objectStore('sources').put(source, scope);
        await tx.objectStore('sessions').put({ id, context, updatedAt: Date.now() }, scope);
        return id;
      }));
    },
    update: (id, patch) => {
      const captured = structuredClone(patch);
      return enqueue(() => transact('readwrite', async (tx) => {
        const store = tx.objectStore('sessions');
        const session = await store.get(scope);
        if (!session || session.id !== id) throw new KeywordReviewStorageError('本地审核任务已经更换，旧任务未覆盖新进度', 'stale');
        const context = copyContext({ ...session.context, ...captured.context });
        await Promise.all([
          store.put({ ...session, context, updatedAt: Date.now() }, scope),
          ...(captured.records || []).map(async (record) => tx.objectStore('recordPatches').put({ scope, id, record }, [scope, record.id])),
        ]);
      }));
    },
    clear: (id) => enqueue(() => transact('readwrite', async (tx) => {
      const store = tx.objectStore('sessions');
      const session = await store.get(scope);
      if (id && session && session.id !== id) throw new KeywordReviewStorageError('本地审核任务已经更换，旧任务未清除新进度', 'stale');
      await removePatches(tx, scope);
      await store.delete(scope);
      await tx.objectStore('sources').delete(scope);
    })),
  };
}

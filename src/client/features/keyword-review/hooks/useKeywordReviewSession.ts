import { useCallback, useEffect, useRef, useState } from 'react';
import { createKeywordReviewSessionStorage, type KeywordReviewSession, type KeywordReviewSessionContext, type KeywordReviewSessionStorage } from '../model/keywordReviewSessionStorage';
import { DEFAULT_KEYWORD_REVIEW_SETTINGS } from '../model/keywordReviewSettings';
import type { KeywordReviewRecord, ParsedKeywordWorkbook } from '../model/keywordReviewWorkbookTypes';

function emptyContext(): KeywordReviewSessionContext {
  return {
    rulesVersion: null, reviewAttempted: false, retryVersions: [], hasUnexportedResults: false,
    usageProvider: 'deepseek', estimatedYuan: 0, tokenUsage: { cacheHit: 0, cacheMiss: 0, completion: 0 },
    modelValue: '', settings: { ...DEFAULT_KEYWORD_REVIEW_SETTINGS }, submissions: [],
  };
}
type TaskState = { parsed: ParsedKeywordWorkbook | null; records: KeywordReviewRecord[]; context: KeywordReviewSessionContext };

/** Own the live task and serialize its durable checkpoints before paid submissions. */
export function useKeywordReviewSession() {
  const [task, setTask] = useState<TaskState>(() => ({ parsed: null, records: [], context: emptyContext() }));
  const taskRef = useRef(task);
  const [recovery, setRecovery] = useState<KeywordReviewSession | null>(null);
  const recoveryRef = useRef<KeywordReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operationPending, setOperationPending] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const errorRef = useRef('');
  const readyRef = useRef(false);
  const pendingWrites = useRef(0);
  const operation = useRef(false);
  const dirtyRecords = useRef(new Map<string, KeywordReviewRecord>());
  const storageRef = useRef<KeywordReviewSessionStorage | null>(null);
  const storagePromise = useRef<Promise<KeywordReviewSessionStorage> | null>(null);
  const initializing = useRef<Promise<void> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const mounted = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publish = (next: TaskState) => { taskRef.current = next; if (mounted.current) setTask(next); };
  const setContext = (update: Partial<KeywordReviewSessionContext> | ((value: KeywordReviewSessionContext) => KeywordReviewSessionContext)) => {
    const current = taskRef.current;
    publish({ ...current, context: typeof update === 'function' ? update(current.context) : { ...current.context, ...update } });
  };
  const setRecords = (update: KeywordReviewRecord[] | ((value: KeywordReviewRecord[]) => KeywordReviewRecord[])) => {
    const current = taskRef.current;
    const records = typeof update === 'function' ? update(current.records) : update;
    records.forEach((record, index) => {
      if (record !== current.records[index]) dirtyRecords.current.set(record.id, record);
    });
    publish({ ...current, records });
  };
  const exclusive = async <T,>(action: () => Promise<T>): Promise<T> => {
    if (operation.current || pendingWrites.current) throw new Error('本机任务正在保存，请稍后重试');
    operation.current = true;
    if (mounted.current) setOperationPending(true);
    try { return await action(); } finally {
      operation.current = false;
      if (mounted.current) setOperationPending(false);
    }
  };
  const perform = async <T,>(action: () => Promise<T>): Promise<T> => {
    pendingWrites.current += 1;
    if (mounted.current) setSaving(true);
    try {
      const value = await action();
      if (mounted.current) setSavedAt(Date.now());
      return value;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '本机审核进度保存失败';
      errorRef.current = message;
      if (mounted.current) setError(message);
      throw cause;
    } finally {
      pendingWrites.current -= 1;
      if (mounted.current) setSaving(pendingWrites.current > 0);
    }
  };
  const getStorage = useCallback(async () => {
    if (!storagePromise.current) storagePromise.current = (async () => {
      const storage = await createKeywordReviewSessionStorage();
      await storage.acquireOwnership();
      storageRef.current = storage;
      return storage;
    })().catch((cause) => { storagePromise.current = null; throw cause; });
    return storagePromise.current;
  }, []);
  const readSession = useCallback(async () => {
    readyRef.current = false;
    if (mounted.current) setLoading(true);
    try {
      const storage = await getStorage();
      const saved = await storage.load();
      if (!mounted.current) return;
      recoveryRef.current = saved;
      setRecovery(saved);
      readyRef.current = true;
      errorRef.current = '';
      setError('');
    } catch (cause) {
      errorRef.current = cause instanceof Error ? cause.message : '无法读取本机审核进度';
      if (mounted.current) setError(errorRef.current);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [getStorage]);
  const initialize = useCallback(() => {
    if (!initializing.current) initializing.current = readSession().finally(() => { initializing.current = null; });
    return initializing.current;
  }, [readSession]);
  useEffect(() => {
    mounted.current = true;
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    void initialize();
    return () => {
      mounted.current = false;
      releaseTimer.current = setTimeout(() => {
        if (!mounted.current) void storagePromise.current?.then((storage) => storage.releaseOwnership()).catch(() => {});
      }, 0);
    };
  }, [initialize]);

  const canStart = () => mounted.current && readyRef.current && !recoveryRef.current && !errorRef.current && !operation.current && pendingWrites.current === 0;
  const replace = (parsed: ParsedKeywordWorkbook, overrides: Partial<KeywordReviewSessionContext> = {}) => exclusive(async () => {
    const storage = await getStorage();
    const next = { parsed, records: parsed.records, context: { ...emptyContext(), ...overrides } };
    const id = await perform(() => storage.replace(next));
    sessionIdRef.current = id;
    dirtyRecords.current.clear();
    publish(next);
    errorRef.current = ''; setError('');
  });
  const persist = async (changed: KeywordReviewRecord[] = []) => {
    const id = sessionIdRef.current;
    if (!id || !storageRef.current) throw new Error('本机任务尚未保存，未提交审核请求');
    const context = taskRef.current.context;
    changed.forEach((record) => dirtyRecords.current.set(record.id, record));
    const captured = [...dirtyRecords.current.values()];
    await perform(() => storageRef.current!.update(id, { records: captured, context }));
    // Any context checkpoint must include every result whose earlier write failed.
    // Keep newer concurrent edits dirty until their own checkpoint succeeds.
    captured.forEach((record) => {
      if (dirtyRecords.current.get(record.id) === record) dirtyRecords.current.delete(record.id);
    });
  };
  const restore = () => exclusive(async () => {
    const snapshot = recoveryRef.current;
    if (!snapshot) return;
    const storage = await getStorage();
    await perform(() => storage.update(snapshot.id, { context: snapshot.context }));
    sessionIdRef.current = snapshot.id;
    dirtyRecords.current.clear();
    publish({ parsed: snapshot.parsed, records: snapshot.records, context: snapshot.context });
    recoveryRef.current = null; setRecovery(null);
    errorRef.current = ''; setError('');
    return snapshot;
  });
  const discard = () => exclusive(async () => {
    const storage = await getStorage();
    await perform(() => storage.clear(recoveryRef.current?.id || sessionIdRef.current || undefined));
    sessionIdRef.current = null;
    dirtyRecords.current.clear();
    recoveryRef.current = null; setRecovery(null);
    publish({ parsed: null, records: [], context: emptyContext() });
    readyRef.current = true;
    setSavedAt(null);
    errorRef.current = ''; setError('');
  });
  const retrySave = async () => {
    if (pendingWrites.current) return;
    if (!taskRef.current.parsed) { await initialize(); return; }
    try { await exclusive(async () => {
      const storage = await getStorage();
      sessionIdRef.current = await perform(() => storage.replace({ ...taskRef.current, parsed: taskRef.current.parsed! }));
      dirtyRecords.current.clear();
      errorRef.current = ''; setError('');
    }); } catch { /* perform keeps the visible error and prevents new submissions. */ }
  };
  return { ...task, taskRef, setContext, setRecords, recovery, loading, saving: saving || operationPending, savedAt, error, errorRef,
    canClear: !task.parsed && Boolean(error) && Boolean(storageRef.current) && !recovery && !loading,
    canStart, replace, persist, restore, discard, retrySave, pendingWrites };
}

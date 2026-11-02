import { useCallback, useEffect, useRef, useState } from 'react';
import type { SalesScriptDomain, SalesScriptStatus } from '@shared/domain/sales';
import {
  analyzeReferenceVideo, deleteSalesScript, fetchScriptAnalysisPrompt, listSalesScripts, normalizePastedScript,
  patchSalesScript, saveSalesScript, uploadScriptVideo, type StoredSalesScript, type SalesScriptDraftResult,
} from '../api/salesScripts';

export interface SalesScriptVideoSource { videoUrl: string; videoHash: string; durationSec: number; aspectRatio: string; hasAudio: boolean; name: string }
export interface SalesScriptDraft { videoUrl?: string; depthVideoUrl?: string; depthTaskId?: string; depthOperationId?: string; id?: string; status: SalesScriptStatus; script: SalesScriptDomain; model: string; promptVersion: string; videoHash?: string; cached?: boolean }

type Busy = '' | 'upload' | 'analyze' | 'normalize' | 'save' | 'prompt';

export function useSalesScripts() {
  const [items, setItems] = useState<StoredSalesScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState<Busy>('');
  const [video, setVideo] = useState<SalesScriptVideoSource | null>(null);
  const [draft, setDraft] = useState<SalesScriptDraft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const uploadedFile = useRef<File | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const listAbort = useRef<AbortController | null>(null);
  const draftSession = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const hasUnsaved = Boolean(draft && JSON.stringify(draft.script) !== savedSnapshot);

  useEffect(() => {
    if (!hasUnsaved && busy !== 'save') return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [busy, hasUnsaved]);

  const invalidateList = useCallback(() => {
    listAbort.current?.abort(); listAbort.current = null; setLoading(false);
  }, []);
  const cancel = useCallback(() => {
    abortRef.current?.abort(); abortRef.current = null; setBusy('');
  }, []);

  const refresh = useCallback(async () => {
    listAbort.current?.abort();
    const controller = new AbortController(); listAbort.current = controller;
    setLoading(true); setListError('');
    try {
      const rows = await listSalesScripts(controller.signal);
      if (!controller.signal.aborted) { setItems(rows); setError(''); setListError(''); }
    } catch (err) { if (!controller.signal.aborted) { const message = err instanceof Error ? err.message : '读取参考脚本库失败'; setListError(message); setError(message); } }
    finally { if (listAbort.current === controller) { listAbort.current = null; setLoading(false); } }
  }, []);
  useEffect(() => { void refresh(); return () => { abortRef.current?.abort(); listAbort.current?.abort(); }; }, [refresh]);

  const run = useCallback(async <T,>(kind: Busy, task: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    if (abortRef.current) return null;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(kind);
    setError('');
    try {
      const result = await task(controller.signal);
      // Writes cannot be canceled: keep their receipt for the library even if the editor has changed.
      return kind !== 'save' && (controller.signal.aborted || abortRef.current !== controller) ? null : result;
    }
    catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '操作失败，请重试'); return null; }
    finally { if (abortRef.current === controller) { abortRef.current = null; setBusy(''); } }
  }, []);

  const uploadVideo = useCallback(async (file: File) => {
    const uploaded = await run('upload', (signal) => uploadScriptVideo(file, signal));
    if (uploaded) { uploadedFile.current = file; setVideo({ videoUrl: uploaded.videoUrl, videoHash: uploaded.videoHash, durationSec: uploaded.durationSec, aspectRatio: uploaded.aspectRatio, hasAudio: uploaded.hasAudio, name: file.name }); }
    return Boolean(uploaded);
  }, [run]);

  const acceptAnalysis = useCallback((result: SalesScriptDraftResult, videoUrl: string) => {
    // A retry can finish while another stored script is being edited.
    // Keep that editor intact; the new result remains accessible in the library.
    if (draftRef.current) { void refresh(); return; }
    draftSession.current += 1;
    setVideo(null);
    setSavedSnapshot(result.existingId ? JSON.stringify(result.script) : '');
    setDraft({ id: result.existingId, status: 'draft', script: result.script, model: result.model,
      promptVersion: result.promptVersion, videoHash: result.videoHash, cached: result.cached, videoUrl });
    void refresh();
  }, [refresh]);
  const acceptStored = useCallback((saved: StoredSalesScript) => {
    invalidateList();
    setItems((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
    setDraft((previous) => previous?.id === saved.id ? { ...previous, videoUrl: saved.videoUrl,
      depthVideoUrl: saved.depthVideoUrl, depthTaskId: saved.depthTaskId, depthOperationId: saved.depthOperationId } : previous);
  }, [invalidateList]);
  const analyze = useCallback(async (selection: string, force = false) => {
    if (!video) { setError('请先上传参考视频'); return; }
    const result = await run('analyze', (signal) => analyzeReferenceVideo(video.videoUrl, selection, signal, force));
    if (result) acceptAnalysis(result, video.videoUrl);
  }, [acceptAnalysis, run, video]);

  const normalize = useCallback(async (rawText: string, selection?: string) => {
    const result = await run('normalize', (signal) => normalizePastedScript(rawText, { videoUrl: video?.videoUrl, selection }, signal));
    if (result) {
      draftSession.current += 1;
      setVideo(null);
      setSavedSnapshot('');
      setDraft({ status: 'draft', script: result.script, model: result.model, promptVersion: result.promptVersion, videoHash: result.videoHash || video?.videoHash, videoUrl: video?.videoUrl, id: result.existingId });
    }
  }, [run, video]);

  const copyPrompt = useCallback(async () => {
    const result = await run('prompt', (signal) => fetchScriptAnalysisPrompt(signal));
    if (!result) return false;
    try { await navigator.clipboard.writeText(result.prompt); return true; }
    catch { setError('复制失败，请检查浏览器剪贴板权限'); return false; }
  }, [run]);

  const openStored = useCallback((item: StoredSalesScript) => {
    cancel(); draftSession.current += 1;
    setSavedSnapshot(JSON.stringify(item.script));
    setDraft({ id: item.id, status: item.status, script: item.script, model: item.model, promptVersion: item.promptVersion, videoHash: item.videoHash, videoUrl: item.videoUrl, depthVideoUrl: item.depthVideoUrl, depthTaskId: item.depthTaskId, depthOperationId: item.depthOperationId });
  }, [cancel]);

  const updateDraft = useCallback((script: SalesScriptDomain) => setDraft((previous) => previous ? { ...previous, script, status: 'draft' } : previous), []);

  const saveDraft = useCallback(async (status: SalesScriptStatus) => {
    if (!draft) return null;
    const session = draftSession.current;
    const saved = await run('save', () => draft.id
      ? patchSalesScript(draft.id, { status, script: draft.script })
      : saveSalesScript({ videoUrl: draft.videoUrl || '', videoHash: draft.videoHash || '', status, model: draft.model, promptVersion: draft.promptVersion, script: draft.script }));
    if (saved) {
      invalidateList();
      setItems((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      if (draftSession.current !== session) return null;
      setSavedSnapshot(JSON.stringify(draft.script));
      setDraft((previous) => previous ? { ...previous, id: saved.id, status: previous.script === draft.script ? saved.status : 'draft' } : previous);
      if (draftRef.current?.script !== draft.script) {
        setError('保存期间脚本有新修改，请再次保存或确认入库。');
        return null;
      }
    }
    return saved;
  }, [draft, invalidateList, run]);

  const archive = useCallback(async (id: string) => {
    try { const saved = await patchSalesScript(id, { status: 'archived' }); invalidateList(); setItems((previous) => previous.filter((item) => item.id !== saved.id)); return true; }
    catch (err) { setError(err instanceof Error ? err.message : '归档失败'); return false; }
  }, [invalidateList]);

  const remove = useCallback(async (id: string) => {
    try { await deleteSalesScript(id); invalidateList(); setItems((previous) => previous.filter((item) => item.id !== id)); return true; }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败'); return false; }
  }, [invalidateList]);

  const reclassify = useCallback(async (item: StoredSalesScript, categoryId: string, styleId: string) => {
    const nextScript: SalesScriptDomain = {
      ...item.script,
      taxonomy: { ...item.script.taxonomy, categoryId, styleId },
    };
    try {
      const saved = await patchSalesScript(item.id, { script: nextScript });
      invalidateList();
      setItems((previous) => previous.map((row) => row.id === saved.id ? saved : row));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新脚本分类失败');
      return false;
    }
  }, [invalidateList]);

  return { items, loading, listError, error, reportError: setError, clearError: () => setError(''), busy, cancel, video, clearVideo: () => setVideo(null),
    draft, hasUnsaved, acceptAnalysis, acceptStored, uploadedFile: uploadedFile.current, closeDraft: () => { cancel(); draftSession.current += 1; setDraft(null); setSavedSnapshot(''); }, refresh, uploadVideo, analyze, normalize, copyPrompt, openStored, updateDraft, saveDraft, archive, remove, reclassify };
}

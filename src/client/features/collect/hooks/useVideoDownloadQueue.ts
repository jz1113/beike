import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch } from '@client/shared/api/apiClient';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { parseVideoSheet, type VideoSheetItem } from '../model/collectorVideoSheet';

export type VideoDownloadStatus = 'pending' | 'running' | 'success' | 'failed';

export interface VideoDownloadItem extends VideoSheetItem {
  status: VideoDownloadStatus;
  error?: string;
}

interface VideoJobSnapshot {
  running?: boolean;
  items?: Array<{ filename: string; status: VideoDownloadStatus; error?: string }>;
}

const VIDEO_DOWNLOAD_LIMIT = 500;

type Toast = (message: string) => void;

export const VIDEO_CONCURRENCY_TIERS = [100] as const;

function clampConcurrency(value: number) {
  return value === 100 ? value : 100;
}

function folderLabel(directory: string) {
  const parts = directory.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || directory;
}

async function readApiBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`);
  return body;
}

export function useVideoDownloadQueue(showToast: Toast) {
  const [items, setItems] = useState<VideoDownloadItem[]>([]);
  const [concurrency, setConcurrencyState] = useState(100);
  const [running, setRunning] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [directory, setDirectory] = useState('');
  const itemsRef = useRef<VideoDownloadItem[]>([]);
  const directoryRef = useRef('');
  const jobRef = useRef('');
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const stopWaitRef = useRef<(() => void) | null>(null);

  const replaceItems = (next: VideoDownloadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  const applySnapshot = (snapshot: VideoJobSnapshot) => {
    const statuses = new Map((snapshot.items || []).map((item) => [item.filename, item]));
    replaceItems(itemsRef.current.map((item) => {
      const update = statuses.get(item.filename);
      return update ? { ...item, status: update.status, error: update.error || undefined } : item;
    }));
  };

  const importFile = async (file: File) => {
    if (runningRef.current) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }) : [];
      const parsed = parseVideoSheet(rows);
      if (parsed.error) {
        showToast(parsed.error);
        return;
      }
      const accepted = parsed.items.slice(0, VIDEO_DOWNLOAD_LIMIT).map((item) => ({ ...item, status: 'pending' as const }));
      replaceItems(accepted);
      const omitted = parsed.items.length - accepted.length;
      showToast(omitted > 0 ? `已识别 ${accepted.length} 条，超出部分未加入` : `已识别 ${accepted.length} 条视频`);
    } catch (error) {
      showToast(`表格读取失败: ${formatUserError(error)}`);
    }
  };

  const pickFolder = async () => {
    try {
      const response = await apiFetch('/api/system/video-downloads/pick-directory', { method: 'POST' });
      const body = await readApiBody<{ directory: string }>(response);
      directoryRef.current = body.directory;
      setDirectory(body.directory);
      setFolderName(folderLabel(body.directory));
      return true;
    } catch (error) {
      const message = formatUserError(error);
      if (message.includes('取消')) return false;
      showToast(message);
      return false;
    }
  };

  const waitForJob = async (jobId: string) => {
    for (;;) {
      const response = await apiFetch(`/api/system/video-downloads/${jobId}`);
      const snapshot = await readApiBody<VideoJobSnapshot>(response);
      applySnapshot(snapshot);
      if (!snapshot.running) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 700);
        stopWaitRef.current = () => { clearTimeout(timer); resolve(); };
      });
      stopWaitRef.current = null;
    }
  };

  const start = async (retryFailed = false) => {
    if (runningRef.current) return;
    const source = itemsRef.current;
    if (!source.length) {
      showToast('请先导入含标题和视频链接的表格');
      return;
    }
    if (!directoryRef.current && !await pickFolder()) return;
    const selected = source.filter((item) => item.status === 'pending' || (retryFailed && item.status === 'failed'));
    if (!selected.length) {
      showToast(retryFailed ? '没有失败项需要重试' : '没有待下载的视频');
      return;
    }
    const chosen = new Set(selected.map((item) => item.id));
    replaceItems(source.map((item) => (chosen.has(item.id) ? { ...item, status: 'pending', error: undefined } : item)));
    pausedRef.current = false;
    runningRef.current = true;
    setRunning(true);
    const workers = clampConcurrency(concurrency);
    showToast(`开始下载 ${selected.length} 个视频（${workers} 路并发）`);
    try {
      const response = await apiFetch('/api/system/video-downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: directoryRef.current,
          concurrency: workers,
          items: selected.map((item) => ({ filename: item.filename, url: item.url })),
        }),
      });
      const body = await readApiBody<{ jobId: string }>(response);
      jobRef.current = body.jobId;
      await waitForJob(body.jobId);
      if (!pausedRef.current) {
        const failed = itemsRef.current.filter((item) => item.status === 'failed').length;
        const success = itemsRef.current.filter((item) => item.status === 'success').length;
        showToast(failed ? `下载结束：成功 ${success}，失败 ${failed}` : `已下载 ${success} 个视频到「${folderLabel(directoryRef.current)}」`);
      }
    } catch (error) {
      if (!pausedRef.current) showToast(formatUserError(error));
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const pause = async () => {
    if (!runningRef.current) return;
    pausedRef.current = true;
    stopWaitRef.current?.();
    const jobId = jobRef.current;
    if (jobId) {
      try { await apiFetch(`/api/system/video-downloads/${jobId}/cancel`, { method: 'POST' }); } catch { /* 任务可能已经结束 */ }
    }
    showToast('已暂停，未完成的视频会回到待下载');
  };

  const clearItems = () => {
    if (runningRef.current) void pause();
    directoryRef.current = '';
    setDirectory('');
    setFolderName('');
    replaceItems([]);
  };

  return {
    items,
    concurrency,
    setConcurrency: (value: number) => setConcurrencyState(clampConcurrency(value)),
    running,
    folderName,
    directory,
    importFile,
    pickFolder,
    start,
    pause,
    clearItems,
    pendingCount: items.filter((item) => item.status === 'pending').length,
    successCount: items.filter((item) => item.status === 'success').length,
    failedCount: items.filter((item) => item.status === 'failed').length,
    runningCount: items.filter((item) => item.status === 'running').length,
  };
}

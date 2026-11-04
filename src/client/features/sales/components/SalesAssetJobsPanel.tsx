import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';
import { listSalesAssetJobs, submitSalesAssetJob } from '../api/salesAssetJobs';
import { salesGhostButtonClass } from './salesChrome';

const STATUS = { queued: '排队中', analyzing: '准备提示词中', creating: '生成主图中', generating: '生成视角中', cropping: '整理视角中', saving: '保存中', completed: '已保存到资产库', failed: '生成未完成' };

export function SalesAssetJobsPanel({ onSaved, kind, assetIds, onJobsLoaded }: {
  onSaved?: () => void;
  kind?: 'persona' | 'scene';
  assetIds?: ReadonlySet<string>;
  onJobsLoaded?: (jobs: SalesAssetViewJob[]) => void;
}) {
  const [jobs, setJobs] = useState<SalesAssetViewJob[]>([]);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState('');
  const [expanded, setExpanded] = useState(false);
  const statuses = useRef(new Map<string, string>());
  const refresh = useRef(onSaved); refresh.current = onSaved;
  const loaded = useRef(onJobsLoaded); loaded.current = onJobsLoaded;
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await listSalesAssetJobs(controller.signal);
        if (controller.signal.aborted) return;
        const completed = next.some((job) => job.status === 'completed' && statuses.current.get(job.id) !== 'completed');
        statuses.current = new Map(next.map((job) => [job.id, job.status]));
        setJobs(next); setError('');
        loaded.current?.(next);
        if (completed) { invalidateGlobalAssetCache(); refresh.current?.(); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '后台任务读取失败');
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 3000);
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);

  const retry = async (job: SalesAssetViewJob) => {
    if (retrying) return;
    setRetrying(job.id); setError('');
    try {
      await submitSalesAssetJob(job.kind, {
        key: job.key, assetId: job.assetId, model: job.model, references: [],
        ...(job.creation ? { creation: job.creation, analysisModel: job.creation.promptModel } : {}),
      }, {}, job.assetId);
      setRevision((value) => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : '恢复后台任务失败'); }
    finally { setRetrying(''); }
  };

  const currentJobs = jobs.filter((job) => job.status !== 'completed' && (!kind || job.kind === kind)
    && (!assetIds || job.status !== 'failed' || assetIds.has(job.assetId)));
  if (!currentJobs.length && !error) return null;
  const visible = expanded ? currentJobs : currentJobs.slice(0, 8);
  return <section className="mx-4 my-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-zinc-700" aria-label="资产生成任务">
    <strong>资产生成任务</strong>
    {visible.map((job) => <div key={job.id} className="flex flex-wrap items-center gap-2 py-1" role="status">
      {job.status !== 'failed' ? <Loader2 size={14} className="animate-spin" /> : null}
      <span>{job.name || `${job.kind === 'persona' ? '人物' : '场景'} ${job.assetId.slice(-6)}`} · {STATUS[job.status]}</span>
      {job.error && <span className="text-red-600">{job.error}</span>}
      {job.status === 'failed' && <button type="button" disabled={Boolean(retrying)} className={salesGhostButtonClass} onClick={() => void retry(job)}>
        <RefreshCw size={12} className={retrying === job.id ? 'animate-spin' : ''} />继续处理原任务
      </button>}
    </div>)}
    {currentJobs.length > 8 && <button type="button" className={salesGhostButtonClass} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起任务' : `查看全部 ${currentJobs.length} 项任务`}</button>}
    {error && <p role="alert" className="sales-material-error">{error}<button type="button" className={salesGhostButtonClass} onClick={() => setRevision((value) => value + 1)}>刷新任务</button></p>}
  </section>;
}

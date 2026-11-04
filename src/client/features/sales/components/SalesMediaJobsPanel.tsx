import { useEffect, useState } from 'react';
import { StudioTaskRecordsButton, type StudioTaskRecord } from '@client/shared/ui/studio/StudioTaskRecords';
import { fetchSalesMediaJob, updateSalesMediaJob, type SalesMediaJob } from '../api/salesMediaJobs';

export function SalesMediaJobsPanel() {
  return <StudioTaskRecordsButton domain="sales" detail={(row,refresh) => ['analysis','video','mix'].includes(row.kind)
    ? <SalesTaskDetail key={row.id} row={row} refresh={refresh} /> : null} />;
}

function SalesTaskDetail({ row, refresh }: { row: StudioTaskRecord; refresh: () => void }) {
  const [job, setJob] = useState<SalesMediaJob | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void fetchSalesMediaJob(row.id, abort.signal).then(value => { if (!abort.signal.aborted) { setJob(value); setError(''); } })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '读取详情失败'); });
    return () => abort.abort();
  }, [row.id,row.status]);
  const act = async (action: 'cancel' | 'retry') => {
    if (!job || pending) return;
    setPending(true); setError('');
    try { await updateSalesMediaJob(job,action); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setPending(false); }
  };
  return <>
    {error && <p role="alert" className="studio-records-error">{error}</p>}
    {job?.trace?.scriptId && <p>分镜 {job.trace.scriptId} · v{job.trace.scriptVersion}</p>}
    {job?.trace?.templateVersion && <p>视频模板 {job.trace.templateVersion}</p>}
    {job?.trace?.adaptVersion && <p>改编模板 {job.trace.adaptVersion}</p>}
    {job?.trace?.promptDigest && <p>提交提示词 SHA-256 {job.trace.promptDigest}</p>}
    {job?.trace?.references?.map((ref,index) => <p key={index}>素材 {index + 1} {ref}</p>)}
    {Boolean(job?.result?.existingId) && <p>已保存到动作素材 {String(job?.result?.existingId)}</p>}
    {job && (row.status === 'queued' || row.status === 'running') && <button disabled={pending} onClick={() => void act('cancel')}>{row.kind === 'video' ? '停止后续处理' : '取消任务'}</button>}
    {job && ['failed','canceled','partial'].includes(row.status) && <button disabled={pending} onClick={() => void act('retry')}>{row.kind === 'video' ? '继续原视频任务' : row.status === 'partial' ? '继续深度转换' : '重试本阶段'}</button>}
  </>;
}

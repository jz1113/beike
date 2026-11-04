import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ListChecks, RefreshCw, X } from 'lucide-react';
import { apiRequest } from '@client/shared/api/apiRequest';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import './studioTaskRecords.css';

export interface StudioTaskRecord {
  id: string; name: string; kind: string; status: string; createdAt: string; startedAt: string; finishedAt: string;
  model: string; externalId: string; group: string; error: string; stage: string; resultUrl: string;
}
interface Props {
  domain: 'sales' | 'workshop';
  detail?: (row: StudioTaskRecord, refresh: () => void) => ReactNode;
}
const kinds: Record<string,string> = { analysis: '参考视频分析', video: '视频生成', mix: '成片合成', persona: '人物资产', scene: '场景资产',
  image: '商品配图', collection: '商品采集', generation: '批量出图', copywriting: '发布文案', export: '导出' };
const states: Record<string,string> = { queued: '排队中', running: '进行中', completed: '成功', partial: '部分完成', failed: '失败', canceled: '已取消', uncertain: '待核对', paused: '已暂停' };
const emptyFilters = { q: '', status: '', kind: '', model: '', from: '', until: '' };
const rowKey = (row: StudioTaskRecord) => JSON.stringify([row.kind,row.group,row.id]);
const stamp = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';

export function StudioTaskRecordsButton(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="studio-records-trigger" onClick={() => setOpen(true)}><ListChecks size={15} />任务记录</button>
    {open && <TaskRecordsDialog {...props} onClose={() => setOpen(false)} />}
  </>;
}

function TaskRecordsDialog({ domain, detail, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [revision, setRevision] = useState(0);
  const detailRegion = useRef<HTMLElement>(null);
  const [copyNotice, setCopyNotice] = useState('');
  const [selectedId, select] = useState('');
  const [data, setData] = useState<{ records: StudioTaskRecord[]; total: number; page: number }>({ records: [], total: 0, page: 1 });
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState('');
  const refresh = () => setRevision(n => n + 1);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    async function fetchPage() {
      const newQuery = first;
      if (first) { setLoading(true); first = false; }
      try {
        const params = new URLSearchParams({ q: filters.q, status: filters.status, kind: filters.kind, model: filters.model, page: String(page), size: String(size) });
        for (const key of ['from','until'] as const) {
          if (!filters[key]) continue;
          const date = new Date(filters[key] + 'T00:00:00');
          if (key === 'until') date.setDate(date.getDate() + 1);
          params.set(key,date.toISOString());
        }
        const res = await apiRequest('GET', domain === 'sales' ? '/api/sales/task-records' : '/api/workshop/task-records', { signal: abort.signal, cache: 'no-store', search: params.toString() });
        const body = await res.json();
        if (!res.ok || !Array.isArray(body.records)) throw new Error(res.status === 404 ? '当前后台尚未加载任务记录接口，请重启贝壳服务。' : body.error || '读取任务记录失败');
        if (!abort.signal.aborted) { setData(body); setModels(Array.isArray(body.models) ? body.models : []); setPage(body.page); setError(''); }
      } catch (cause) {
        if (!abort.signal.aborted) {
          if (newQuery) setData({ records: [], total: 0, page: 1 });
          setError(cause instanceof Error ? cause.message : '读取任务记录失败');
        }
      }
      finally { if (!abort.signal.aborted) { setLoading(false); timer = setTimeout(fetchPage, 5000); } }
    }
    void fetchPage();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [domain, filters, page, size, revision]);
  const current = data.records.find(row => rowKey(row) === selectedId);
  useEffect(() => {
    setCopyNotice('');
    if (selectedId) detailRegion.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
  const copyId = async (id: string) => {
    try { await navigator.clipboard.writeText(id); setCopyNotice('任务 ID 已复制'); }
    catch { setCopyNotice('请选中完整任务 ID 复制'); }
  };
  const pageCount = Math.max(1, Math.ceil(data.total / size));
  const apply = (next: typeof emptyFilters) => { setPage(1); select(''); setFilters({...next}); };
  return <dialog ref={dialog} className="studio-records-dialog" aria-label="任务记录" onCancel={onClose}>
    <div className="studio-records-body">
      <header className="studio-records-head"><div><small>{domain === 'sales' ? '电商视频' : '电商图文'} / 当前工作区</small><h2>任务记录</h2></div>
        <div><button type="button" onClick={refresh} title="刷新任务记录"><RefreshCw size={15} />刷新</button><button type="button" onClick={onClose} aria-label="关闭任务记录"><X size={16} /></button></div>
      </header>
      <form className="studio-records-filters" onSubmit={event => { event.preventDefault(); apply(draft); }}>
        <label>提交日期<input type="date" aria-label="起始日期" value={draft.from} max={draft.until || undefined} onChange={e => setDraft({...draft,from:e.target.value})} /></label>
        <label>至<input type="date" aria-label="结束日期" value={draft.until} min={draft.from || undefined} onChange={e => setDraft({...draft,until:e.target.value})} /></label>
        <label>任务类型<select aria-label="任务类型" value={draft.kind} onChange={e => setDraft({...draft,kind:e.target.value})}><option value="">全部类型</option>
          {(domain === 'sales' ? ['analysis','video','mix','persona','scene'] : ['image','collection','analysis','generation','copywriting','export']).map(key => <option key={key} value={key}>{domain === 'workshop' && key === 'analysis' ? '配图分析' : kinds[key]}</option>)}</select></label>
        <label>模型 / 渠道<select aria-label="模型或渠道" value={draft.model} onChange={e => setDraft({...draft,model:e.target.value})}>
          <option value="">全部模型</option>{models.map(model => <option key={model}>{model}</option>)}</select></label>
        <label>状态<select aria-label="状态" value={draft.status} onChange={e => setDraft({...draft,status:e.target.value})}><option value="">全部状态</option>{Object.entries(states).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="studio-records-search">查找任务<input type="search" placeholder="任务 ID、名称、模型、批次或错误" value={draft.q} onChange={e => setDraft({...draft,q:e.target.value})} /></label>
        <button className="primary" type="submit">查询</button><button type="button" onClick={() => { setDraft(emptyFilters); apply(emptyFilters); }}>重置</button>
      </form>
      {error && <p role="alert" className="studio-records-error">{error}</p>}
      <div className="studio-records-table" aria-busy={loading}><table><thead><tr>
        {['任务 / ID','提交时间','结束时间','耗时','类型','模型 / 渠道','状态','阶段 / 进度','失败原因'].map(label => <th key={label}>{label}</th>)}
      </tr></thead><tbody>{!loading && data.records.map(row => {
        const seconds = row.startedAt || row.createdAt;
        const elapsed = row.finishedAt ? Date.parse(row.finishedAt) - Date.parse(seconds) : row.status === 'running' ? Date.now() - Date.parse(seconds) : NaN;
        return <tr key={rowKey(row)} className={rowKey(row) === selectedId ? 'is-current' : ''}>
          <td><button className="studio-record-link" title={row.id} aria-expanded={rowKey(row) === selectedId} onClick={() => select(rowKey(row) === selectedId ? '' : rowKey(row))}>
            <strong>{row.name || kinds[row.kind]}</strong><small>{row.id}</small></button></td>
          <td>{stamp(row.createdAt)}</td><td>{stamp(row.finishedAt)}</td><td>{Number.isFinite(elapsed) && elapsed >= 0 ? `${Math.round(elapsed/1000)} 秒` : '—'}</td>
          <td>{domain === 'workshop' && row.kind === 'analysis' ? '配图分析' : kinds[row.kind] || row.kind}</td><td title={row.model}>{row.model || '—'}</td>
          <td><span className="studio-record-state" data-state={row.status}>{states[row.status] || row.status}</span></td>
          <td title={row.stage}>{row.stage || (row.status === 'completed' ? '已结束' : row.status === 'queued' ? '等待执行' : '—')}</td><td title={row.error}>{row.error || '—'}</td>
        </tr>;
      })}</tbody></table>
      {(loading || (!data.records.length && !error)) && <p role="status">{loading ? '正在读取任务记录…' : '没有符合条件的任务记录'}</p>}</div>
      <footer className="studio-records-page"><span>共 {data.total} 条</span><button disabled={loading || page <= 1} onClick={() => { select(''); setPage(page-1); }}>上一页</button><span>{page} / {pageCount}</span><button disabled={loading || page >= pageCount} onClick={() => { select(''); setPage(page+1); }}>下一页</button>
        <select aria-label="每页条数" value={size} onChange={e => { select(''); setPage(1); setSize(Number(e.target.value)); }}>{[10,25,50].map(n => <option key={n} value={n}>{n} 条 / 页</option>)}</select></footer>
      {current && !loading && <section ref={detailRegion} className="studio-record-detail" aria-label="任务详情"><header><h3>{current.name || '任务详情'}</h3><button onClick={() => select('')}>收起详情</button></header>
        <p>任务 ID {current.id} <button onClick={() => void copyId(current.id)}>复制 ID</button> <span role="status">{copyNotice}</span></p>
        <p>提交 {stamp(current.createdAt)}  开始 {stamp(current.startedAt)}  结束 {stamp(current.finishedAt)}</p>{current.externalId && <p>上游任务 ID {current.externalId}</p>}{current.group && <p>批次 {current.group}</p>}
        {current.model && <p>模型 / 渠道 {current.model}</p>}{current.stage && <p>执行阶段 {current.stage}</p>}{current.error && <p className="studio-records-error">{current.error}</p>}
        {detail?.(current,refresh)}
        {current.resultUrl && (['video','mix'].includes(current.kind) ? <video key={current.id} controls preload="metadata" src={proxyMediaUrl(current.resultUrl,{asVideo:true})} /> : <img src={proxyMediaUrl(current.resultUrl)} alt="任务结果" />)}
        {current.resultUrl && <a href={proxyMediaUrl(current.resultUrl,{asVideo:['video','mix'].includes(current.kind)})} download>下载{['video','mix'].includes(current.kind) ? '视频' : '图片'}</a>}
      </section>}
    </div>
  </dialog>;
}

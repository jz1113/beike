import { PosterDialogFrame } from './PosterDialogFrame';
import { useEffect, useState } from 'react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import type { CoverTemplate } from '@shared/contracts/coverTemplates';
import { exportCoverTemplates, fetchCoverTemplate, fetchCoverTemplates, updateCoverTemplate } from '../api/coverTemplateApi';
import { safeBaseName } from '../model/posterTypes';

const button = 'rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-white/15';
const statusLabel = { adopted: '可使用', pending: '待启用', trashed: '已停用', running: '反推中', failed: '反推失败' };
interface Props { refreshKey: number; selectedId: string; onFeed: () => void; onUse: (id: string, title: string) => void; onAdvanced: () => void }
export function CoverTemplateLibrary({ refreshKey, selectedId, onFeed, onUse, onAdvanced }: Props) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [items, setItems] = useState<CoverTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CoverTemplate | null>(null);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void fetchCoverTemplates(search, status, offset, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setItems(data.templates); setTotal(data.total);
      if (offset >= data.total && offset > 0) setOffset(Math.max(0, Math.ceil(data.total / 24) - 1) * 24);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, status, offset, version, refreshKey]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); setPrompt(''); setTitle(selected.title); setDetailLoading(true); setError('');
    void fetchCoverTemplate(selected.id, controller.signal).then(data => { if (!controller.signal.aborted) { setPrompt(data.prompt); setLegacy(data.legacy); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取提示词失败'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected]);
  const mutate = async (item: CoverTemplate, patch: Parameters<typeof updateCoverTemplate>[1], use = false) => {
    if (busy) return; setBusy(true); setError('');
    try { await updateCoverTemplate(item.id, { ...patch, expectedUpdatedAt: item.updatedAt }); setVersion(value => value + 1); setNotice('模板已保存到模板库。'); if (use) onUse(item.id, patch.title || item.title); else setSelected(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setBusy(false); }
  };
  const backup = async () => {
    if (busy) return; setBusy(true); setError('');
    try { const data = await exportCoverTemplates(); await saveToDownloadDir('封面模板库备份.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); setNotice('模板库已导出：包括完整提示词、来源图片地址和原始拆解；图片文件仍需随素材目录一起备份。'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '备份失败'); }
    finally { setBusy(false); }
  };
  const exportPrompt = async () => {
    if (!selected || !prompt) return;
    try { await saveToDownloadDir(`${safeBaseName(title, selected.id)}.txt`, new Blob([prompt], { type: 'text/plain;charset=utf-8' })); setNotice('提示词已导出。'); }
    catch { setError('导出失败，请重试。'); }
  };
  return <section className="space-y-5 rounded-2xl bg-white/90 p-5 dark:bg-[#18191c]/95" aria-label="封面模板库">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-black">封面模板库</h1><p className="mt-2 text-sm text-slate-500">一张参考封面，一份独立模板。原图与提示词保存在数据库里，随时查看、修改和复用。</p></div><button type="button" className={button} onClick={onFeed}>＋ 上传参考封面，制作模板</button></header>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setOffset(0); }}><input aria-label="搜索模板" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、编号、配色或排版特点" className={`${button} min-w-64 flex-1 bg-transparent font-normal`} /><button className={button} type="submit">搜索</button><select aria-label="模板状态" className={`${button} bg-transparent`} value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="">全部状态</option>{Object.entries(statusLabel).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" className={button} onClick={() => setVersion(value => value + 1)}>刷新</button><button type="button" className={button} disabled={busy} onClick={() => void backup()}>备份模板库</button></form>
    <div className="flex justify-between text-sm text-slate-500"><span>{total} 份模板{search || status ? '（筛选结果）' : ''} · 每页 24 份</span><button type="button" onClick={onAdvanced}>旧记忆与全局纠正</button></div>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}{notice && <p role="status" className="text-sm text-slate-500">{notice}</p>}
    {loading ? <p role="status" className="py-12 text-center">正在读取模板…</p> : items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-white/20"><h2 className="font-bold">{search || status ? '没有匹配的模板' : '先投喂一张你喜欢的封面'}</h2><p className="mt-2 text-sm text-slate-500">反推完成后会保留原图和完整提示词。100 张就是 100 份，持续积累，不合并成一套风格。</p></div> : <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{items.map(item => <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10"><button type="button" onClick={() => { setSelected(item); setNotice(''); }} className="block w-full text-left" aria-label={`查看模板 ${item.title}`}><LazyProxyImage src={item.imageUrls[0] || ''} alt={item.title || '参考封面'} width={360} className="aspect-[3/4] w-full bg-slate-100 object-contain dark:bg-white/5" /><div className="p-3"><h3 className="truncate font-bold">{item.title || '未命名模板'}</h3><p className="mt-1 text-xs text-slate-500">{statusLabel[item.status]}{selectedId === item.id ? ' · 当前选用' : ''}</p><p className="mt-1 truncate text-[10px] text-slate-400" title={item.id}>{item.id}</p></div></button><div className="flex flex-wrap gap-2 px-3 pb-3"><button type="button" className={button} onClick={() => setSelected(item)}>查看提示词</button><button type="button" className={button} disabled={busy || ['failed','running'].includes(item.status)} onClick={() => void mutate(item, { status: 'adopted' }, true)}>选用模板</button></div>{item.error && <p className="px-3 pb-3 text-xs text-rose-500">{item.error}</p>}</article>)}</div>}
    <nav aria-label="模板库分页" className="flex items-center justify-center gap-4"><button type="button" className={button} disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 24))}>上一页</button><span className="text-sm">{Math.floor(offset / 24) + 1} / {Math.max(1, Math.ceil(total / 24))}</span><button type="button" className={button} disabled={loading || offset + 24 >= total} onClick={() => setOffset(value => value + 24)}>下一页</button></nav>
    {selected && <PosterDialogFrame backdropClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" label="模板详情" onClose={() => { if (!busy) setSelected(null); }} className="max-h-[90dvh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#18191c] dark:text-white"><header className="flex justify-between gap-3"><h2 className="font-bold">模板原图与绘图提示词</h2><button type="button" className={button} disabled={busy} onClick={() => setSelected(null)}>关闭详情</button></header>{error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-slate-500">{notice}</p>}<div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]"><LazyProxyImage src={selected.imageUrls[0] || ''} alt="模板原图" width={440} className="max-h-96 w-full object-contain" /><div className="space-y-3"><label className="block text-xs">模板名称<input value={title} maxLength={200} onChange={event => setTitle(event.target.value)} disabled={busy || detailLoading} className={`${button} mt-1 w-full bg-transparent`} /></label>{legacy && !detailLoading && <p className="text-xs text-amber-600">旧拆解整理稿：由已保存的设计特点整理，未重新调用模型。请检查后保存为完整模板。</p>}<label className="block text-xs">完整模板提示词<textarea rows={12} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy || detailLoading} maxLength={6000} className={`${button} mt-1 w-full bg-transparent font-normal`} /></label><p className="text-xs text-slate-500">{'{{商品图}}、{{封面标题}}、{{画幅比例}}、{{补充要求}}在生成时替换为你的素材和文案。选用后只需上传商品图。'}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || detailLoading || prompt.trim().length < 50 || !title.trim()} onClick={() => void mutate(selected, { title, prompt })}>保存修改</button><button type="button" className={button} disabled={busy || detailLoading || prompt.trim().length < 50 || !title.trim()} onClick={() => void mutate(selected, { title, prompt, status: 'adopted' }, true)}>保存并选用</button><button type="button" className={button} disabled={!prompt || detailLoading} onClick={() => { void navigator.clipboard.writeText(prompt).then(() => setNotice('提示词已复制。')).catch(() => setError('复制失败，请在文本框中全选复制。')); }}>复制提示词</button><button type="button" className={button} disabled={!prompt || detailLoading} onClick={() => void exportPrompt()}>导出 TXT</button><button type="button" className={button} disabled={busy || detailLoading || ['failed','running'].includes(selected.status)} onClick={() => void mutate(selected, { status: selected.status === 'trashed' ? 'pending' : 'trashed' })}>{selected.status === 'trashed' ? '恢复模板' : '停用模板'}</button></div></div></div></PosterDialogFrame>}
  </section>;
}

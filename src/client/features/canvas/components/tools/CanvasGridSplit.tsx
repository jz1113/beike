import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Grid2X2, X } from 'lucide-react';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';

export function CanvasGridSplit({ node, projectId }: { node: CanvasNode; projectId: string }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState(2), [cols, setCols] = useState(2);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const valid = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1 && rows <= 10 && cols <= 10 && rows * cols > 1 && rows * cols <= 100;
  const split = async () => {
    if (!valid || !node.imageUrl || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    let bitmap: ImageBitmap | undefined;
    try {
      const response = await apiFetch(proxyMediaUrl(node.imageUrl));
      if (!response.ok) throw new Error('原图加载失败，请重试');
      const blob = await response.blob();
      if (blob.size > 40 * 1024 * 1024) throw new Error('原图超过 40MB，请先缩小图片');
      bitmap = await createImageBitmap(blob);
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('原图超过 4000 万像素，请先缩小图片');
      if (bitmap.width < cols || bitmap.height < rows) throw new Error('图片尺寸小于切分行列数');
      const output: CanvasNode[] = [];
      const width = Math.min(240, node.width / cols), height = width * bitmap.height * cols / (bitmap.width * rows);
      const canvas = document.createElement('canvas');
      let totalBytes = 0;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const x = Math.floor(col * bitmap.width / cols), y = Math.floor(row * bitmap.height / rows);
        const w = Math.floor((col + 1) * bitmap.width / cols) - x, h = Math.floor((row + 1) * bitmap.height / rows) - y;
        canvas.width = w; canvas.height = h;
        const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法处理图片');
        context.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
        const imageUrl = canvas.toDataURL('image/png'); totalBytes += imageUrl.length;
        if (totalBytes > 60_000_000) throw new Error('切片数据过大，请先缩小原图');
        output.push({ id: `grid-${crypto.randomUUID()}`, type: 'image', title: `${node.title || '图片'} · ${row + 1}-${col + 1}`, imageUrl, resultWidth: w, resultHeight: h, width, height: width * h / w, x: node.x + node.width + 60 + col * (width + 24), y: node.y + row * (height + 40), createdAt: Date.now(), status: 'success' });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      useCanvasStore.setState(state => ({ projects: state.projects.map(project => project.id === projectId && project.nodes.some(item => item.id === node.id) ? { ...project, nodes: [...project.nodes, ...output], updatedAt: Date.now(), subtitle: '画布 · 刚刚修改' } : project) }));
      setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '切分失败，请重试'); }
    finally { bitmap?.close(); lock.current = false; setBusy(false); }
  };
  return <>
    <button type="button" aria-label="宫格切分" title="宫格切分" onClick={() => { setError(''); setOpen(true); }} className="flex h-8 items-center gap-1.5 rounded-full px-2 hover:bg-slate-100 dark:hover:bg-white/10"><Grid2X2 size={15} /><span>宫格切分</span></button>
    {open && createPortal(<div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); if (!busy) setOpen(false); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !busy) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="宫格切分" className="max-h-[calc(100dvh-32px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-700 shadow-xl dark:text-slate-200 dark:bg-[#18191c]" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">宫格切分</h2><button aria-label="关闭宫格切分" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></button></div>
        <div className="mb-4 flex flex-wrap gap-2">{[2, 3, 4, 5].map(size => <button autoFocus={size === 2} key={size} disabled={busy} aria-pressed={rows === size && cols === size} onClick={() => { setRows(size); setCols(size); }} className={`rounded-lg border px-3 py-2 text-xs ${rows === size && cols === size ? 'border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'border-slate-200 dark:border-white/10'}`}>{size * size}宫格 ({size}×{size})</button>)}</div>
        <div className="mb-4 flex items-center gap-3 text-sm"><span>自定义</span><label>行 <input aria-label="切分行数" type="number" min={1} max={10} disabled={busy} value={rows || ''} onChange={e => setRows(Number(e.target.value))} className="w-16 rounded-lg border border-slate-200 p-2 dark:border-white/10" /></label><label>列 <input aria-label="切分列数" type="number" min={1} max={10} disabled={busy} value={cols || ''} onChange={e => setCols(Number(e.target.value))} className="w-16 rounded-lg border border-slate-200 p-2 dark:border-white/10" /></label></div>
        <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-slate-200 dark:border-white/10"><img src={proxyMediaUrl(node.imageUrl)} alt="宫格切分预览" className="max-h-64 max-w-full object-contain" />{valid && <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>{Array.from({ length: rows * cols }, (_, index) => <div key={index} className="border border-white/80 outline outline-1 outline-black/20" />)}</div>}</div>
        <p className="mt-4 whitespace-normal text-xs leading-5 text-slate-500 dark:text-slate-400">按原图像素均匀切分，保留原图，在右侧创建独立图片节点。支持 1–10 行/列，最多 100 张，不调用 AI。</p>
        {error && <p role="alert" className="mt-2 whitespace-normal text-xs text-rose-600">{error}</p>}
        <button disabled={!valid || busy} onClick={() => void split()} className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">{busy ? '正在切分…' : `切分为 ${valid ? rows * cols : '—'} 张图片`}</button>
      </section>
    </div>, document.body)}
  </>;
}

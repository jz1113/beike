import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { drawProductFaces, loadProductFaceImage, saveProductFaceImage } from '../api/salesProductFaceImage';
import type { FaceRegion, ProductFaceEdit, ProductFaceEdits } from '../model/salesProductFaces';
import { salesGhostButtonClass } from './salesChrome';

export function SalesProductFaceDialog({ sources, edits, onApply, onClose }: {
  sources: { url: string; label: string }[]; edits: ProductFaceEdits;
  onApply: (url: string, edit: ProductFaceEdit) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [regions, setRegions] = useState<FaceRegion[]>([]);
  const [drag, setDrag] = useState<FaceRegion | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const task = useRef<AbortController | null>(null);
  const slot = sources[index];
  const saved = edits[slot.url];

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    task.current = controller;
    setImage(null); setRegions([]); setDrag(null); start.current = null;
    setMessage('正在读取商品图…');
    void (async () => {
      const original = await loadProductFaceImage(slot.url, controller.signal);
      let boxes = retry ? undefined : saved?.regions;
      let status = '';
      if (!boxes) {
        setMessage('正在本地检测人脸…');
        try {
          const { detectProductFaces } = await import('../api/salesFaceDetector');
          boxes = await detectProductFaces(original);
        } catch {
          boxes = [];
          status = '自动检测失败，请在图上手动框选人脸，或重试检测。';
        }
      }
      controller.signal.throwIfAborted();
      setMessage(status || (boxes.length ? '请核对打码范围。' : '未标出人脸，请检查是否需要手动补框。'));
      setRegions(boxes); setImage(original);
    })().catch(() => { if (!controller.signal.aborted) setMessage('商品图读取失败，请重试，或返回更换图片。'); });
    return () => controller.abort();
  }, [slot.url, saved, retry]);

  useEffect(() => {
    if (canvas.current && image) drawProductFaces(canvas.current, image, drag ? [...regions, drag] : regions);
  }, [drag, image, regions]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  };
  const selection = (event: PointerEvent<HTMLCanvasElement>) => {
    const a = start.current;
    if (!a) return null;
    const b = point(event);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  };
  const apply = async () => {
    if (!image || saving || !task.current) return;
    const signal = task.current.signal;
    setSaving(true);
    try {
      const edit = saved && JSON.stringify(saved.regions) === JSON.stringify(regions) ? saved
        : await saveProductFaceImage(slot.url, image, regions, signal);
      signal.throwIfAborted();
      onApply(slot.url, edit);
    } catch (error) { if (!signal.aborted) setMessage(error instanceof Error ? error.message : '打码副本保存失败，请重试。'); }
    finally { if (!signal.aborted) setSaving(false); }
  };
  return <dialog ref={dialog} className="sales-reference-dialog sales-face-editor" aria-label="商品图人脸打码" onCancel={onClose}>
    <header><strong>商品图人脸打码 · {index + 1}/{sources.length}</strong>
      <button type="button" onClick={onClose} className={salesGhostButtonClass}>取消</button></header>
    {sources.length > 1 && <label>调整商品图 <select value={index} disabled={saving} onChange={(event) => {
      setImage(null); setRetry(0); setIndex(Number(event.target.value));
    }}>{sources.map((source, i) => <option key={source.url} value={i}>{source.label}</option>)}</select></label>}
    <p>{slot.label} · 在图上拖动可补框。眼镜、耳饰等贴脸商品可清除框后重新框选。</p>
    {image && <canvas ref={canvas} aria-label="商品图打码预览，可拖动补框"
      style={{ display: 'block', maxWidth: '100%', maxHeight: '50vh', margin: 'auto', touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={(event) => { if (!saving && event.isPrimary && event.button === 0) { event.currentTarget.setPointerCapture(event.pointerId); start.current = point(event); } }}
      onPointerMove={(event) => { if (event.isPrimary && start.current) setDrag(selection(event)); }}
      onPointerCancel={() => { start.current = null; setDrag(null); }}
      onPointerUp={(event) => {
        if (!event.isPrimary) return;
        const box = selection(event); start.current = null; setDrag(null);
        if (box && box.width * image.naturalWidth >= 2 && box.height * image.naturalHeight >= 2) setRegions([...regions, box]);
      }} />}
    <p role="status">{message}</p>
    <div className="sales-delivery-actions">
      <button type="button" disabled={saving || !regions.length} className={salesGhostButtonClass} onClick={() => setRegions(regions.slice(0, -1))}>撤销一框</button>
      <button type="button" disabled={saving || !regions.length} className={salesGhostButtonClass} onClick={() => setRegions([])}>清除所有框</button>
      <button type="button" disabled={saving} className={salesGhostButtonClass} onClick={() => {
        setImage(null); setRetry(retry + 1);
      }}>重新检测</button>
      <button type="button" disabled={saving || !image} className={salesGhostButtonClass} onClick={() => void apply()}>
        {saving ? '正在保存…' : '应用到本次素材'}</button>
    </div>
  </dialog>;
}

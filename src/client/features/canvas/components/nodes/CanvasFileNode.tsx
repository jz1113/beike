import { useRef, useState } from 'react';
import { FileImage, Loader2 } from 'lucide-react';
import { persistCanvasMedia } from '../../model/canvasMediaImport';
import type { CanvasNode } from '../../model/types';

export function CanvasFileNode({ onUpload }: { onUpload: (media: Partial<CanvasNode>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const upload = async (files: FileList | File[]) => {
    if (busyRef.current || !files.length) return;
    if (files.length > 1) { setError('每个节点支持一个文件，请逐个上传'); return; }
    busyRef.current = true;
    setBusy(true); setError('');
    try {
      const media = await persistCanvasMedia(files[0], 0, 0);
      onUpload({ type: media.type, title: media.title, imageUrl: media.imageUrl, videoUrl: media.videoUrl, audioUrl: media.audioUrl, width: media.width, height: media.height, resultWidth: media.resultWidth, resultHeight: media.resultHeight, missingMedia: false });
    } catch (e) { setError(e instanceof Error ? e.message : '上传失败，请重试'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <div tabIndex={0} aria-label="文件上传节点" aria-busy={busy} onMouseDown={e => { if ((e.target as HTMLElement).closest('button, input')) e.stopPropagation(); e.currentTarget.focus(); }} onPaste={e => { if(e.clipboardData.files.length) { e.preventDefault(); e.stopPropagation(); void upload(e.clipboardData.files); } }} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); void upload(e.dataTransfer.files); }} className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl border bg-slate-100/90 dark:bg-white/5 text-slate-700 dark:text-slate-300 outline-none focus-visible:ring-1 focus-visible:ring-slate-500 ${dragging ? 'border-slate-500 dark:border-white/40 ring-2 ring-slate-300 dark:ring-white/20 bg-slate-200/70 dark:bg-white/10' : 'border-slate-200 dark:border-white/10'}`}>
    <div className="absolute -top-7 left-0 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><FileImage className="h-3.5 w-3.5" />文件</div>
    <input ref={input} type="file" accept="image/*,video/*,audio/*" className="hidden" aria-label="选择素材文件" onChange={e => { if(e.target.files) void upload(e.target.files); e.target.value=''; }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white/70 dark:bg-[#1B1B1E] px-4 py-2 text-xs text-slate-700 dark:text-slate-200 transition-colors hover:border-slate-400 dark:hover:border-white/40 hover:bg-white dark:hover:bg-[#2C2C32] focus-visible:outline-2 focus-visible:outline-slate-400 disabled:opacity-50">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{busy ? '正在上传…' : '选择文件'}</button>
    <div className="mt-3 text-center text-[11px] leading-5 text-slate-400 dark:text-slate-500"><p>{dragging ? '松开以上传文件' : '或拖放文件到此处'}</p><p>或 Ctrl+V / ⌘V 粘贴</p><p>支持音频、视频、图片素材</p></div>
    {error && <p role="alert" className="mt-3 max-w-[85%] text-center text-xs text-red-600 dark:text-rose-400">{error}</p>}
  </div>;
}

import { useRef, useState } from 'react';
import { FileImage, Loader2 } from 'lucide-react';
import { persistCanvasMedia } from '../canvasMediaImport';
import type { CanvasNode } from '../types';

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
      onUpload({ type: media.type, title: media.title, imageUrl: media.imageUrl, videoUrl: media.videoUrl, audioUrl: media.audioUrl, missingMedia: false });
    } catch (e) { setError(e instanceof Error ? e.message : '上传失败，请重试'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <div tabIndex={0} aria-label="文件上传节点" onMouseDown={e => { if ((e.target as HTMLElement).closest('button, input')) e.stopPropagation(); e.currentTarget.focus(); }} onKeyDown={e => e.stopPropagation()} onPaste={e => { if(e.clipboardData.files.length) { e.preventDefault(); e.stopPropagation(); void upload(e.clipboardData.files); } }} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); void upload(e.dataTransfer.files); }} className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-[20px] border bg-white text-slate-700 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${dragging ? 'border-indigo-400 ring-4 ring-indigo-50' : 'border-slate-200'}`}>
    <div className="absolute -top-7 left-0 flex items-center gap-1.5 text-xs text-slate-500"><FileImage className="h-3.5 w-3.5" />文件</div>
    <input ref={input} type="file" accept="image/*,video/*,audio/*" className="hidden" aria-label="选择素材文件" onChange={e => { if(e.target.files) void upload(e.target.files); e.target.value=''; }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700 hover:bg-indigo-50 disabled:opacity-50">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{busy ? '正在上传…' : '选择文件'}</button>
    <div className="mt-3 text-center text-[11px] leading-5 text-slate-500"><p>{dragging ? '松开以上传文件' : '或拖放文件到此处'}</p><p>或 Ctrl+V / ⌘V 粘贴</p><p>支持音频、视频、图片素材</p></div>
    {error && <p role="alert" className="mt-3 max-w-[85%] text-center text-xs text-red-600">{error}</p>}
  </div>;
}

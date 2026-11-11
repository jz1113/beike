import { useRef, useState, type ReactNode } from 'react';
import { FileSpreadsheet, Library, Loader2, Upload } from 'lucide-react';
import { canvasLibraryDragType, canvasLibraryMedia, openCanvasMediaLibrary } from '@client/shared/workspace/canvasWorkspace';
import { canvasMediaKind, canvasMediaUploadLimitMb, persistCanvasMedia } from '../../model/canvasNodeFactory';
import { appendCoverBatch, coverBatchSource, readCoverBatch, type CoverBatch } from '../../model/coverBatch';
import type { CanvasNode } from '../../model/types';
import { canvasWorkflowUploadAccept, canvasWorkflowUploadError, type canvasWorkflowUploadSlot } from '../../model/videoWorkflowRecovery';
import { useCanvasStore } from '../../store/useCanvasStore';

export function CanvasFileNode({ node, slot, selected, onUpload, projectId, coverBatch, tools, children }: {
  node: CanvasNode;
  projectId: string;
  slot: ReturnType<typeof canvasWorkflowUploadSlot>;
  selected: boolean;
  onUpload: (media: Partial<CanvasNode>) => void;
  coverBatch?: CoverBatch;
  tools?: ReactNode;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const excelInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const project = useCanvasStore(state => state.projects.find(item => item.id === projectId));
  const excel = project?.nativeCommerce?.kind === 'poster' && node.id === coverBatchSource(project.studioScene, projectId)?.id;
  const empty = (node.type === 'file' || (excel && node.missingMedia)) && !coverBatch;
  const showWorkbook = Boolean(coverBatch && (!node.imageUrl || node.missingMedia));
  const showUploadActions = empty || showWorkbook;
  const compactWorkbook = node.width < 112 || node.height < 112;
  const disabled = node.layerLocked || busy;
  const actionVisibility = empty || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';

  const upload = async (file?: File) => {
    if (!file || node.layerLocked || busyRef.current) return;
    if (excel && /\.xlsx?$/i.test(file.name)) {
      busyRef.current = true;
      setBusy(true);
      setError('');
      try {
        const rows = await readCoverBatch(file);
        const store = useCanvasStore.getState();
        const current = store.projects.find(item => item.id === projectId);
        const scene = current?.studioScene;
        if (!scene || !current?.nodes.some(item => item.id === node.id && !item.layerLocked)) return;
        const model = (scene.nodes.find(item => item.id === node.id.replace(/-product$/, '-image'))?.settings as Record<string, unknown>)?.model;
        store.syncStudioScene(projectId, appendCoverBatch(scene, node.id, file.name, rows, model));
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Excel 导入失败');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      return;
    }
    const kind = canvasMediaKind(file);
    const mismatch = canvasWorkflowUploadError(slot, kind);
    if (mismatch) { setError(mismatch); return; }
    if (!kind) { setError('仅支持图片、视频和音频文件'); return; }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const media = await persistCanvasMedia(file, 0, 0);
      const { resultWidth, resultHeight } = media;
      const scale = resultWidth && resultHeight ? 250 / Math.min(resultWidth, resultHeight) : undefined;
      onUpload({
        type: media.type,
        title: media.title,
        originalFileName: media.originalFileName,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
        audioUrl: media.audioUrl,
        resultWidth: media.resultWidth,
        resultHeight: media.resultHeight,
        missingMedia: media.missingMedia,
        width: slot?.kind === 'video' ? node.width : scale && resultWidth ? Math.round(resultWidth * scale) : 250,
        height: slot?.kind === 'video' ? node.height : scale && resultHeight ? Math.round(resultHeight * scale) : kind === 'audio' ? 86 : 250,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const receiveLibraryMedia = (raw: string) => {
    try {
      const media = canvasLibraryMedia(JSON.parse(raw));
      if (!media) throw new Error('素材链接无效');
      const mismatch = canvasWorkflowUploadError(slot, media.type);
      if (mismatch) { setError(mismatch); return; }
      onUpload({ ...media, width: 250, height: media.type === 'audio' ? 86 : 250, resultWidth: undefined, resultHeight: undefined });
      setError('');
    } catch { setError('素材链接无效'); }
  };

  return <div
    data-upload-node tabIndex={0} aria-label={slot?.label || '文件上传节点'} aria-busy={busy}
    onMouseDown={event => {
      if (!(event.target as HTMLElement).closest('button,input,video,audio')) event.currentTarget.focus({ preventScroll: true });
    }}
    onKeyDown={event => {
      if (!disabled && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') event.stopPropagation();
    }}
    onPaste={event => {
      const file = event.clipboardData.files[0];
      if (file) { event.preventDefault(); event.stopPropagation(); void upload(file); }
    }}
    onDragOver={event => {
      if (!event.dataTransfer.types.some(type => type === 'Files' || type === canvasLibraryDragType)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    }}
    onDrop={event => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled || busyRef.current) return;
      const media = event.dataTransfer.getData(canvasLibraryDragType);
      if (media) receiveLibraryMedia(media);
      else void upload(event.dataTransfer.files[0]);
    }}
    className={`relative w-full rounded-2xl outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 ${empty ? 'flex flex-col items-center justify-center bg-white dark:bg-[#1f1f1f]' : ''}`}
    style={empty ? { height: node.height } : undefined}
  >
    {(empty || showWorkbook) && <div className="absolute -top-6 left-0 flex max-w-full items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"><Upload size={14} className="shrink-0" /><span className="truncate">{slot?.label || '上传'}</span></div>}
    {showUploadActions && (
      <div className="absolute right-2 top-2 z-20 flex gap-1">
        {showWorkbook && <button type="button" disabled={disabled} aria-label="上传商品图" title="上传商品图"
          onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); input.current?.click(); }}
          className="flex h-7 items-center gap-1 rounded-lg bg-zinc-100 px-2 text-xs text-zinc-600 hover:bg-zinc-200 disabled:opacity-30 dark:bg-[#292929] dark:text-zinc-300 dark:hover:bg-[#333333]"><Upload size={14} />上传商品图</button>}
        <button type="button" disabled={disabled} aria-label="从素材库替换" title="从素材库替换"
          onMouseDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();openCanvasMediaLibrary(node.id);}}
          className={`grid size-7 place-items-center rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 focus-visible:opacity-100 disabled:opacity-30 dark:bg-[#292929] dark:text-zinc-300 dark:hover:bg-[#333333] ${actionVisibility}`}><Library size={14} /></button>
      </div>
    )}
    <input ref={input} type="file" accept={canvasWorkflowUploadAccept(slot)} className="hidden" aria-label="选择素材文件"
      onChange={event=>{void upload(event.target.files?.[0]);event.target.value='';}} />
    {empty ? <>
      <button type="button" disabled={disabled}
        onMouseDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();input.current?.click();}}
        className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border dark:border-zinc-500 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800/60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy ? '正在上传…' : excel ? '上传商品图' : '上传'}
      </button>
      <div className="mt-2 text-center text-[10px] text-zinc-500">或拖放文件到此处<br />或 Ctrl+V 粘贴</div>
      <div className="mt-1 text-center text-[9px] text-zinc-400 dark:text-zinc-500">{slot ? `支持${slot.kind === 'image' ? '图片' : '视频'}，上限 ${canvasMediaUploadLimitMb[slot.kind]} MB` : `图片 ${canvasMediaUploadLimitMb.image} MB · 视频 ${canvasMediaUploadLimitMb.video} MB · 音频 ${canvasMediaUploadLimitMb.audio} MB`}</div>
    </> : coverBatch && showWorkbook ? (
      <div style={{ height: node.height }}
        className="grid w-full place-items-center rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#1f1f1f]">
        <button type="button" disabled={disabled} aria-label={`更换 Excel：${coverBatch.name}，${coverBatch.ids.length} 条数据`}
          title={`更换 Excel · ${coverBatch.name}`}
          onMouseDown={event => event.stopPropagation()} onClick={event => {
            event.stopPropagation();
            excelInput.current?.click();
          }}
          className={`flex flex-col items-center rounded-xl px-3 text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/[0.06] ${compactWorkbook ? 'gap-1 py-1.5' : 'gap-2 py-2.5'}`}>
          <svg aria-hidden="true" viewBox="0 0 56 56" className={compactWorkbook ? 'size-10' : 'size-14'}>
            <rect x="1" y="1" width="54" height="54" rx="14" fill="#f6fbf7" />
            <rect x="18" y="9" width="29" height="37" rx="5" fill="#15804d" />
            <path d="M23 9h19a5 5 0 0 1 5 5v8H18v-8a5 5 0 0 1 5-5Z" fill="#74cf78" />
            <path d="M32 9v37M18 22h29M18 34h29" stroke="#fff" strokeOpacity=".23" />
            <rect x="8" y="24" width="23" height="21" rx="4" fill="#0d5d3c" />
            <path d="m16 30 7 9m0-9-7 9" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2.2" />
          </svg>
          <span className="whitespace-nowrap text-xs font-medium tabular-nums">{coverBatch.ids.length} 条数据</span>
        </button>
      </div>
    ) : children}
    {tools}
    {excel && <>
      <input ref={excelInput} type="file" accept=".xlsx,.xls" className="hidden" aria-label="选择 Excel 文件"
        onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
      {!showWorkbook && !node.activeUploadTool && <button type="button" disabled={disabled}
        aria-label={coverBatch ? `更换 Excel：${coverBatch.name}，${coverBatch.ids.length} 条数据` : '上传 Excel'}
        title={coverBatch?.name}
        onMouseDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); excelInput.current?.click(); }}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50 ${empty
          ? 'mt-2 border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/10'
          : 'absolute bottom-2 left-2 z-20 border-white/20 bg-black/75 text-white hover:bg-black'}`}>
        <FileSpreadsheet size={14} />
        {coverBatch ? `Excel · ${coverBatch.ids.length} 条` : '上传 Excel'}
      </button>}
    </>}
    {busy && !empty && <div role="status" className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center gap-2 rounded-2xl bg-zinc-100/85 text-xs text-zinc-700 ring-2 ring-zinc-400 dark:bg-black/65 dark:text-zinc-100 dark:ring-white/40">
      <Loader2 size={15} className="animate-spin" />
      正在上传…
    </div>}
    {error && <p role="alert" className="absolute inset-x-2 bottom-2 z-30 rounded-md bg-white/95 p-1 text-center text-xs text-red-600 dark:bg-[#1f1f1f] dark:text-rose-400">{error}</p>}
  </div>;
}

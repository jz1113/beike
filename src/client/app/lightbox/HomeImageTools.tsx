import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Upload, ImagePlus } from 'lucide-react';
import { useAppStore } from '@client/store';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { readFileAsDataUrl } from '@client/shared/api/mediaUpload';
import { currentBatchSettings } from '@client/shared/agent/dispatchGenerationBatch';
import { buildImageEditTask, type ImageEditRequest } from './imageEditTasks';
import { SmartEditModal } from '@client/shared/modals/lightbox/SmartEditModal';
import { MultiAngleModal } from './LightboxMultiAngleModal';
import { PromptReversePanel } from './PromptReversePanel';
import { ImageToolResults } from './ImageToolResults';

export type HomeImageTool = 'image-edit' | 'prompt-reverse' | 'product-angles';
const names = { 'image-edit': '图片编辑', 'prompt-reverse': '提示词反推', 'product-angles': '商品多角度' };
export default function HomeImageTools({ tool, onClose }: { tool: HomeImageTool; onClose: () => void }) {
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [editor, setEditor] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [resultIds, setResultIds] = useState<string[]>([]);
  const locked = useRef(false);
  const readingId = useRef(0);
  useEffect(() => () => { readingId.current++; }, []);
  useEffect(() => { if (!editor) locked.current = false; }, [editor]);
  const dialogRef = useModalDialog(true, editor ? () => setEditor(false) : onClose);
  const history = useAppStore(state => state.generationHistoryReady);
  const tasks = useAppStore(state => state.generationTasks);
  const recentImages = useMemo(() => tasks.filter(task => task.resultUrl && task.status === 'SUCCESS' && (!task.mediaType || task.mediaType === 'image' || task.mediaType === 'depth-image')).slice(0, 6), [tasks]);
  const submit = (request: Omit<ImageEditRequest, 'source'>) => {
    if (locked.current) return false;
    locked.current = true;
    try {
      const state = useAppStore.getState();
      if (!state.generationHistoryReady) throw new Error('生成历史仍在恢复，请稍后提交');
      const task = buildImageEditTask({ ...request, source: image }, currentBatchSettings());
      state.addGenerationTask(task, true);
      setResultIds(ids => [task.id, ...ids]);
      setEditor(false);
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交失败'); locked.current = false; return false;
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    const id = ++readingId.current;
    setError(''); setReading(true);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片');
      if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB');
      const data = await readFileAsDataUrl(file);
      const bitmap = await createImageBitmap(file); bitmap.close();
      if (id === readingId.current) { setImage(data); setName(file.name); }
    } catch (cause) { if (id === readingId.current) setError(cause instanceof Error ? cause.message : '图片读取失败'); }
    finally { if (id === readingId.current) setReading(false); }
  };
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={names[tool]} tabIndex={-1}
    className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-5">
    <div className="flex max-h-[96dvh] min-h-[75dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f8fa] text-slate-800 shadow-xl dark:border-white/10 dark:bg-[#141416] dark:text-stone-200">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1b1b1e]">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="关闭图片工具" onClick={onClose} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"><ArrowLeft className="h-4 w-4" />返回画布</button>
          <span aria-hidden="true" className="h-5 border-l border-slate-200 dark:border-white/15" /><h2 className="text-base font-semibold">{names[tool]}</h2>
        </div>
        <span className="hidden text-xs text-slate-500 sm:block">原图保留 · 独立生成 · 随时对比</span>
      </header>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 border-b border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1e] md:border-r md:border-b-0 md:p-5">
          <div><h3 className="text-sm font-semibold">参考图片</h3><p className="mt-1 text-xs leading-5 text-slate-500">上传一张图片，或从最近成图中选择。</p></div>
          <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}
            className="group flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 transition-colors focus-within:ring-2 focus-within:ring-sky-400 hover:border-slate-500 dark:border-white/20 dark:bg-black/10 dark:hover:border-white/40">
            {image ? <img src={image} alt="工具原图" className="max-h-56 w-full rounded-lg object-contain" /> : <ImagePlus className="h-9 w-9 text-slate-400" strokeWidth={1.3} />}
            <span className="flex items-center gap-2 text-sm"><Upload className="h-4 w-4" />{reading ? '正在读取…' : image ? '更换参考图' : '上传或拖入图片'}</span>
            <span className="text-xs text-slate-500">PNG / JPEG / WebP · 最多 10 MB</span>
            <input aria-label="上传工具参考图" type="file" accept="image/png,image/jpeg,image/webp" disabled={reading} className="sr-only"
              onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          {name && <p className="truncate text-xs text-slate-500" title={name}>{name}</p>}
          {recentImages.length > 0 && <div><h3 className="mb-2 text-xs text-slate-500">最近成图</h3><div className="grid grid-cols-3 gap-2" aria-label="选择最近成图">{recentImages.map(task =>
            <button key={task.id} type="button" aria-label={`选择图片：${task.title}`} className="aspect-square overflow-hidden rounded-lg border border-slate-200 dark:border-white/10"
              onClick={() => { readingId.current++; setReading(false); setImage(task.resultUrl!); setName(task.title); setError(''); }}>
              <img src={task.resultUrl} alt={task.title} className="h-full w-full object-cover" />
            </button>)}</div></div>}
          {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
          {tool !== 'prompt-reverse' && <>
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500 dark:bg-white/5">{tool === 'product-angles' ? '选择预设机位，或自定义方位角与俯仰角。不可见的商品结构属于生成推测，请核对一致性。' : '先选择参考图，再通过标点或框选说明修改位置。框选用于提示词定位，不是像素级遮罩。'}</div>
            <button type="button" disabled={!image || reading || !history} onClick={() => { setError(''); setEditor(true); }}
              className="min-h-11 w-full rounded-xl bg-slate-900 px-4 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">{!history ? '正在恢复生成历史…' : tool === 'image-edit' ? '打开图片编辑器' : '选择机位与角度'}</button>
          </>}
        </aside>
        <div className="min-w-0 p-4 md:p-6">
          {tool === 'prompt-reverse' ? <PromptReversePanel image={image} name={name} onClose={onClose} /> :
            <ImageToolResults tasks={tasks.filter(task => resultIds.includes(task.id) || task.taskType === (tool === 'image-edit' ? 'smart_edit' : 'multi_angle')).slice(0, 12)}
              onUseImage={(url, title) => { setImage(url); setName(title); setError(''); }} />}
        </div>
      </div>
    </div>
    {editor && image && (tool === 'image-edit' ? <SmartEditModal isOpen onClose={() => setEditor(false)} imageUrl={image}
      onSubmitSmartEdit={params => submit({ ...params, kind: 'smart_edit' })} /> : <MultiAngleModal isOpen onClose={() => setEditor(false)} imageUrl={image}
      onSubmitNovelView={params => submit({ ...params, kind: 'multi_angle' })} />)}
    {editor && error && <p role="alert" className="fixed bottom-4 left-1/2 z-[110] max-w-[90vw] -translate-x-1/2 rounded-lg bg-red-950 px-4 py-3 text-sm text-white">{error}</p>}
  </div>;
}

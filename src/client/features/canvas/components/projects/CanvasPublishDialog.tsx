import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { publishCanvasResult, readPublishedHomeItems, unpublishCanvasResult } from '@client/shared/home-publish/homePublish';
import { buildShowcaseNodes, canvasVideoChoices } from '../../model/canvasShowcase';
import { readCanvasAsset } from '../../store/canvasArchiveStorage';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { serializeCanvasProject } from '../../store/canvasProjectDefaults';
import type { CanvasProject } from '../../model/types';

export function CanvasPublishDialog({ project, onClose }: { project: CanvasProject; onClose: () => void }) {
  const existing = readPublishedHomeItems().find(item => item.publishedKind === 'canvas' && item.projectId === project.id);
  const choices = useMemo(() => canvasVideoChoices(project), [project]);
  const [selected, setSelected] = useState(existing?.selectedVideoKey && choices.some(choice => choice.key === existing.selectedVideoKey) ? existing.selectedVideoKey : '');
  const selectedVideo = choices.find(choice => choice.key === selected);
  const [title, setTitle] = useState(existing?.title || project.title);
  const [synopsis, setSynopsis] = useState(existing?.synopsis || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dialog = useModalDialog(true, () => { if (!lock.current) onClose(); });

  async function publish() {
    if (lock.current || !selected) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await saveCanvasProjects();
      const live = useCanvasStore.getState().projects.find(item => item.id === project.id);
      if (!live) throw new Error('画布项目不存在，请重新打开');
      const snapshot = structuredClone(serializeCanvasProject(live));
      const choice = canvasVideoChoices(snapshot).find(item => item.key === selected);
      if (!choice) throw new Error('所选视频已发生变化，请重新选择');
      const pending = new Map<string, Promise<string>>();
      const persist = (url: string) => {
        if (!/^(blob:|data:|local-asset:\/\/)/i.test(url)) return Promise.resolve(url);
        let task = pending.get(url);
        if (!task) {
          task = (async () => {
            const blob = url.startsWith('local-asset://') ? await readCanvasAsset(project.id, decodeURIComponent(url.slice(14))) : await fetchMediaBlob(url);
            if (!blob?.size || !/^(image|video)\//i.test(blob.type)) throw new Error('画布中有无法读取的图片或视频，请恢复素材后重试');
            const saved = await uploadStudioFile(new File([blob], `canvas-showcase-${crypto.randomUUID()}`, { type: blob.type }), 'canvas-showcase');
            if (/^(blob:|data:|local-asset:\/\/)/i.test(saved)) throw new Error('素材未保存为可持久访问的地址');
            return saved;
          })();
          pending.set(url, task);
        }
        return task;
      };
      const [video, nodes] = await Promise.all([persist(choice.url), buildShowcaseNodes(snapshot, persist)]);
      publishCanvasResult({ id: '', projectId: project.id, selectedVideoKey: selected, publishedKind: 'canvas',
        category: 'video', tag: '画布作品', title: title.trim() || snapshot.title, prompt: synopsis.trim(), synopsis: synopsis.trim(),
        image: video, video, aspectRatio: choice.aspectRatio, canvasNodes: nodes });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '同步失败，请重试'); }
    finally { lock.current = false; setBusy(false); }
  }

  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="同步画布作品" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#202023] dark:text-stone-100">
      <h2 className="text-lg font-semibold">{existing ? '更新画布作品' : '同步画布作品'}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-stone-400">选择一个视频作为成片，同时保存当前节点和连线的只读快照。画布后续修改不会自动改变展示，可再次同步更新。</p>
      <label className="mt-5 block text-sm font-medium">成片视频
        <select aria-label="成片视频" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy} className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-white/20 dark:bg-[#202023]">
          <option value="">请选择视频</option>{choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select>
      </label>
      {selectedVideo && !selectedVideo.key.endsWith(':current') && <p className="mt-2 text-xs leading-5 text-amber-600 dark:text-amber-300">历史视频会搭配当前画布的流程快照，节点内容可能与生成该版本时不同。</p>}
      {selectedVideo && !selectedVideo.url.startsWith('local-asset://') && <video key={selectedVideo.key} src={selectedVideo.url} controls playsInline aria-label="预览所选成片" className="mt-3 max-h-56 w-full rounded-lg bg-black object-contain" />}
      {!choices.length && <p className="mt-2 text-sm text-slate-500">画布中还没有可用的视频，请先生成或添加视频。</p>}
      <label className="mt-4 block text-sm font-medium">作品标题<input value={title} maxLength={80} disabled={busy} onChange={event => setTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-3 dark:border-white/20" /></label>
      <label className="mt-4 block text-sm font-medium">作品简介（可选）<textarea value={synopsis} maxLength={2000} disabled={busy} onChange={event => setSynopsis(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-3 dark:border-white/20" /></label>
      <p className="mt-3 text-xs leading-5 text-slate-500">作品仅保存在当前浏览器，使用原素材地址；请确认流程中不含不愿展示的内容。</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {existing && <button type="button" disabled={busy} onClick={() => { try { unpublishCanvasResult(project.id); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : '移除失败'); } }} className="mr-auto rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950">从作品流移除</button>}
        <button type="button" disabled={busy} onClick={onClose} className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-white/20">取消</button>
        <button type="button" disabled={busy || !selected} onClick={() => void publish()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">{busy ? '正在同步…' : existing ? '更新作品' : '同步到作品流'}</button>
      </div>
    </div>
  </div>, document.body);
}

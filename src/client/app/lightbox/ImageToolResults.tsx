import { useRef, useState } from 'react';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { useCanvasStore, saveCanvasProjects } from '@client/features/canvas/store/useCanvasStore';
import { useCanvasHydrated } from '@client/features/canvas/hooks/useCanvasHydrated';
import { downloadMedia } from '@client/shared/media/downloadMedia';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { imageToolProject } from './imageToolProject';

export function ImageToolResults({ tasks, onUseImage }: { tasks: GenerationTask[]; onUseImage: (url: string, name: string) => void }) {
  const [original, setOriginal] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const saved = useRef(new Map<string, string>());
  const lock = useRef(false);
  const ready = useCanvasHydrated();
  const act = async (task: GenerationTask, save: boolean) => {
    if (lock.current) return;
    lock.current = true; setBusy(task.id); setMessage(''); setError('');
    try {
      if (save) {
        const state = useCanvasStore.getState();
        const id = saved.current.get(task.id) || `canvas-proj-${crypto.randomUUID()}`;
        if (!state.projects.some(project => project.id === id)) {
          const project = imageToolProject(task, id, Date.now());
          useCanvasStore.setState({ projects: [project, ...state.projects] });
        }
        saved.current.set(task.id, id);
        await saveCanvasProjects();
        setMessage('已保存到画布最近项目，包含原图、结果和生成参数');
      } else {
        await downloadMedia(task.resultUrl!, `${task.title}.png`);
        setMessage('已发起图片下载');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试'); }
    finally { lock.current = false; setBusy(null); }
  };
  return <section aria-label="本次创作结果" className="space-y-4">
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">创作结果</h3><span className="text-xs text-slate-500">{tasks.length ? `${tasks.length} 次创作` : '结果会保留在生成历史'}</span></div>
    {!tasks.length && <div className="grid min-h-64 place-content-center rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-white/10">
      <p className="font-medium">让想法成为下一张作品</p><p className="mt-2 text-sm text-slate-500">选择原图，确认修改要求或机位，再开始生成。</p>
    </div>}
    {tasks.map(task => <article key={task.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      {task.status === 'SUCCESS' && task.resultUrl ? <>
        <div className="relative grid min-h-48 place-items-center bg-slate-100/70 p-3 dark:bg-black/20">
          <img src={original === task.id ? task.sourceImageUrl || task.referenceImageUrl : task.resultUrl} alt={original === task.id ? '编辑前原图' : task.title} className="max-h-[430px] w-full rounded-xl object-contain" />
          <button type="button" aria-pressed={original === task.id} disabled={!task.sourceImageUrl && !task.referenceImageUrl} onClick={() => setOriginal(original === task.id ? null : task.id)} className="absolute bottom-5 left-5 min-h-10 rounded-full bg-black/70 px-4 text-xs text-white">{original === task.id ? '查看生成结果' : '查看原图'}</button>
        </div>
        <div className="flex flex-wrap gap-2 p-3 text-xs">
          <button type="button" disabled={Boolean(busy)} onClick={() => void act(task, false)} className="min-h-10 rounded-lg border border-slate-200 px-3 disabled:opacity-40 dark:border-white/15">下载图片</button>
          <button type="button" disabled={!ready || Boolean(busy)} onClick={() => void act(task, true)} className="min-h-10 rounded-lg border border-slate-200 px-3 disabled:opacity-40 dark:border-white/15">{busy === task.id ? '正在处理…' : '保存到画布'}</button>
          <button type="button" onClick={() => onUseImage(task.resultUrl!, task.title)} className="min-h-10 rounded-lg border border-slate-200 px-3 dark:border-white/15">以此图继续编辑</button>
        </div>
      </> : task.status !== 'FAILURE' ? <div className="relative h-64"><AIGeneratingCard embedded task={task} showProgressBadge statusText={task.progress || '正在创作，请稍候'} /></div> : <div role="status" className="grid min-h-48 place-content-center gap-2 p-6 text-center">
        <p className="font-medium">{task.status === 'FAILURE' ? '本次创作未完成' : '正在创作，请稍候'}</p>
        <p className="text-sm text-slate-500">{task.status === 'FAILURE' ? task.failReason || '请检查模型与素材后再提交' : task.progress || '等待提交'}</p>
        {task.submissionRecoveryRequired && <p className="text-xs text-amber-700 dark:text-amber-300">提交结果待核对，请在生成历史查询原任务，勿重复提交。</p>}
      </div>}
      <details className="border-t border-slate-100 px-4 py-3 text-xs dark:border-white/5"><summary className="cursor-pointer">查看创作要求与参数</summary>
        <p className="mt-2 break-words whitespace-pre-wrap leading-6 text-slate-500">{task.prompt}</p><p className="mt-2 text-slate-500">{task.model} · {task.size} · {task.quality}</p>
      </details>
    </article>)}
    {message && <p role="status" className="text-sm text-sky-700 dark:text-sky-300">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
  </section>;
}

import { createPortal } from 'react-dom';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useCanvasHydrated } from '../../hooks/useCanvasHydrated';
import { useCanvasStore, saveCanvasProjects } from '../../store/useCanvasStore';
import { createStoryProject } from '../../model/storyProject';
import storyboardArt from '@client/assets/creative-tools/storyboard.jpg';

export function CanvasStorySetup({ onClose, onEnterCanvas }: { onClose: () => void; onEnterCanvas: () => void }) {
  const dialog = useModalDialog(true, onClose);
  const ready = useCanvasHydrated();
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [duration, setDuration] = useState(30);
  const [ratio, setRatio] = useState('9:16');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const projectId = useRef<string | null>(null);
  const lock = useRef(false);
  const create = async () => {
    if (lock.current || !ready) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const id = projectId.current || `canvas-proj-${crypto.randomUUID()}`;
      const state = useCanvasStore.getState();
      const project = createStoryProject({ title, brief, duration, ratio }, id, Date.now());
      useCanvasStore.setState({ projects: state.projects.some(item => item.id === id) ? state.projects.map(item => item.id === id ? project : item) : [project, ...state.projects] });
      projectId.current = id;
      await saveCanvasProjects();
      useCanvasStore.getState().selectProject(id);
      onClose(); onEnterCanvas();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败，请重试'); }
    finally { lock.current = false; setSaving(false); }
  };
  const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-transparent px-3 text-sm outline-none focus:border-sky-400 dark:border-white/15';
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="创建短片分镜" tabIndex={-1} className="fixed inset-0 z-[95] grid place-items-center bg-black/65 p-3 backdrop-blur-sm">
    <div className="max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl dark:border-white/10 dark:bg-[#1b1b1e] dark:text-stone-200">
      <button type="button" onClick={onClose} className="m-3 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-black/5 dark:hover:bg-white/5"><ArrowLeft className="h-4 w-4" />返回画布</button>
      <div className="grid gap-6 p-5 pt-0 md:grid-cols-[0.85fr_1.15fr] md:p-6 md:pt-0">
        <div><img src={storyboardArt} alt="短片分镜创作示意" className="aspect-[3/2] w-full rounded-xl object-cover" />
          <h2 className="mt-5 text-2xl font-semibold">从一个想法，开始一段故事</h2><p className="mt-3 text-sm leading-7 text-slate-500">填写创作要求，进入可编辑的分镜画布。先确认脚本，再按镜头制作关键帧和视频。</p>
          <p className="mt-4 text-xs leading-6 text-slate-500">创建项目不调用模型。进入画布后，选择已配置模型并逐节点运行；不会自动生成整片。</p>
        </div>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void create(); }}>
          <label className="block text-sm">项目名称<input value={title} onChange={event => setTitle(event.target.value)} maxLength={40} placeholder="例如：秋日新品 · 30 秒商品短片" className={inputClass} /></label>
          <label className="block text-sm">故事主题与创作要求<textarea required value={brief} onChange={event => setBrief(event.target.value)} maxLength={10000} rows={5} placeholder="描述受众、主题、角色、场景，以及已核实的商品信息。" className={inputClass + ' py-3 leading-6'} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">目标总时长<select aria-label="目标总时长" value={duration} onChange={event => setDuration(Number(event.target.value))} className={inputClass}>{[15, 30, 60].map(value => <option key={value} value={value}>{value} 秒</option>)}</select></label>
            <label className="text-sm">画幅<select aria-label="画幅" value={ratio} onChange={event => setRatio(event.target.value)} className={inputClass}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="1:1">1:1 方图</option></select></label>
          </div>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
          <button type="submit" disabled={!brief.trim() || !ready || saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">{saving ? '正在保存项目…' : '创建分镜画布'}<ArrowRight className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  </div>, document.body);
}

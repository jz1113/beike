import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useCanvasHydrated } from '../../hooks/useCanvasHydrated';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { createCanvasBriefProject } from '../../model/canvasBriefProject';

export default function CanvasHomeComposer({ onEnterCanvas }: { onEnterCanvas: () => void }) {
  const ready = useCanvasHydrated();
  const [brief, setBrief] = useState('');
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pendingId = useRef<string | null>(null);
  const lock = useRef(false);
  const expanded = focused || Boolean(brief);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${expanded ? Math.min(240, Math.max(88, element.scrollHeight)) : 28}px`;
  }, [brief, expanded]);
  async function create() {
    if (!brief.trim() || !ready || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const id = pendingId.current ?? `canvas-proj-${crypto.randomUUID()}`;
      const previous = useCanvasStore.getState().projects.find(project => project.id === id);
      const project = createCanvasBriefProject(brief, id, Date.now(), previous?.createdAt);
      pendingId.current = id;
      useCanvasStore.setState(state => ({ projects: previous ? state.projects.map(item => item.id === id ? project : item) : [project, ...state.projects] }));
      await saveCanvasProjects();
      pendingId.current = null; setBrief('');
      if (form.current && !form.current.closest('[inert]')) {
        useCanvasStore.getState().selectProject(id);
        onEnterCanvas();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <form ref={form} aria-label="首页画布输入" onSubmit={event => { event.preventDefault(); void create(); }}
    onFocusCapture={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="relative rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 shadow-2xs transition-colors focus-within:border-slate-300 dark:border-white/[0.08] dark:bg-[#1c1c1c]/90 dark:focus-within:border-white/20">
      <div className={`flex pr-12 ${expanded ? 'items-start' : 'min-h-[44px] items-center'}`}>
        <textarea ref={input} aria-label="画布创作想法" aria-describedby="canvas-home-composer-help" rows={1} maxLength={10000} value={brief}
          onChange={event => setBrief(event.target.value)} disabled={saving}
          onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void create(); } }}
          placeholder="输入创作想法或脚本，带入画布继续创作"
          className="max-h-60 min-h-6 min-w-0 flex-1 resize-none select-text bg-transparent py-0.5 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 dark:text-stone-100 dark:placeholder:text-stone-500" />
        <button type="submit" aria-label={saving ? '正在保存画布' : '带入画布'} title="带入画布 · Ctrl/Cmd + Enter" disabled={!brief.trim() || !ready || saving}
          className={`absolute right-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white transition-colors disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:disabled:bg-white/15 dark:disabled:text-white/30 ${expanded ? 'bottom-3' : 'top-1/2 -translate-y-1/2'}`}><ArrowUp className="h-5 w-5" /></button>
      </div>
      <p id="canvas-home-composer-help" className={expanded ? 'mt-4 pr-12 text-xs leading-5 text-slate-500 dark:text-stone-500' : 'sr-only'}>文本画布 · 保存后继续编辑<span className="hidden sm:inline"> · Ctrl/Cmd + Enter 提交</span><span className="sr-only sm:hidden">，Ctrl/Cmd + Enter 提交</span></p>
    </div>
    {error && <p role="alert" className="mt-2 px-4 text-sm text-red-600 dark:text-red-300">{error}</p>}
  </form>;
}

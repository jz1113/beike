import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasStoryboardView } from '../storyboard/CanvasStoryboardView';
import { useCanvasStore } from '../../store/useCanvasStore';
import { studioPreferenceKeys, studioPreferencePrefix } from '@client/shared/workspace/studioPreferences';
import { queueSettingsSection } from '@shared/domain/settings/settingsNavigationStorage';
import { useAppStore } from '@client/store';
import { isImageTaskFailed } from '@shared/domain/core/taskStatus';
import { studioChannels, submitStudioGeneration } from '../../model/studioGeneration';
import { canvasChatRequest, canvasSpeechRequest } from '../../model/studioChat';
import { downloadMedia } from '@client/shared/media/downloadMedia';
import { hasStudioContent } from '../../store/canvasProjectDefaults';
import { hasCanvasSaveFailure } from '../../store/canvasPersistence';
import { isStoryboardShot, studioStoryboardNodes } from '../../model/studioStoryboard';
import type { StudioScene } from '../../model/types';

const frameDocument = `<!doctype html><html lang="zh-CN" class="qdm-app-cursor"><head>
<title>贝壳云图 · 项目画布</title><base href="/canvas-studio/"><meta charset="utf-8"><link rel="stylesheet" href="assets/index-Cb5kGxol.css">
<style>
html,body,#root{width:100%;height:100%;margin:0;background:#121214;color:white}
@media(max-width:620px),(max-height:740px){
  [data-gen-prompt-panel-host]{position:fixed!important;left:max(8px,calc((100vw - 760px)/2))!important;right:8px!important;top:auto!important;bottom:52px!important;width:min(760px,calc(100vw - 16px))!important;max-width:calc(100vw - 16px)!important;max-height:55dvh!important;transform:none!important}
  [data-gen-prompt-panel-host]>div{width:100%!important;max-width:100%!important}
  [data-gen-prompt-panel-host] .gen-prompt-panel-enter{transform:none!important}
  [data-gen-prompt-panel-host] .qiaodoumayi-gen-toolbar{flex-wrap:wrap!important}
}
</style>
</head><body><div id="root">正在打开贝壳云图画布…</div><script src="host.js"></script></body></html>`;

export function StudioWorkspace({projectId, onHome}: {projectId: string; onHome: () => void}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const project = useCanvasStore(state => state.projects.find(p => p.id === projectId));
  const menu = useRef<HTMLDetailsElement>(null);
  const [storyboard, setStoryboard] = useState(false);
  const storyboardNodes = useMemo(() => studioStoryboardNodes(project?.studioScene), [project?.studioScene]);
  const [failed, setFailed] = useState(hasCanvasSaveFailure);
  useEffect(() => {
    const publishTasks = () => {
      const scene = useCanvasStore.getState().projects.find(item => item.id === projectId)?.studioScene;
      const state = useAppStore.getState();
      if (!scene || !state.generationHistoryReady) return;
      const tasks = [...state.generationTasks, ...state.sessions.flatMap(session => session.tasks)];
      for (const node of scene.nodes) {
        if (!node.beikeTaskId || !node.isGenerating) continue;
        const task = tasks.find(item => item.id === node.beikeTaskId);
        if (!task || (!task.resultUrl && !isImageTaskFailed(task.status))) continue;
        frame.current?.contentWindow?.postMessage({kind:'studio:result', taskId:task.id, url:task.resultUrl,
          error:task.resultUrl ? undefined : task.failReason || '生成失败，请在贝壳云图的「生成历史」查看详情。'},location.origin);
      }
    };
    const unsubscribe = useAppStore.subscribe(publishTasks);
    const updateModels = () => frame.current?.contentWindow?.postMessage({kind:'studio:models',channels:studioChannels()},location.origin);
    const storage = (ev: StorageEvent) => { if (!ev.key || /^(beike_(modality_|api_providers)|custom_models)/.test(ev.key)) updateModels(); };
    window.addEventListener('models_updated', updateModels);
    window.addEventListener('storage', storage);
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const store = useCanvasStore.getState();
      const current = store.projects.find(item => item.id === projectId);
      if (!current) return;
      if (event.data?.kind === 'studio:ready') {
        Object.assign(frame.current!.contentWindow!, {beikeCanvasChat:canvasChatRequest, beikeCanvasSpeech:canvasSpeechRequest, beikeCanvasDownload:downloadMedia});
        frame.current?.contentWindow?.postMessage({kind:'studio:init', projectId, scene:current.studioScene, channels:studioChannels(), preferenceKeys:Object.values(studioPreferenceKeys), preferencePrefix:studioPreferencePrefix}, location.origin);
      } else if (event.data?.kind === 'studio:generate' && event.data.projectId === projectId) {
        try {
          const settings = submitStudioGeneration(event.data.request);
          if (settings) frame.current?.contentWindow?.postMessage({kind:'studio:parameters',taskId:event.data.request.taskId,settings},location.origin);
        }
        catch (error) { frame.current?.contentWindow?.postMessage({kind:'studio:result',taskId:event.data.request.taskId,
          error:error instanceof Error ? error.message : '生成提交失败'},location.origin); }
      } else if (event.data?.kind === 'studio:save' && event.data.projectId === projectId) {
        const scene: StudioScene = event.data.scene;
        if (!Array.isArray(scene?.nodes) || !Array.isArray(scene.connections)) return;
        useCanvasStore.setState(state => ({projects:state.projects.map(item => item.id !== projectId ? item : {
          ...item, studioScene:scene, draft: item.draft && !hasStudioContent(scene),
          updatedAt:Date.now(),
        })}));
        publishTasks();
      }
    };
    const fail = () => setFailed(true);
    const success = () => setFailed(false);
    window.addEventListener('message', receive);
    window.addEventListener('canvas-save-error', fail);
    window.addEventListener('canvas-save-complete', success);
    return () => {
      unsubscribe();
      window.removeEventListener('models_updated', updateModels);
      window.removeEventListener('storage', storage);
      window.removeEventListener('message', receive);
      window.removeEventListener('canvas-save-error', fail);
      window.removeEventListener('canvas-save-complete', success);
    };
  }, [projectId]);
  useEffect(() => {
    const iframe = frame.current;
    let canvasDoc: Document | null = null;
    const closeMenu = () => { if (menu.current) menu.current.open = false; };
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && !event.composedPath().includes(menu.current)) closeMenu();
    };
    const attach = () => {
      canvasDoc?.removeEventListener('pointerdown', closeMenu, true);
      canvasDoc = iframe?.contentDocument ?? null;
      canvasDoc?.addEventListener('pointerdown', closeMenu, true);
    };
    attach();
    iframe?.addEventListener('load', attach);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      iframe?.removeEventListener('load', attach);
      canvasDoc?.removeEventListener('pointerdown', closeMenu, true);
    };
  }, [projectId]);
  const openPanel = (panel: 'chat') => {
    setStoryboard(false);
    frame.current?.contentWindow?.postMessage({kind:'studio:panel',panel},location.origin);
  };
  const openSettings = (section: 'profile' | 'canvas') => {
    queueSettingsSection(section);
    useAppStore.getState().navigateToSettings();
  };
  if (!project) return null;
  return <section className="relative flex h-full min-h-0 w-full flex-col bg-[#19191b]">
    <div className="absolute left-1/2 top-2 z-30 flex max-w-[52%] -translate-x-1/2 items-start gap-1 text-xs text-stone-200">
      <button type="button" aria-label="返回首页" onClick={onHome}
        className="shrink-0 rounded-full border border-white/10 bg-[#202023] px-3 py-1.5 hover:bg-[#303034]">
        ‹ 首页
      </button>
      <details ref={menu} className="relative min-w-0" onKeyDown={event => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        if (event.target instanceof HTMLInputElement) event.target.value = project.title;
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }}>
      <summary className="cursor-pointer truncate rounded-full border border-white/10 bg-[#202023] px-3 py-1.5" aria-label="项目菜单">
        {project.title}
      </summary>
      <div className="absolute left-1/2 mt-1 grid w-48 -translate-x-1/2 gap-2 rounded-xl border border-white/10 bg-[#202023] p-3 text-left shadow-lg"
        onClick={event => {if ((event.target as HTMLElement).closest('button') && menu.current) menu.current.open = false;}}>
        <input aria-label="项目名称" defaultValue={project.title} maxLength={40}
          className="min-w-0 rounded border border-white/10 bg-transparent px-2 py-1"
          onBlur={event => {const value=event.target.value.trim() || project.title; event.target.value=value;useCanvasStore.getState().updateProjectTitle(projectId,value);}}
          onKeyDown={event => {if (event.key==='Enter') event.currentTarget.blur();}}/>
        <button onClick={() => useCanvasStore.getState().selectProject(null)}>‹ 项目库</button>
        {!storyboard && storyboardNodes.some(isStoryboardShot) && <button onClick={() => setStoryboard(true)}>故事板</button>}
        <button onClick={() => openSettings('profile')}>创作档案</button>
        <button onClick={() => openSettings('canvas')}>画布设置</button>
        <button onClick={() => openPanel('chat')}>画布助手</button>
        <button onClick={() => useAppStore.getState().setIsAssistantOpen(true)}>贝壳云图 AI 助手</button>
      </div>
      </details>
    </div>
    {failed && <span role="alert" className="absolute bottom-2 left-1/2 z-30 bg-red-950 p-2 text-white">项目尚未保存，请勿关闭页面。</span>}
    <iframe ref={frame} title="贝壳云图项目画布" srcDoc={frameDocument}
      className={storyboard?'hidden':'min-h-0 w-full flex-1 border-0'} />
    {storyboard && <CanvasStoryboardView project={{...project, nodes:storyboardNodes}} onBackToCanvas={nodeId => {
      setStoryboard(false);
      if (nodeId) requestAnimationFrame(() => frame.current?.contentWindow?.postMessage({kind:'studio:focus',nodeId},location.origin));
    }} />}
  </section>;
}

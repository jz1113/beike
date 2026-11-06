import { createStudioScenePublisher } from '../../model/studioSceneSync';
import { StudioTasksDialog } from './StudioTasksDialog';
import { VideoPromptReviewDialog } from '../video/VideoPromptReviewDialog';
import { useVideoPromptReview } from '../../hooks/useVideoPromptReview';
import { optimizeStudioGeneration } from '../../model/studioPromptOptimization';
import { assertStudioPromptPreparation, studioPromptPreparationKey } from '../../model/studioPromptPreparation';
import { reviewVideoPrompt } from '../../model/videoPromptApproval';
import { findStudioTask, prepareStudioRetry, stopStudioTask } from '../../model/studioTaskActions';
import { StudioProjectMenu } from './StudioProjectMenu';
import { CanvasProjectActionsDialog } from './CanvasProjectActionsDialog';
import { CanvasArchiveDialog } from '../projects/CanvasArchiveDialog';
import { StudioConnectionsDialog } from './StudioConnectionsDialog';
import { changeStudioConnection } from '../../model/studioConnections';
import type { StudioTaskCommands } from '../../model/studioTaskState';
import { handleStudioEditingKey } from '../../model/studioEditingKeys';
import { StudioW3Run } from './StudioW3Run';
import { videoWorkflowKind } from '../../model/videoWorkflowRecovery';
import { recoverStudioTaskRecord } from '../../model/studioTaskState';
import { runW3Analysis, runW3Media } from '../../model/studioW3Commands';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasStoryboardView } from '../storyboard/CanvasStoryboardView';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { studioPreferenceKeys, studioPreferencePrefix } from '@client/shared/workspace/studioPreferences';
import { queueSettingsSection } from '@shared/domain/settings/settingsNavigationStorage';
import { useAppStore } from '@client/store';
import { isImageTaskFailed } from '@shared/domain/core/taskStatus';
import { studioChannels, prepareStudioGeneration, submitStudioGeneration, type StudioRequest } from '../../model/studioGeneration';
import { canvasChatRequest, canvasSpeechRequest } from '../../model/studioChat';
import { downloadMedia } from '@client/shared/media/downloadMedia';
import { hasStudioContent } from '../../store/canvasProjectDefaults';
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
  const [dialog, setDialog] = useState<'project' | 'backup' | 'connections' | 'tasks'>();
  const { review, requestReview } = useVideoPromptReview();
  const preparing = useRef(new Map<string, AbortController>());
  const getHost = () => (frame.current?.contentWindow as (Window & { beikeStudio?: {
    taskCommands: StudioTaskCommands;
    replaceConnections(scene: StudioScene): void;
    execute(nodeId: string): void;
  } }) | null)?.beikeStudio;
  const liveProject = () => {
    const current = useCanvasStore.getState().projects.find(item => item.id === projectId);
    if (!current) throw new Error('项目已关闭');
    return { ...current, studioScene: getHost()?.taskCommands.read() || current.studioScene };
  };
  const saveProject = async () => {
    const scene = liveProject().studioScene;
    if (scene) await saveScene(scene);
    else await saveCanvasProjects();
  };
  const saveScene = async (scene: StudioScene) => {
    if (!Array.isArray(scene?.nodes) || !Array.isArray(scene.connections)) throw new Error('画布尚未载入');
    useCanvasStore.setState(state => ({ projects: state.projects.map(item => item.id !== projectId ? item : {
      ...item, studioScene: scene, draft: item.draft && !hasStudioContent(scene), updatedAt: Date.now(),
    }) }));
    await saveCanvasProjects();
  };
  const saveRef = useRef(saveScene);
  saveRef.current = saveScene;
  useEffect(() => {
    const publishTasks = () => {
      const scene = useCanvasStore.getState().projects.find(item => item.id === projectId)?.studioScene;
      const state = useAppStore.getState();
      if (!scene || !state.generationHistoryReady) return;
      const tasks = [...state.generationTasks, ...state.sessions.flatMap(session => session.tasks)];
      for (const node of scene.nodes) {
        if (!node.beikeTaskId || !node.isGenerating) continue;
        const task = tasks.find(item => item.id === node.beikeTaskId);
        if (!task) {
          const recovered = recoverStudioTaskRecord(node);
          if (recovered && !submittedHere.has(recovered.id)) state.addGenerationTask(recovered);
          continue;
        }
        if (!task.resultUrl && !isImageTaskFailed(task.status)) continue;
        frame.current?.contentWindow?.postMessage({kind:'studio:result', taskId:task.id, url:task.resultUrl,
          error:task.resultUrl ? undefined : task.failReason || '生成失败，请在贝壳云图的「生成历史」查看详情。'},location.origin);
      }
    };
    const submittedHere = new Set<string>();
    const pending = preparing.current;
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
        const durableSave = (scene: StudioScene) => saveRef.current(scene);
        const saveIntent = async (scene: StudioScene) => {
          for (const node of scene.nodes) if (node.isGenerating && typeof node.beikeTaskId === 'string') submittedHere.add(node.beikeTaskId);
          await durableSave(scene);
        };
        Object.assign(frame.current!.contentWindow!, {beikeCanvasChat:canvasChatRequest, beikeCanvasSpeech:canvasSpeechRequest, beikeCanvasDownload:downloadMedia, beikeCanvasEditingKey:handleStudioEditingKey,
          beikeCanvasSave: durableSave, beikeCanvasCreateScenePublisher: createStudioScenePublisher, beikeCanvasRunW3Analysis: runW3Analysis,
          beikeCanvasRunW3Media: (commands: Parameters<typeof runW3Media>[0], nodeId: string, readMedia: Parameters<typeof runW3Media>[2]) => runW3Media(commands, nodeId, readMedia, saveIntent),
        });
        frame.current?.contentWindow?.postMessage({kind:'studio:init', projectId, scene:current.studioScene, channels:studioChannels(), preferenceKeys:Object.values(studioPreferenceKeys), preferencePrefix:studioPreferencePrefix}, location.origin);
      } else if (event.data?.kind === 'studio:generate' && event.data.projectId === projectId) {
        const request: StudioRequest = event.data.request;
        const reply = (kind: string, fields: Record<string, unknown>) =>
          frame.current?.contentWindow?.postMessage({ kind, taskId: request.taskId, ...fields }, location.origin);
        if (request.optimizePrompt !== true) {
          try {
            const settings = submitStudioGeneration(request);
            if (settings) reply('studio:parameters', { settings });
          } catch (error) {
            reply('studio:result', { error: error instanceof Error ? error.message : '生成提交失败' });
          }
          return;
        }
        if (preparing.current.has(request.taskId)) return;
        const controller = new AbortController();
        const pending = preparing.current;
        pending.set(request.taskId, controller);
        void (async () => {
          const commands = getHost()?.taskCommands;
          const nodeId = String(event.data.nodeId || '');
          if (!commands) throw new Error('画布尚未载入');
          const inputKey = studioPromptPreparationKey(commands.read(), nodeId);
          const prepared = prepareStudioGeneration(request);
          if (!prepared) throw new Error('该任务已提交，请查看原任务');
          const optimized = await optimizeStudioGeneration(prepared, request, controller.signal);
          const optimization = 'optimization' in optimized ? optimized.optimization : undefined;
          const approved = optimization && await reviewVideoPrompt(optimization, controller.signal, requestReview);
          if (optimization && !approved) throw new Error('已取消提示词确认，视频未提交');
          assertStudioPromptPreparation(commands.read(), nodeId, request.taskId, inputKey);
          const task = { ...optimized.task, canvasProjectId: projectId, prompt: approved?.submitted || optimized.task.prompt };
          commands.update(nodeId, task.id, { beikeTaskRecord: task, beikePromptOptimization: approved });
          submittedHere.add(task.id);
          await saveRef.current(commands.read());
          controller.signal.throwIfAborted();
          assertStudioPromptPreparation(commands.read(), nodeId, request.taskId, inputKey);
          useAppStore.getState().addGenerationTask(task);
          if (optimized.settings) reply('studio:parameters', { settings: optimized.settings });
        })().catch(error => {
          reply('studio:result', { error: error instanceof Error ? error.message : '视频未提交' });
        }).finally(() => pending.delete(request.taskId));
      } else if (event.data?.kind === 'studio:view' && event.data.projectId === projectId) {
        const view = event.data.view;
        if (!view || ![view.x, view.y, view.zoom].every(Number.isFinite)) return;
        useCanvasStore.setState(state => ({ projects: state.projects.map(item => item.id === projectId && item.studioScene
          ? { ...item, studioScene: { ...item.studioScene, view } } : item) }));
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
    window.addEventListener('message', receive);
    return () => {
      unsubscribe();
      for (const controller of pending.values()) controller.abort();
      window.removeEventListener('models_updated', updateModels);
      window.removeEventListener('storage', storage);
      window.removeEventListener('message', receive);
    };
  }, [projectId, requestReview]);
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
        <button onClick={() => setDialog('project')}>管理项目</button>
        <button onClick={() => setDialog('backup')}>导出项目备份</button>
        <button onClick={() => { if (getHost()?.taskCommands.read()) setDialog('connections'); }}>连线与参考</button>
        <button onClick={() => { if (getHost()?.taskCommands.read()) setDialog('tasks'); }}>生成任务</button>
        <button onClick={() => openPanel('chat')}>画布助手</button>
        <button onClick={() => useAppStore.getState().setIsAssistantOpen(true)}>贝壳云图 AI 助手</button>
      </div>
      </details>
    </div>
    <StudioProjectMenu />
    {dialog === 'project' && <CanvasProjectActionsDialog project={project} onHome={onHome} onClose={() => setDialog(undefined)} onSave={saveProject} />}
    {dialog === 'backup' && <CanvasArchiveDialog mode="export" snapshot={liveProject} onClose={() => setDialog(undefined)} onRestored={() => {}} />}
    {dialog === 'connections' && <StudioConnectionsDialog onSave={saveScene} onClose={() => setDialog(undefined)} commands={{
      read: () => getHost()!.taskCommands.read(),
      apply: change => {
        const host = getHost();
        if (!host) throw new Error('画布尚未载入');
        const scene = changeStudioConnection(host.taskCommands.read(), change);
        host.replaceConnections(scene);
        return scene;
      },
    }} />}
    {dialog === 'tasks' && getHost() && <StudioTasksDialog commands={getHost()!.taskCommands}
      onClose={() => setDialog(undefined)} onSave={saveProject}
      onRun={nodeId => getHost()?.execute(nodeId)}
      onStop={async (nodeId, taskId) => {
        preparing.current.get(taskId)?.abort();
        stopStudioTask(taskId);
        getHost()?.taskCommands.stop(nodeId, taskId);
        await saveProject();
      }}
      onResume={async (nodeId, taskId) => {
        const task = findStudioTask(taskId);
        if (!task) throw new Error('找不到原任务');
        getHost()?.taskCommands.update(nodeId, taskId, { beikeTaskId: taskId, isGenerating: true, beikeTaskStopped: false });
        await saveProject();
      }}
      onRetry={async (nodeId, taskId) => {
        const task = await prepareStudioRetry(taskId);
        const commands = getHost()?.taskCommands;
        if (!commands) throw new Error('画布尚未载入');
        commands.update(nodeId, taskId, { beikeTaskId: task.id, isGenerating: true, beikeTaskStopped: false, errorMsg: undefined });
        await saveProject();
        useAppStore.getState().addGenerationTask({ ...task, canvasProjectId: projectId });
      }} />}
    {review && <VideoPromptReviewDialog key={review.id} review={review} />}
    <StudioW3Run frame={frame} enabled={videoWorkflowKind(project.studioScene) === 'w3-copy'} scene={project.studioScene} onSave={saveScene} />
    <iframe ref={frame} title="贝壳云图项目画布" srcDoc={frameDocument}
      className={storyboard?'hidden':'min-h-0 w-full flex-1 border-0'} />
    {storyboard && <CanvasStoryboardView project={{...project, nodes:storyboardNodes}} onBackToCanvas={nodeId => {
      setStoryboard(false);
      if (nodeId) requestAnimationFrame(() => frame.current?.contentWindow?.postMessage({kind:'studio:focus',nodeId},location.origin));
    }} />}
  </section>;
}

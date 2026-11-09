import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Copy, Download, History, Image, ListTodo, Play, Search, X } from 'lucide-react';
import { hasVideoPromptRecovery } from '@client/shared/agent/videoPromptOperation';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { downloadMedia } from '@client/shared/media/downloadMedia';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';
import { useAppStore } from '@client/store';
import { isImageTaskActive, isImageTaskFailed, isImageTaskSucceeded } from '@shared/domain/core/taskStatus';
import { createDepthCopyRunner, type DepthCopyStage } from '../../model/depthCopyRunner';
import { createStudioVideoPosterQueue } from '../../model/studioVideoPosters';
import { NativeStudioCommandsContext, useNativeStudioCommands } from '../../hooks/useNativeStudioCommands';
import { studioNodeLabel } from '../../model/studioConnections';
import {
  recoverStudioVideoPromptOperation,
  studioMatchingPromptOptimization,
  studioPromptBadge,
  studioPromptSkill,
} from '../../model/studioPromptOperation';
import {
  prepareStudioRetry,
  stopStudioTask,
  studioHistoryThumbnail,
  studioNodeTaskId,
  studioProjectGenerationHistory,
  type StudioHistoryEntry,
  type StudioTaskCommands,
} from '../../model/studioTaskState';
import type { CanvasProject, StudioScene } from '../../model/types';
import { videoWorkflowKind } from '../../model/videoWorkflowRecovery';
import { createW3CopyRunner, finishW3CopyVideo, w3PendingDelivery, type W3CopyStage } from '../../model/w3CopyRunner';
import { CanvasSaveStatus } from '../projects/CanvasRecentProjects';
import {
  StudioPromptCompilerDialog,
  StudioStoryboardTools,
  VideoPromptOptimizationDetails,
  VideoPromptReviewDialog,
  VideoPromptSkillBadge,
} from '../video/StudioStoryboardDialog';


/** Saving stays automatic; only failures need space over the canvas. */
export function StudioProjectMenu() {
  return (
    <div className="pointer-events-none absolute bottom-14 left-3 right-3 z-30 flex justify-start [&>*]:pointer-events-auto">
      <CanvasSaveStatus failuresOnly />
    </div>
  );
}

const w3StageLabels:Record<W3CopyStage,string>={
  preflight:'正在检查素材与流程',analysis:'正在分析分镜',keyframe:'2/3 正在生成目标首帧',
  video:'正在使用当前模型生成视频',delivery:'正在移除音轨并校验15秒成片',complete:'15秒无音轨视频已生成并保存',
};

export function StudioW3Run({commands,enabled,onSave,scene}:{commands:StudioTaskCommands;enabled:boolean;scene?:StudioScene;onSave:(scene:StudioScene)=>Promise<void>}) {
  const save=useRef(onSave);save.current=onSave;
  const directRef=useRef(commands);directRef.current=commands;
  const locked=useRef(false);
  const [busy,setBusy]=useState(false),[stage,setStage]=useState<W3CopyStage|null>(null),[error,setError]=useState('');
  const [runner]=useState(()=>createW3CopyRunner({
    commands:()=>directRef.current,
    save:scene=>save.current(scene),stopTask:stopStudioTask,finishVideo:finishW3CopyVideo,
  }));
  useEffect(()=>()=>{runner.cancel();},[runner]);
  const run=async(finishOnly=false)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');
    try{await (finishOnly?runner.finish(setStage):runner.run(setStage));}
    catch(cause){setError(cause instanceof Error&&cause.name==='AbortError'?'已停止后续步骤；已提交的任务可在「生成历史」中查看':cause instanceof Error?cause.message:'复刻流程未完成，请检查「生成历史」中的任务');}
    finally{locked.current=false;setBusy(false);}
  };
  if(!enabled)return null;
  const canFinish=!busy&&scene?.nodes.some(w3PendingDelivery);
  return <aside aria-label="视频复刻一键运行" className="canvas-fixed-ui absolute bottom-16 right-4 z-30 w-52 text-xs text-stone-200">
    <div className="flex h-8 items-center justify-end gap-2">
      <button title="按顺序分析分镜、生成主图和视频，沿用各节点当前选择的模型" disabled={busy||canFinish} onClick={()=>void run()}
        className="h-8 flex-1 rounded-lg border border-white/15 bg-[#252527]/95 px-3 font-medium text-white hover:bg-[#353537] disabled:opacity-50">{busy?'复刻运行中…':'一键运行W3复刻'}</button>
      {busy && <button onClick={()=>runner.cancel()} title="停止后续步骤" className="h-8 rounded-lg border border-white/20 bg-[#252527] px-2">停止</button>}
    </div>
    {(stage||error||canFinish) && <div className="mt-2 grid gap-2 rounded-lg border border-white/15 bg-[#202023]/95 p-3 shadow-lg">
      {stage&&!error&&<p role="status" aria-live="polite">{w3StageLabels[stage]}</p>}
      {error&&<p role="alert" className="break-words text-red-300">{error}</p>}
      {(!busy&&error&&stage==='delivery'||canFinish) && <button onClick={()=>void run(true)} className="rounded-lg border border-white/20 p-2">{error&&stage==='delivery'?'重试无声处理（不重新生成）':'继续无声交付（不重新生成）'}</button>}
    </div>}
  </aside>;
}

function StudioDepthRun({ commands, onSave }: { commands: StudioTaskCommands; onSave: (scene: StudioScene) => Promise<void> }) {
  const live = useRef({ commands, onSave });
  live.current = { commands, onSave };
  const [runner] = useState(() => createDepthCopyRunner({
    commands: () => live.current.commands, save: scene => live.current.onSave(scene), stopTask: stopStudioTask,
  }));
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<DepthCopyStage>();
  const [error, setError] = useState('');
  useEffect(() => () => runner.cancel(), [runner]);
  const run = async () => {
    setBusy(true);
    setError('');
    try { await runner.run(setStage); }
    catch (cause) { setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : '已停止后续步骤'); }
    finally { setBusy(false); }
  };
  return <aside aria-label="深度复刻准备" className="canvas-fixed-ui absolute bottom-16 right-4 z-30 w-56 rounded-lg bg-[#252527]/95 p-2 text-xs text-white">
    <button type="button" disabled={busy} onClick={() => void run()}>一键准备深度复刻</button>
    {busy && <button type="button" className="ml-3" onClick={() => runner.cancel()}>停止</button>}
    {stage === 'ready' && !error && <p role="status">提示词已确认，可到 08 手动生成视频。</p>}
    {error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
  </aside>;
}

const historyLabels={image:'图片',video:'视频',audio:'音频'};
const historySuffix={image:'.png',video:'.mp4',audio:'.mp3'};
const historyPageSize = 12;
const historyVideoPosters = createStudioVideoPosterQueue();

export function StudioGenerationHistory({entries,ready}:{entries:StudioHistoryEntry[];ready:boolean}) {
  const [filter,setFilter]=useState<'all'|StudioHistoryEntry['kind']>('all');
  const [query,setQuery]=useState('');
  const [playingId,setPlayingId]=useState<string>();
  const [preview,setPreview]=useState<HistoryPreviewMedia>();
  const [limit,setLimit]=useState(historyPageSize);
  const loadMoreMarker=useRef<HTMLDivElement>(null);
  const canObserve=typeof IntersectionObserver!=='undefined';
  const [notice,setNotice]=useState('');
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches=entries.filter((entry): entry is StudioHistoryEntry & {result:string} => Boolean(entry.result)
    && !(entry.task && (isImageTaskFailed(entry.task.status) || entry.task.failReason?.startsWith('已取消')))
    && (filter==='all'||entry.kind===filter)
    && terms.every(term=>[entry.title,entry.prompt,entry.model].some(value=>value?.toLocaleLowerCase().includes(term))));
  const hasMore=matches.length>limit;
  useEffect(()=>{
    const marker=loadMoreMarker.current;
    if(!canObserve || !hasMore || !marker)return;
    const observer=new IntersectionObserver(([entry])=>{
      if(!entry?.isIntersecting)return;
      observer.disconnect();
      setLimit(current=>current===limit ? current+historyPageSize : current);
    },{root:marker.closest('[data-history-scroll]')});
    observer.observe(marker);
    return ()=>observer.disconnect();
  },[canObserve,hasMore,limit,filter,query]);
  return <>
    <div className="shrink-0 px-3 pb-2">
      <div className="flex gap-0.5 rounded-full bg-[#0d0d0f] p-1" role="group" aria-label="素材类型">
        {(['all','image','video','audio'] as const).map(kind=><button key={kind} type="button" aria-pressed={kind===filter}
          className="flex-1 rounded-full px-1 py-1 text-[11px] font-semibold text-zinc-400 hover:text-white aria-pressed:bg-[#efeff1] aria-pressed:text-[#151517]"
          onClick={()=>{setFilter(kind);setLimit(historyPageSize);}}>{kind==='all'?'全部':historyLabels[kind]}</button>)}
      </div>
      <label className="mt-2 flex h-8 items-center gap-1.5 rounded-full border border-[#39393e] bg-[#242427] px-2 py-0.5 text-zinc-400 focus-within:border-zinc-400">
        <Search size={12} className="shrink-0"/>
        <input type="search" aria-label="搜索历史" placeholder="搜索历史" value={query}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500"
          onChange={event=>{setQuery(event.target.value);setLimit(historyPageSize);}}/>
      </label>
    </div>
    {notice && <p role="status" className="px-4 pb-2 text-xs text-zinc-400">{notice}</p>}
    <div data-history-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-3">
      {!ready && <p role="status" className="px-1 py-3 text-xs text-zinc-400">正在读取生成记录…</p>}
      {ready && !matches.length && <p className="py-10 text-center text-xs text-zinc-500">{query.trim()?'没有匹配的记录':filter==='all'?'此项目暂无成功结果':'该类型暂无成功结果'}</p>}
      <ol className="grid gap-2">
        {matches.slice(0,limit).map(entry=><HistoryCard key={entry.id+'|'+entry.result} entry={entry}
          playing={playingId===entry.id} onPlay={()=>setPlayingId(entry.id)} onStop={()=>setPlayingId(undefined)} onPreview={media=>{setPlayingId(undefined);setPreview(media);}} onNotice={setNotice}/>)}
      </ol>
      {hasMore && (canObserve
        ? <div ref={loadMoreMarker} aria-hidden="true" className="h-px"/>
        : <button type="button" className="mt-2 w-full rounded-md p-2 text-xs hover:bg-white/10" onClick={()=>setLimit(n=>n+historyPageSize)}>显示更多</button>)}
    </div>
    {preview && <HistoryPreview media={preview} onClose={()=>setPreview(undefined)}/>}
  </>;
}

function HistoryCard({entry,playing,onPlay,onStop,onPreview,onNotice}:{
  entry:StudioHistoryEntry & {result:string};playing:boolean;onPlay:()=>void;onStop:()=>void;onPreview:(media:HistoryPreviewMedia)=>void;onNotice:(message:string)=>void;
}) {
  const [open,setOpen]=useState(false);
  const [failed,setFailed]=useState(false);
  const task=entry.task,result=entry.result;
  const videos=task?.referenceVideoUrls||[];
  const images=(task?.referenceImages||task?.images||[]).filter(url=>!videos.includes(url));
  const audio=task?.referenceAudioUrls||[];
  const references=[images.length>0&&`图片 ${images.length} 张`,videos.length>0&&`视频 ${videos.length} 段`,audio.length>0&&`音频 ${audio.length} 段`].filter(Boolean).join('、');
  const time=entry.createdAt?new Date(entry.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).replace('/','-'):undefined;
  return <li className="min-w-0 overflow-hidden rounded-lg bg-[#1b1b1e]">
    <div className="relative flex h-[120px] items-center justify-center overflow-hidden bg-[#272729]">
      {entry.kind==='image' ? (
        <button type="button" aria-label="放大预览图片" aria-haspopup="dialog" className="grid h-full w-full place-items-center" onClick={()=>onPreview({kind:'image',url:result,title:entry.title})}>
          {failed ? <span className="flex items-center gap-2 text-xs text-zinc-400"><Image size={16}/>缩略图不可用</span>
            : <HistoryThumbnail result={result} title={entry.title} onError={()=>setFailed(true)}/>}
        </button>
      ) : entry.kind==='audio' && playing ? (
        <HistoryPlayer kind="audio" url={result} title={entry.title} onStop={onStop} onError={()=>{setFailed(true);onStop();}}/>
      ) : (
        <button type="button" className="relative grid h-full w-full place-items-center hover:bg-white/5"
          aria-label={entry.kind==='video'?'放大预览视频':'播放音频'} aria-haspopup={entry.kind==='video'?'dialog':undefined}
          onClick={()=>entry.kind==='video' ? onPreview({kind:'video',url:result,title:entry.title}) : onPlay()}>
          {entry.kind==='video' && <HistoryThumbnail result={result} title={entry.title+'封面'} video/>}
          <span className="relative grid size-9 place-items-center rounded-full bg-zinc-200 text-zinc-900 shadow-sm">
            {entry.kind==='audio' ? <AudioLines size={18}/> : <Play size={15} className="translate-x-px" fill="currentColor"/>}
          </span>
          {failed && <span className="absolute bottom-1 text-[10px] text-zinc-300">播放失败，点击重试</span>}
        </button>
      )}
    </div>
    <div className="flex flex-col gap-1.5 px-2.5 py-2">
      <div className="flex items-center gap-1 border-b border-white/5 pb-1">
        <button type="button" className="min-w-0 flex-1 truncate text-left text-[11px] font-medium hover:text-white"
          title={entry.title} aria-expanded={open} onClick={()=>setOpen(!open)}>{entry.title}</button>
        {entry.prompt && <button type="button" className="rounded p-0.5 text-zinc-500 hover:text-white" aria-label="复制提示词" title="复制提示词"
          onClick={()=>void navigator.clipboard.writeText(entry.prompt!).then(()=>onNotice('已复制提示词'),()=>onNotice('无法复制提示词'))}><Copy size={12}/></button>}
        {result && <button type="button" className="rounded p-0.5 text-zinc-500 hover:text-white" aria-label="下载结果" title="下载结果"
          onClick={()=>{onNotice('');void downloadMedia(result,entry.title+historySuffix[entry.kind]).catch(()=>onNotice('结果文件暂时无法下载'));}}><Download size={12}/></button>}
      </div>
      <p className="truncate text-[11px] text-zinc-400" title={[time,entry.model].filter(Boolean).join(' · ')}>{[time,entry.model].filter(Boolean).join(' · ') || historyLabels[entry.kind]}</p>
      {open && references && <p className="text-[10px] text-zinc-400">本次参考：{references}</p>}
      {open && entry.prompt && <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] text-zinc-300">{entry.prompt}</p>}
    </div>
  </li>;
}

function HistoryThumbnail({result,title,video=false,onError}:{
  result:string;title:string;video?:boolean;onError?:()=>void;
}) {
  const placeholder=useRef<HTMLSpanElement>(null);
  const [visible,setVisible]=useState(false);
  const [fallback,setFallback]=useState(false);
  const [poster,setPoster]=useState<string>();
  useEffect(()=>{
    const element=placeholder.current;
    if(!element)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(([entry])=>{if(entry?.isIntersecting){setVisible(true);observer.disconnect();}},
      {root:element.closest('[data-history-scroll]'),rootMargin:'120px 0px'});
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!video || !visible)return;
    const controller=new AbortController();
    void historyVideoPosters.request(result,controller.signal).then(source=>{
      if(!controller.signal.aborted)setPoster(source);
    },()=>{});
    return ()=>controller.abort();
  },[result,video,visible]);
  const localThumbnail = visible && !video ? studioHistoryThumbnail(result, window.location.origin) : undefined;
  const thumbnail = localThumbnail === result ? proxyMediaUrl(result, {thumb:true,width:384}) : localThumbnail;
  const source = video ? poster : fallback ? result : thumbnail;
  return <span ref={placeholder} className={video?'absolute inset-0':'block h-full w-full'}>
    {source && <img className="h-full w-full object-contain" decoding="async" src={source} alt={title}
      onError={()=>{if(!video && !fallback && thumbnail!==result)setFallback(true);else onError?.();}}/>}
  </span>;
}

type HistoryPreviewMedia = {kind:'image'|'video';url:string;title:string};

function HistoryPreview({media,onClose}:{media:HistoryPreviewMedia;onClose:()=>void}) {
  const dialog=useModalDialog(true,onClose);
  const [failed,setFailed]=useState(false);
  const [direct,setDirect]=useState(false);
  const preferred=media.kind==='image' ? proxyMediaUrl(media.url) : media.url;
  return createPortal(
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/75 p-4" onWheel={event=>event.stopPropagation()}
      onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="生成结果预览" tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-zinc-950 text-zinc-100 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={media.title}>{media.title}</h2>
          <button type="button" aria-label="关闭预览" className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-white/10" onClick={onClose}><X size={18}/></button>
        </header>
        <div className="relative grid min-h-28 place-items-center overflow-hidden">
          {failed ? <p role="status" className="p-6 text-sm text-zinc-400">暂时无法打开此媒体文件</p>
            : media.kind==='video' ? <HistoryPlayer kind="video" url={media.url} title={media.title} onError={()=>setFailed(true)}/>
            : <img className="max-h-[80dvh] max-w-full object-contain" alt={media.title} src={direct?media.url:preferred}
              onError={()=>{if(!direct && preferred!==media.url)setDirect(true);else setFailed(true);}}/>}
        </div>
      </div>
    </div>,document.body);
}

function HistoryPlayer({kind,url,title,onStop,onError}:{
  kind:'video'|'audio';url:string;title:string;onStop?:()=>void;onError:()=>void;
}) {
  const [waiting,setWaiting]=useState(true);
  const [slow,setSlow]=useState(false);
  const [direct,setDirect]=useState(false);
  const preferred=kind==='video'?proxyMediaUrl(url,{asVideo:true}):url;
  const source=direct?url:preferred;
  useEffect(()=>{
    if(!waiting)return;
    const timer=window.setTimeout(()=>setSlow(true),4000);
    return ()=>window.clearTimeout(timer);
  },[source,waiting]);
  const ready=()=>{setWaiting(false);setSlow(false);};
  const events={onWaiting:()=>setWaiting(true),onPlaying:ready,onCanPlay:ready,onEnded:onStop,
    onError:()=>{if(!direct && preferred!==url){setWaiting(true);setSlow(false);setDirect(true);}else onError();}};
  return <>
    {kind==='video'
      ? <video key={source} tabIndex={0} className="max-h-[80dvh] w-full" aria-label={title} src={source} autoPlay controls playsInline preload="auto" {...events}/>
      : <audio className="w-[95%]" aria-label={title} src={source} autoPlay controls preload="auto" {...events}/>}
    {waiting && <span role="status" className="pointer-events-none absolute top-2 max-w-[80%] rounded bg-black/65 px-2 py-1 text-[11px] text-zinc-200">{slow?'媒体源响应较慢，仍在加载…':'正在缓冲…'}</span>}
    {onStop && <button type="button" aria-label="关闭播放器" title="关闭播放器" className="absolute right-1 top-1 rounded bg-black/60 p-1 text-zinc-200 hover:bg-black" onClick={onStop}><X size={13}/></button>}
  </>;
}

export function StudioTasksDialog({projectId,commands,onStop,onRetry,onResume,onRecoverPrompt,onClose}:{
  projectId:string; onRecoverPrompt:(id:string)=>Promise<unknown>; commands:StudioTaskCommands; onStop:(id:string,taskId:string)=>Promise<void>;
  onRetry:(id:string,taskId:string)=>Promise<void>; onResume:(id:string,taskId:string)=>Promise<void>; onClose:()=>void;
}) {
  const tasks=useAppStore(state=>state.generationTasks);
  const sessions=useAppStore(state=>state.sessions);
  const [tab,setTab]=useState<'history'|'tasks'>('history');
  const [busy,setBusy]=useState<string[]>([]);
  const [error,setError]=useState('');
  const locks=useRef(new Set<string>());
  const scene=commands.read();
  const nodes=scene.nodes.filter(node=>['gen-image','gen-video'].includes(node.type));
  const historyReady=useAppStore(state=>state.generationHistoryReady);
  const entries=useMemo(()=>studioProjectGenerationHistory(projectId,scene,tasks,sessions),[projectId,scene,tasks,sessions]);
  const taskById=new Map(entries.map(entry=>[entry.id,entry.task]));
  const actionable=nodes.filter(node=>{
    const id=studioNodeTaskId(node),task=id?taskById.get(id):undefined;
    return !!(node.isGenerating || node.beikePromptRecoveryRequired || (node.type==='gen-video' && hasVideoPromptRecovery({projectId,nodeId:node.id,stage:'video'}))
      || (task && (isImageTaskActive(task.status) || task.submissionRecoveryRequired || isImageTaskFailed(task.status) || (node.beikeTaskStopped && task.resultUrl))));
  });
  async function run(id:string,action:()=>Promise<unknown>) {
    if(locks.current.has(id))return;
    locks.current.add(id);setBusy([...locks.current]);setError('');
    try{await action();}
    catch(cause){setError(cause instanceof Error?cause.message:'任务操作失败，请重试');}
    finally{locks.current.delete(id);setBusy([...locks.current]);}
  }
  return <aside aria-label="生成历史" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}
    className="flex min-h-0 w-full flex-col overflow-hidden border-r border-white/10 bg-[#121214] text-sm text-stone-200">
    <header className="flex h-[52px] shrink-0 items-center gap-1.5 px-3">
      <h2 className="mr-auto font-semibold">生成历史</h2>
      <button type="button" aria-pressed={tab==='tasks'} title={tab==='history'?'任务处理':'返回生成记录'} aria-label={tab==='history'?'任务处理':'返回生成记录'}
        className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" onClick={()=>setTab(tab==='history'?'tasks':'history')}>
        {tab==='history'?<ListTodo size={15}/>:<History size={15}/>}
      </button>
      <button type="button" title="关闭生成历史" aria-label="关闭生成历史" className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" onClick={onClose}>
        <X size={15}/>
      </button>
    </header>
    {tab==='history' ? <StudioGenerationHistory entries={entries} ready={historyReady}/> : <div className="grid min-h-0 content-start gap-3 overflow-y-auto px-3 pb-3">
      <h2 className="font-medium">任务处理</h2>
      {!actionable.length && <p className="py-8 text-center text-stone-400">暂无需要处理的画布任务</p>}
      <p className="text-xs text-stone-400">取消尚未提交的任务；已提交的任务仅停止画布等待，后台仍会继续。可继续等待或恢复结果。</p>
      {error && <p role="alert" className="break-words text-red-300">{error}</p>}
      <ul className="grid min-w-0 gap-3">
        {actionable.map(node=>{
          const promptRecovery=node.type==='gen-video'&&hasVideoPromptRecovery({projectId,nodeId:node.id,stage:'video',recoveryOnly:node.beikePromptRecoveryRequired===true});
          const taskId=studioNodeTaskId(node),task=taskId?taskById.get(taskId):undefined;
          const operation=(node.settings as Record<string,unknown>)?.beikeOperation;
          const compose=operation==='compose-original',depth=operation==='depth-video';
          const active=!!task && (isImageTaskActive(task.status) || !!task.submissionRecoveryRequired);
          const stopped=!!node.beikeTaskStopped;
          const routeIssue=active?task?.routeQueryBlock:undefined;
          const completed=!!task && (!!task.resultUrl || isImageTaskSucceeded(task.status));
          const status=promptRecovery?'提示词优化结果待核对':routeIssue?'等待恢复原渠道':active ? task?.submissionRecoveryRequired?'核对提交结果中':'生成中'
            : completed?'已完成':task?.failReason?.startsWith('已取消')?'已取消':task && isImageTaskFailed(task.status)?'生成失败'
            : node.isGenerating?compose?'正在本地合成':node.beikePromptReviewPending?'提示词待确认':node.beikePromptOptimizing?'正在优化提示词':'准备提交'
            : !historyReady&&taskId?'正在恢复任务记录':stopped?'已停止等待':node.errorMsg?compose?'合成失败':'生成失败':node.content?compose?'已合成':depth?'已有深度视频':'已有历史结果':'尚未运行';
          const refs=task?.referenceImages||task?.images||[];
          const videos=task?.referenceVideoUrls||[];
          const versions=(node.settings as {generationVersions?:unknown[]})?.generationVersions?.length || 0;
          const prompt=compose||depth?String(node.prompt||''):task?.prompt||String(node.prompt||'');
          const issue=routeIssue||task?.failReason||node.errorMsg;
          return <li key={node.id} className="min-w-0" aria-label={studioNodeLabel(node)}><SpotlightCard className="grid min-w-0 gap-2 !rounded-lg !border-white/15 !bg-[#202023] p-3 !shadow-none">
            <h3 className="break-words font-medium">{compose?'原声合成 / 拼接视频':depth?'本地深度视频转换':studioNodeLabel(node)}</h3>
            {node.type==='gen-video' && <VideoPromptSkillBadge skillId={studioPromptSkill(node,scene)?.id} model={studioPromptSkill(node,scene)?.modelIcon} label={studioPromptBadge(node,scene)}/>}
            <p role="status">{stopped && !['已取消','已停止等待'].includes(status)?'已停止等待 · ':''}{status}{active && !routeIssue && task?.progress?` ${task.progress}`:''}</p>
            {compose||depth
              ? <p className="text-xs text-stone-400">本地处理</p>
              : <p className="text-xs text-stone-400">{versions?`历史生成版本 ${versions} 个`:node.content?'画布中有历史结果':'暂无历史版本'}{task && <> · 本次参考图片 {refs.filter(url=>!videos.includes(url)).length} 张、视频 {videos.length} 段{task.referenceAudioUrls?.length?`、音频 ${task.referenceAudioUrls.length} 段`:''}</>}</p>}
            <VideoPromptOptimizationDetails dark historical={!studioMatchingPromptOptimization(node,scene)} value={node.beikePromptOptimization as VideoPromptOptimization|undefined}/>
            {prompt && <details className="text-xs"><summary className="cursor-pointer">{compose||depth?'操作说明':task?'本次任务提示词':'节点提示词'}</summary><p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{prompt}</p></details>}
            {Boolean(issue) && <p className={`break-words text-xs ${active?'text-amber-200':'text-red-300'}`}>{String(issue)}</p>}
            <div className="flex flex-wrap gap-2">
              {promptRecovery && <button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2"
                onClick={()=>void run(node.id,()=>onRecoverPrompt(node.id))}>查询原优化回执</button>}
              {!!node.isGenerating && taskId && <button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2"
                onClick={()=>void run(node.id,()=>onStop(node.id,taskId))}>取消等待</button>}
              {stopped && taskId && active && <button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2"
                onClick={()=>void run(node.id,()=>onResume(node.id,taskId))}>继续等待</button>}
              {!node.isGenerating && taskId && task?.resultUrl && node.content!==task.resultUrl && <button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2"
                onClick={()=>void run(node.id,()=>onResume(node.id,taskId))}>恢复任务结果</button>}
              {!node.isGenerating && taskId && task && isImageTaskFailed(task.status) && !active && !completed && <button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2"
                onClick={()=>void run(node.id,()=>onRetry(node.id,taskId))}>重试本次任务</button>}
            </div>
          </SpotlightCard></li>;
        })}
      </ul>
    </div>}
  </aside>;
}

export interface NativeStudioHostOverlaysProps {
  project: CanvasProject;
  onFocusNode?: (nodeId: string) => void;
  historyHost: HTMLElement | null;
  onCloseTasks: () => void;
  children: React.ReactNode;
}

export function NativeStudioHostOverlays({
  project,
  onFocusNode,
  historyHost,
  onCloseTasks,
  children,
}: NativeStudioHostOverlaysProps) {
  const projectId = project.id;
  const [compiler, setCompiler] = useState<{
    nodeId: string;
    commands: StudioTaskCommands;
    textModel?: string;
    finish?: (approved: boolean) => void;
  } | null>(null);
  const compilerPending = useRef<typeof compiler>(null);

  const { taskCommands, saveScene, review } = useNativeStudioCommands({
    projectId,
    onFocusNode,
    onOpenCompiler: (payload) => {
      if (compilerPending.current) {
        payload.finish(false);
        return;
      }
      compilerPending.current = payload;
      setCompiler(payload);
    },
  });

  useEffect(
    () => () => {
      compilerPending.current?.finish?.(false);
      compilerPending.current = null;
      setCompiler(null);
    },
    [projectId],
  );

  useEffect(() => {
    const onOpenCompilerEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId) void taskCommands.runCompiler?.(detail.nodeId);
    };
    window.addEventListener('canvas:open-prompt-compiler', onOpenCompilerEvent);
    return () => window.removeEventListener('canvas:open-prompt-compiler', onOpenCompilerEvent);
  }, [taskCommands]);

  const wfKind = videoWorkflowKind(project.studioScene);

  return (
    <NativeStudioCommandsContext.Provider value={taskCommands}>
      {children}
      <StudioProjectMenu />
      <StudioStoryboardTools key={`native-storyboard:${projectId}`} commands={taskCommands} onSave={saveScene} />
      <StudioW3Run key={`native-w3:${projectId}`} commands={taskCommands} enabled={wfKind === 'w3-copy'} scene={project.studioScene} onSave={saveScene} />
      {wfKind === 'depth-copy' && project.studioScene?.nodes.some(node => (node.settings as Record<string, unknown> | undefined)?.beikePromptCompiler === true) &&
        <StudioDepthRun commands={taskCommands} onSave={saveScene} />}
      {compiler && (
        <StudioPromptCompilerDialog
          projectId={projectId}
          key={compiler.nodeId}
          {...compiler}
          onSave={saveScene}
          onClose={(approved) => {
            compilerPending.current = null;
            const node = compiler.commands.read().nodes.find((n) => n.id === compiler.nodeId);
            if (node) compiler.commands.update(node.id, studioNodeTaskId(node), { beikeCompilerRunning: false });
            compiler.finish?.(approved === true);
            setCompiler(null);
          }}
        />
      )}
      {review && <VideoPromptReviewDialog key={review.id} review={review} />}
      {historyHost && createPortal(
        <StudioTasksDialog
          projectId={projectId}
          commands={taskCommands}
          onRecoverPrompt={(nodeId) => recoverStudioVideoPromptOperation(projectId, nodeId, taskCommands, saveScene)}
          onClose={onCloseTasks}
          onStop={async (nodeId, taskId) => {
            stopStudioTask(taskId);
            taskCommands.stop(nodeId, taskId);
            await saveScene(taskCommands.read());
          }}
          onResume={async (nodeId, taskId) => {
            taskCommands.update(nodeId, taskId, {
              beikeTaskId: taskId,
              beikeLastTaskId: taskId,
              beikeTaskStopped: false,
              isGenerating: true,
              errorMsg: undefined,
              settings: { isGenerating: true, error: undefined },
            });
            await saveScene(taskCommands.read());
          }}
          onRetry={async (nodeId, taskId) => {
            const attempt = await prepareStudioRetry(taskId);
            const previous = taskCommands.read().nodes.find((node) => node.id === nodeId);
            if (!previous || previous.isGenerating || studioNodeTaskId(previous) !== taskId) {
              throw new Error('节点任务已改变，请重新检查');
            }
            taskCommands.update(nodeId, taskId, {
              beikeTaskId: attempt.id,
              beikeTaskRecord: attempt,
              beikeLastTaskId: attempt.id,
              beikeTaskStopped: false,
              isGenerating: true,
              errorMsg: undefined,
              ...(typeof previous.beikeLastTaskPrompt === 'string' ? { prompt: previous.beikeLastTaskPrompt } : {}),
              settings: {
                ...((previous.beikeLastTaskSettings as Record<string, unknown>) || {}),
                isGenerating: true,
                progress: 0,
                error: undefined,
              },
            });
            try {
              await saveScene(taskCommands.read());
            } catch (error) {
              taskCommands.update(nodeId, attempt.id, previous);
              throw error;
            }
            const current = taskCommands.read().nodes.find(node => node.id === nodeId);
            if (!current?.isGenerating || current.beikeTaskStopped || current.beikeTaskId !== attempt.id) return;
            useAppStore.getState().addGenerationTask({ ...attempt, canvasProjectId: projectId }, false);
          }}
        />,
        historyHost,
      )}
    </NativeStudioCommandsContext.Provider>
  );
}

import {useCallback,useEffect,useId,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import type {VideoPromptOptimization} from '@client/shared/agent/videoPromptOptimizer';
import {selectedStoryboardPrompt} from '@client/shared/agent/videoPromptOutput';
import {resolveVideoPromptSkill} from '@shared/domain/assistant/skills/videoPromptSkills';
import {skillDisplayDescription} from '@shared/domain/assistant/skills/skillDisplay';
import {AssistantSkillCardIcon} from '@client/shared/icons/assistant/AssistantIcons';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import {useModalDialog} from '@client/shared/hooks/useModalDialog';
import {dataUrlToBlob,fetchMediaBlob} from '@client/shared/media/downloadMedia';
import {saveToDownloadDir} from '@client/shared/media/saveDownload';
import {uploadStudioFile} from '@client/shared/api/uploadStudioFile';
import {apiFetch} from '@client/shared/api/apiClient';
import {invalidateGlobalAssetCache} from '@client/shared/api/assetLibraryCache';
import {useCanvasStore} from '../../store/useCanvasStore';
import {studioNodeMedia} from '../../model/studioConnections';
import {
 compilerSettings,
 restoreStudioCompilerDraft,
 saveStudioCompilerApproval,
 saveStudioCompilerDraft,
 studioCompilerSkills,
 type StudioCompilerPreview,
} from '../../model/studioCompilerState';
import {runStudioCompiler} from '../../model/studioPromptOperation';
import {studioChannels} from '../../model/studioGeneration';
import {studioNodeTaskId,type StudioTaskCommands} from '../../model/studioTaskState';
import {
 extractStudioStoryboard,
 pendingStudioStoryboards,
 storyboardSourceChanged,
 storyboardSourceKey,
 studioStoryboardNode,
 studioStoryboardSheet,
 wireStudioStoryboards,
 type StudioStoryboardFrame,
} from '../../model/studioStoryboard';
import type {StudioScene} from '../../model/types';

export function VideoPromptOptimizationDetails({ value, dark=false, historical=false }: { value?: VideoPromptOptimization; dark?: boolean; historical?: boolean }) {
  if (!value) return null;
  const skill=resolveVideoPromptSkill(value.skillId,value.videoModel,value.videoMode);
  return <details className={`min-w-0 text-xs leading-6 ${dark?'text-stone-300':'text-slate-600 dark:text-stone-300'}`}>
    <summary className="min-h-11 cursor-pointer rounded py-2 focus-visible:outline-2 focus-visible:outline-sky-300">{historical?'上次模型的优化记录':'查看原文与优化稿'} · {skill?.displayName || '视频提示词技能'}</summary>
    <div className="mt-2 grid min-w-0 gap-2">
      <a className="w-fit underline" href={value.sourceUrl} target="_blank" rel="noreferrer">{skill?.source?.kind==='community'?'GitHub 社区来源':'官方来源'} · {value.revision}</a>
      <p>优化模型：{value.textModel}</p>
      <p>原始提示词</p><p className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{value.original}</p>
      <p>{value.submitted?'实际提交的提示词':'优化稿'}</p><p className="max-h-60 overflow-auto whitespace-pre-wrap break-words">{value.submitted ?? value.draft ?? value.optimized}</p>
    </div>
  </details>;
}

export function VideoPromptSkillDetails({skillId,model,onClose}:{skillId:string;model?:string;onClose:()=>void}) {
  const skill=resolveVideoPromptSkill(skillId,model),titleId=useId();
  const dialog=useModalDialog(true,onClose);
  if(!skill)return null;
  return createPortal(<div className="pointer-events-auto fixed inset-0 z-[220] grid place-items-center bg-black/60 p-3 backdrop-blur-sm" onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl dark:border-white/15 dark:bg-[#202023] dark:text-stone-100">
      <header className="flex items-center gap-3 border-b border-slate-200 p-5 dark:border-white/10">
        <AssistantSkillCardIcon skill={skill}/><div className="min-w-0 flex-1"><h2 id={titleId} className="font-semibold">{skill.displayName || skill.name}</h2><p className="mt-1 text-xs text-slate-500 dark:text-stone-400">{skill.source?.kind==='official'?'官方':'GitHub 社区'}视频提示词技能 · {skill.author}</p></div>
        <button type="button" aria-label="关闭技能介绍" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 dark:hover:bg-white/10"><X aria-hidden="true" className="h-5 w-5"/></button>
      </header>
      <div className="min-h-0 space-y-5 overflow-auto p-5 text-sm leading-7">
        <p>{skillDisplayDescription(skill)}</p>
        {skill.usageGuide && <MarkdownBody content={skill.usageGuide}/>}
        <div className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-white/10 dark:text-stone-400">
          <p>技能标识：{skill.id} · 版本：{skill.version}</p>
          {skill.source && <a href={skill.source.url} target="_blank" rel="noreferrer" className="inline-block py-2 underline focus-visible:outline-2 focus-visible:outline-sky-400">{skill.source.kind==='official'?'查看官方来源':'查看 GitHub 社区来源'}</a>}
        </div>
      </div>
    </div>
  </div>,document.body);
}

export function VideoPromptSkillBadge({skillId,label,model}:{skillId?:string;label:string;model?:string}) {
  const [open,setOpen]=useState(false),skill=skillId?resolveVideoPromptSkill(skillId,model):undefined;
  if(!label)return null;
  if(!skill)return <span className="text-xs text-slate-600 dark:text-stone-300">{label}</span>;
  return <>
    <button type="button" aria-label={`查看${skill.displayName || skill.name}的介绍`} aria-haspopup="dialog" onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();setOpen(true);}} className="pointer-events-auto inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 dark:border-white/15 dark:bg-[#202023] dark:text-stone-200 dark:hover:bg-white/10">
      <AssistantSkillCardIcon skill={skill} className="!h-6 !w-6 !rounded-md !p-0.5"/><span className="min-w-0 break-words">{label}</span>
    </button>
    {open && <VideoPromptSkillDetails skillId={skill.id} model={model} onClose={()=>setOpen(false)}/>}
  </>;
}

export interface VideoPromptReview {
  id: string;
  optimization: VideoPromptOptimization;
  confirm: (prompt: string) => void | Promise<void>;
  cancel: () => void;
  onDraft?: (prompt: string) => void | Promise<void>;
}

export function VideoPromptReviewDialog({ review }: { review: VideoPromptReview }) {
  const [prompt,setPrompt]=useState(review.optimization.draft ?? review.optimization.optimized);
  const titleId=useId();
  const submitted=useRef(false);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const confirm=async()=>{
    if(submitted.current)return;submitted.current=true;setSaving(true);setError('');
    try {await review.confirm(prompt);}
    catch(cause){submitted.current=false;setError(cause instanceof Error?cause.message:'确认失败，请重试');}
    finally{setSaving(false);}
  };
  const dialog=useModalDialog(true,()=>{if(!submitted.current)review.cancel();},{initialFocusSelector:'textarea'});
  const skill=resolveVideoPromptSkill(review.optimization.skillId,review.optimization.videoModel,review.optimization.videoMode);
  const storyboard=review.optimization.operationInput&&selectedStoryboardPrompt(review.optimization.operationInput);
  return createPortal(<div onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} className="pointer-events-auto fixed inset-0 z-[200] grid place-items-center bg-black/60 p-3 backdrop-blur-sm">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full max-w-3xl flex-col gap-4 overflow-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl dark:border-white/15 dark:bg-[#202023] dark:text-stone-100">
      <header className="flex items-start gap-3"><AssistantSkillCardIcon skill={skill}/><div className="min-w-0">
        <h2 id={titleId} className="font-semibold">确认视频提示词</h2>
        <p className="mt-1 break-words text-xs text-slate-500 dark:text-stone-300">本次 Skill：{skill?.displayName || review.optimization.skillId} · {review.optimization.skillId}</p>
        <p className="mt-1 break-all text-xs text-slate-500 dark:text-stone-400">版本：{review.optimization.revision} · 优化模型：{review.optimization.textModel}</p>
      </div></header>
      <p className="text-sm text-slate-600 dark:text-stone-300">视频尚未提交。可以修改下方提示词，{review.optimization.compiler ? '确认仅保存07文本，之后由08读取，不会生成视频。' : '确认后按当前稿件生成视频。'}</p>
      <details className="text-xs leading-6 text-slate-500 dark:text-stone-400"><summary className="w-fit cursor-pointer">查看原始提示词</summary><p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{review.optimization.original}</p></details>
      {storyboard&&<p className="text-sm text-slate-600 dark:text-stone-300">可调整排版。修改分镜内容请返回05，修改素材职责请调整连线。</p>}
      <label className="grid min-h-0 gap-2 text-sm">优化后的提示词（可修改）
        <textarea aria-label="优化后的提示词" value={prompt} disabled={saving} maxLength={20000} onChange={event=>{const draft=event.target.value;setPrompt(draft);void (async()=>{try{await review.onDraft?.(draft);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'草稿保存失败，请重试');}})();}} className="min-h-64 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm leading-7 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/20 dark:bg-black/20"/>
      </label>
      {review.optimization.warning&&<p role="status" className="text-sm">{review.optimization.warning}</p>}
      {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
      <footer className="flex flex-wrap justify-end gap-3">
        <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm dark:border-white/20" disabled={saving} onClick={review.cancel}>取消，不生成视频</button>
        <button type="button" disabled={saving||!prompt.trim()} className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-900" onClick={()=>void confirm()}>{saving?'正在确认…':review.optimization.compiler?'确认保存07提示词':'确认生成视频'}</button>
      </footer>
    </section>
  </div>,document.body);
}

export function StudioPromptCompilerDialog({projectId,nodeId,commands,onSave,onClose,textModel,onReview}:{projectId:string;nodeId:string;textModel?:string;commands:StudioTaskCommands;onSave:(scene:StudioScene)=>Promise<void>;onClose:(approved?:boolean)=>void;onReview?:(review:VideoPromptReview)=>void}) {
 const initial=commands.read().nodes.find(n=>n.id===nodeId)!;
 const initialSettings=compilerSettings(initial);
 const optimizer=String(textModel||initialSettings.textNodeChatModel||'');
 const selectedOptimizer=studioChannels().find(c=>c.kind==='chat'&&c.id===optimizer);
 const model=String(initialSettings.model||'');
 const channel=studioCompilerSkills().find(c=>c.id===model);
 const [preview,setPreview]=useState<StudioCompilerPreview|null>(()=>{
  const cached=restoreStudioCompilerDraft(commands.read(),nodeId);
  return cached&&(!optimizer||selectedOptimizer?.route===cached.value.textModel)&&channel?.modelId===cached.input.model?cached:null;
 });
 const run=useRef(async(controller:AbortController)=>{
  try {
   const result=await runStudioCompiler({projectId,nodeId,commands,onSave,textModel,signal:controller.signal});
   if(!controller.signal.aborted)setPreview(result);
  }catch(e){
   if(!controller.signal.aborted){
    const node=commands.read().nodes.find(n=>n.id===nodeId);
    if(node)commands.update(nodeId,studioNodeTaskId(node),{errorMsg:e instanceof Error?e.message:'提示词优化失败'});
    onClose();
   }
  }
 });
 useEffect(()=>{
  if(preview)return;
  const controller=new AbortController();
  queueMicrotask(()=>{if(!controller.signal.aborted)void run.current(controller);});
  return ()=>controller.abort();
 },[preview]);
 if(preview){
  const review:VideoPromptReview={id:nodeId,optimization:preview.value,onDraft:draft=>saveStudioCompilerDraft(commands,nodeId,preview,draft,onSave),cancel:()=>onClose(),confirm:async edited=>{
   await saveStudioCompilerApproval({commands,nodeId,key:preview.key,input:preview.input,optimization:preview.value,edited,save:onSave});
   onClose(true);
  }};
  onReview?.(review);
  return <VideoPromptReviewDialog review={review}/>;
 }
 return null;
}

export function StudioStoryboardTools({commands:directCommands,onSave}:{commands:StudioTaskCommands;onSave:(scene:StudioScene)=>Promise<void>}) {
 const [sourceId,setSourceId]=useState<string|null>(null),[status,setStatus]=useState('');
 const [maskId,setMaskId]=useState<string|null>(null);
 const active=useRef<AbortController|null>(null),saveRef=useRef(onSave);saveRef.current=onSave;
 const directRef=useRef(directCommands);directRef.current=directCommands;
 const commands=useCallback(()=>directRef.current,[]);
 useEffect(()=>{
  const seen=new Map<string,string>();
  const extract=async(id:string,previousKey=seen.get(id))=>{
   if(active.current)return;
   const controller=new AbortController();active.current=controller;
   try {
    const c=commands(),source=c.read().nodes.find(n=>n.id===id);if(!source)throw new Error('视频节点已不存在');
    if(!c.insert||!c.connect)throw new Error('请刷新画布后重试');
    const sourceKey=storyboardSourceKey(source);seen.set(id,sourceKey);
    const pagesBefore=c.read().nodes.filter(n=>compilerSettings(n).beikeStoryboardSourceId===id);
    if(storyboardSourceChanged(pagesBefore,sourceKey,previousKey)){const analysis=c.read().nodes.find(n=>n.id===id.replace(/-source$/,'-analysis'));if(analysis)c.update(analysis.id,typeof analysis.beikeTaskId==='string'?analysis.beikeTaskId:undefined,{settings:{beikeSourceVideoChangedAt:Date.now()}});}
    const owner=c.read().nodes.find(n=>n.id===id.replace(/-source$/,'-video')),compilerId=owner&&compilerSettings(owner).beikeCompilerSource;
    for(const node of c.read().nodes){const s=compilerSettings(node);if(s.beikeStoryboardSourceId===id)c.update(node.id,typeof node.beikeTaskId==='string'?node.beikeTaskId:undefined,{settings:{beikeStoryboardActive:false}});if(s.beikePromptCompiler&&node.id===compilerId)c.update(node.id,typeof node.beikeTaskId==='string'?node.beikeTaskId:undefined,{settings:{beikeCompilerApproved:undefined,beikeCompilerInputKey:undefined}});}
    await saveRef.current(c.read());
    const items=await extractStudioStoryboard(studioNodeMedia(source).url,(n,total)=>setStatus(`正在本机抽帧 ${n}/${total}`),controller.signal);
    const pages=await Promise.all(Array.from({length:Math.ceil(items.length/16)},(_,page)=>studioStoryboardSheet(items.slice(page*16,page*16+16))));
    const urls=await Promise.all(pages.map((sheet,page)=>uploadStudioFile(new File([dataUrlToBlob(sheet)],`video-storyboard-${page+1}.jpg`,{type:'image/jpeg'}),'canvas-storyboards',controller.signal)));
    controller.signal.throwIfAborted();
    const current=c.read(),live=current.nodes.find(n=>n.id===id);if(!live||storyboardSourceKey(live)!==sourceKey)throw new Error('原视频已改变，请重新抽帧');
    const previous=current.nodes.filter(n=>compilerSettings(n).beikeStoryboardSourceId===id);
    for(let page=0;page<urls.length;page++) {
     const old=previous.find(n=>Number(compilerSettings(n).beikeStoryboardPageIndex||0)===page),node=studioStoryboardNode(live,urls[page],items.slice(page*16,page*16+16).length,old?.id||crypto.randomUUID(),page,items[1]?.time||.5);
     if(old)c.update(old.id,typeof old.beikeTaskId==='string'?old.beikeTaskId:undefined,{content:node.content,nodeName:node.nodeName,settings:{...node.settings as object,beikeStoryboardSourceKey:sourceKey}});else c.insert({...node,settings:{...node.settings as object,beikeStoryboardSourceKey:sourceKey}});
    }
    for(const old of previous)if(Number(compilerSettings(old).beikeStoryboardPageIndex||0)>=urls.length)c.update(old.id,typeof old.beikeTaskId==='string'?old.beikeTaskId:undefined,{settings:{beikeStoryboardActive:false}});
    c.connect(wireStudioStoryboards(c.read()).connections);
    await saveRef.current(c.read());setStatus(`已抽取${items.length}帧、${urls.length}页，并自动连接复刻节点；请检查人脸处理有无漏检`);
   }catch(e){if(!controller.signal.aborted)setStatus(e instanceof Error?e.message:'抽帧失败');}finally{if(active.current===controller)active.current=null;}
  };
  const receive=(event:MessageEvent)=>{
   if(event.origin!==location.origin || event.source!==window)return;
   if(event.data?.kind==='studio:storyboard-mask'&&typeof event.data.nodeId==='string')setMaskId(event.data.nodeId);
   if(event.data?.kind==='studio:storyboard'){
    const id=event.data.nodeId;if(typeof id!=='string')return;
    if(event.data.preview)setSourceId(id);else void extract(id);
   }
  };
  let disposed=false, queued=false;
  const scan=()=>{
   if(disposed||queued)return;
   queued=true;
   queueMicrotask(()=>{
    queued=false;
    if(disposed)return;
    const previous=new Map(seen);
    const scene=commands().read();
    if(scene.nodes.some(node=>node.type==='input-image'&&studioNodeMedia(node).url.startsWith('local-asset://')))return;
    const pending=pendingStudioStoryboards(scene,seen);
    if(!pending.length)return;
    active.current?.abort();active.current=null;
    void (async()=>{
     for(const id of pending){
      if(disposed||active.current)return;
      await extract(id,previous.get(id)||'');
     }
    })();
   });
  };
  const unsubscribe=useCanvasStore.subscribe((state,before)=>{if(state.projects!==before.projects)scan();});
  scan();
  window.addEventListener('message',receive);
  return()=>{disposed=true;unsubscribe();window.removeEventListener('message',receive);active.current?.abort();};

 },[commands]);
 const maskNode=maskId&&commands().read().nodes.find(node=>node.id===maskId&&compilerSettings(node).beikeStoryboardSourceId);
 return <>{status&&<div role="status" className="absolute right-3 top-14 z-30 flex items-center gap-3 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-white">{status}<button aria-label="关闭抽帧提示" onClick={()=>setStatus('')}>×</button></div>}{sourceId&&<StudioStoryboardDialog sourceId={sourceId} commands={commands} onSave={onSave} onClose={()=>setSourceId(null)}/>}
 {maskNode&&<StoryboardMaskDialog key={maskNode.id} nodeId={maskNode.id} commands={commands} onSave={onSave} onClose={()=>setMaskId(null)}/>}</>;
}

function StoryboardMaskDialog({nodeId,commands,onSave,onClose}:{
 nodeId:string;commands:()=>StudioTaskCommands;onSave:(scene:StudioScene)=>Promise<void>;onClose:()=>void;
}) {
 const canvas=useRef<HTMLCanvasElement>(null),original=useRef<HTMLImageElement|null>(null);
 const last=useRef<{x:number;y:number}|null>(null),appliedUrl=useRef('');
 const [url]=useState(()=>studioNodeMedia(commands().read().nodes.find(node=>node.id===nodeId)!).url);
 const [ready,setReady]=useState(false),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const [brush,setBrush]=useState(24);
 const close=()=>{if(!saving)onClose();};
 const dialog=useModalDialog(true,close);
 useEffect(()=>{
  let disposed=false,objectUrl='';
  void (async()=>{
   try {
    const blob=await fetchMediaBlob(url);
    if(disposed)return;
    objectUrl=URL.createObjectURL(blob);
    const image=new Image();
    image.src=objectUrl;await image.decode();
    const surface=canvas.current;
    if(disposed||!surface)return;
    surface.width=image.naturalWidth;surface.height=image.naturalHeight;
    const context=surface.getContext('2d');
    if(!context)throw new Error('浏览器无法打开打码画布');
    context.drawImage(image,0,0);original.current=image;setReady(true);
   } catch(cause) {if(!disposed)setError(cause instanceof Error?cause.message:'分镜图片读取失败');}
  })();
  return ()=>{disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[url]);

 const paint=(event:PointerEvent<HTMLCanvasElement>)=>{
  const surface=event.currentTarget,rect=surface.getBoundingClientRect(),context=surface.getContext('2d');
  if(!context||!rect.width||!rect.height)return;
  const scale=surface.width/rect.width;
  const point={x:(event.clientX-rect.left)*scale,y:(event.clientY-rect.top)*surface.height/rect.height};
  context.strokeStyle=context.fillStyle='#252525';
  context.lineCap='round';context.lineWidth=brush*scale;context.beginPath();
  if(last.current){
   context.moveTo(last.current.x,last.current.y);context.lineTo(point.x,point.y);context.stroke();
  }else{
   context.arc(point.x,point.y,context.lineWidth/2,0,Math.PI*2);context.fill();
  }
  last.current=point;setDirty(true);
 };
 const save=async()=>{
  const surface=canvas.current;
  if(!surface||!dirty||saving)return;
  setSaving(true);setError('');
  try {
   const c=commands();
   const check=(expected:string)=>{
    const scene=c.read(),node=scene.nodes.find(item=>item.id===nodeId);
    if(!node||studioNodeMedia(node).url!==expected||compilerSettings(node).beikeStoryboardActive===false)
     throw new Error('分镜图已更换，请关闭后重新打开打码工具');
    if(scene.nodes.some(item=>item.isGenerating||compilerSettings(item).textNodeIsAnalyzing||item.beikeCompilerRunning))
     throw new Error('请等待画布当前任务结束，再保存打码');
    return {scene,node};
   };
   check(appliedUrl.current||url);
   if(!appliedUrl.current){
    const blob=await new Promise<Blob>((resolve,reject)=>surface.toBlob(result=>result?resolve(result):reject(new Error('无法导出打码图片')),'image/jpeg',0.95));
    const next=await uploadStudioFile(new File([blob],'storyboard-masked.jpg',{type:'image/jpeg'}),'canvas-storyboards');
    const {scene,node}=check(url);
    c.update(nodeId,studioNodeTaskId(node),{content:next,imageUrl:next,_contentAssetId:undefined,assetId:undefined,
     settings:{_localCacheAssetId:undefined,_contentAssetId:undefined,_assetId:undefined,_blobUrl:undefined}});
    const linked=new Set(scene.connections.filter(edge=>edge.from===nodeId).map(edge=>edge.to));
    for(const analysis of scene.nodes.filter(item=>linked.has(item.id)&&compilerSettings(item).beikeTextResultRequired))
     c.update(analysis.id,studioNodeTaskId(analysis),{settings:{beikeStoryboardEditedAt:Math.max(Date.now(),Number(compilerSettings(analysis)._chatCompletedAt||0)+1)}});
    appliedUrl.current=next;
   }
   await onSave(c.read());onClose();
  }catch(cause){setError(cause instanceof Error?cause.message:'人脸打码保存失败');}
  finally{setSaving(false);}
 };
 return createPortal(<div className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4" onPointerDown={event=>event.stopPropagation()}>
  <section ref={dialog} role="dialog" aria-modal="true" aria-label="人脸打码" className="flex max-h-[92dvh] max-w-full flex-col gap-3 rounded-xl bg-zinc-900 p-4 text-sm text-stone-100">
   <h2 className="font-semibold">人脸打码</h2>
   <p>在分镜图片上拖动笔刷补涂漏检的人脸。保存后请重新运行 05、06 并确认 07。</p>
   <div className="flex flex-wrap items-center gap-4">
    <label className="flex items-center gap-2">画笔大小<input type="range" min={8} max={80} value={brush} onChange={event=>setBrush(Number(event.target.value))}/></label>
    <button type="button" disabled={!dirty||saving||!!appliedUrl.current} onClick={()=>{
     if(original.current)canvas.current?.getContext('2d')?.drawImage(original.current,0,0);
     setDirty(false);
    }}>重置本次涂抹</button>
    <button type="button" disabled={!dirty||saving} onClick={()=>void save()}>{saving?'保存中…':'保存打码'}</button>
    <button type="button" disabled={saving} onClick={close}>关闭</button>
   </div>
   {error&&<p role="alert" className="text-red-300">{error}</p>}
   {!ready&&!error&&<p role="status">正在加载分镜图片…</p>}
   <div className="min-h-0 overflow-auto">
    <canvas ref={canvas} aria-label="分镜打码画布" className={ready?'mx-auto block max-h-[68dvh] max-w-full cursor-crosshair touch-none':'hidden'}
     onPointerDown={event=>{if(event.button!==0||saving||appliedUrl.current)return;event.currentTarget.setPointerCapture(event.pointerId);paint(event);}}
     onPointerMove={event=>{if(last.current&&event.currentTarget.hasPointerCapture(event.pointerId))paint(event);}}
     onLostPointerCapture={()=>{last.current=null;}}/>
   </div>
  </section>
 </div>,document.body);
}

function StudioStoryboardDialog({sourceId,commands,onSave,onClose}:{sourceId:string;commands:()=>StudioTaskCommands;onSave:(scene:StudioScene)=>Promise<void>;onClose:()=>void}) {
 const controller=useRef(new AbortController()),modal=useModalDialog(true,onClose);
 const [frames,setFrames]=useState<StudioStoryboardFrame[]>([]),[sheet,setSheet]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const followsStoryboard=commands().read().nodes.some(n=>compilerSettings(n).beikeStoryboardSceneSourceId===sourceId&&compilerSettings(n).beikeOmniReferenceImage===true);
 const [title,setTitle]=useState('原片风格场景'),[saved,setSaved]=useState(false);
 useEffect(()=>{controller.current=new AbortController();return()=>controller.current.abort();},[]);
 const extract=async()=>{
  setBusy(true);setError('');try {
   const scene=commands().read(),source=scene.nodes.find(n=>n.id===sourceId);
   if(!source)throw new Error('请先连接参考视频');
   const items=await extractStudioStoryboard(studioNodeMedia(source).url,(n,total)=>setStatus(`本机抽帧 ${n}/${total}（不调用模型）`),controller.current.signal);
   const image=await studioStoryboardSheet(items);setFrames(items);setSheet(image);setStatus(followsStoryboard?'分镜预览已就绪。复刻会自动沿用开场对应格的场景。':'点击单帧作为06的场景依据，直接换人换衣，不额外生成空场景。');
  }catch(e){setError(e instanceof Error?e.message:'抽帧失败');}finally{setBusy(false);}
 };
 const choose=async(item:StudioStoryboardFrame)=>{
  setBusy(true);setError('');try {
   const c=commands(),scene=c.read(),target=scene.nodes.find(n=>n.id.endsWith('-keyframe')&&compilerSettings(n).beikeOmniReferenceImage);
   if(!target)throw new Error('请先打开复刻画布的06整合参考图节点');
   if(scene.nodes.some(n=>n.isGenerating||compilerSettings(n).textNodeIsAnalyzing))throw new Error('请等待当前任务结束后切换场景来源');
   const url=await uploadStudioFile(new File([dataUrlToBlob(item.dataUrl)],'source-scene-frame.jpg',{type:'image/jpeg'}),'canvas-scenes',controller.current.signal);
   const prompt=`以本次提供的原片${item.time}秒抽帧为场景与摄影依据，制作一个相似风格的真实无人空场景。移除原片人物、人体、猫等可移动主体及原服装，不复制字幕水印；根据可见墙面、门窗、家具和地面连续性合理补全遮挡区域，不声称还原了不可见区域。保持原片可辨的空间布局、机位、透视、日光方向、阴影边界、明暗反差和色彩质感，不改成均匀棚拍。保留目标人物可站立、坐下或蹲下的空间，后续整合以此图为场景依据，不混入旧白墙或商品红背景。单张完整写实场景，不拼图。`;
   c.update(target.id,undefined,{settings:{beikeSceneFrameUrl:url,beikeSceneFrameTime:item.time,beikeSceneSourceMode:'original-frame',beikeSavedSceneAssetId:undefined,beikeSceneFramePrompt:prompt}});
   for(const node of scene.nodes)if(compilerSettings(node).beikePromptCompiler)c.update(node.id,undefined,{settings:{beikeCompilerApproved:undefined,beikeCompilerInputKey:undefined}});
   const analysis=scene.nodes.find(n=>n.id.endsWith('-analysis'));
   if(analysis){const s=compilerSettings(analysis),base=String(s.textNodeDraftPrompt||analysis.prompt||'').replace(/\n【场景来源选择】[\s\S]*?【场景来源选择结束】/g,'');c.update(analysis.id,undefined,{prompt:base,settings:{textNodeDraftPrompt:base+`\n【场景来源选择】目标场景改为原片${item.time}秒抽帧重建的真实场景，保留原片对应空间与光影；旧上传背景仅作备用，不作为目标依据。先按此场景重做分析，不沿用旧白墙描述。【场景来源选择结束】`}});}
   await onSave(c.read());setSaved(false);setStatus(`已选${item.time}秒场景。请重跑05，再生成一张06整合参考图，无需额外生成06c。`);
  }catch(e){setError(e instanceof Error?e.message:'场景选择失败');}finally{setBusy(false);}
 };
 const saveAsset=async()=>{
  setBusy(true);setError('');try {
   const c=commands(),node=c.read().nodes.find(n=>compilerSettings(n).beikeReferencePreparationRole==='scene'||compilerSettings(n).beikeSceneSourceMode==='retained-reference');
   if(!node||node.isGenerating)throw new Error('当前没有已确认的独立场景图，请先选择或生成场景资产');
   if(compilerSettings(node).beikeSavedSceneAssetId){setSaved(true);setStatus('当前场景已入库');return;}
   const archived=compilerSettings(node).beikeRetiredReferenceNodes,sceneRecord=Array.isArray(archived)?archived.find(item=>item&&typeof item==='object'&&(item.settings as Record<string,unknown>|undefined)?.beikeReferencePreparationRole==='scene'):undefined;
   const scenePrompt=String(sceneRecord?.prompt||compilerSettings(node).beikeSceneFramePrompt||(compilerSettings(node).beikeReferencePreparationRole==='scene'?node.prompt:'')||'已确认的独立场景参考');
   const source=String(compilerSettings(node).beikeSceneSourceMode==='retained-reference'?compilerSettings(node).beikeSceneFrameUrl:studioNodeMedia(node).url);if(!source)throw new Error('独立场景图未就绪');
   const blob=await fetchMediaBlob(source),url=await uploadStudioFile(new File([blob],'approved-scene.jpg',{type:blob.type||'image/jpeg'}),'scene-assets',controller.current.signal);
   const response=await apiFetch('/api/catalog/assets/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetType:'scene',data:{title:title.trim()||'原片风格场景',description:'用户确认的独立真实场景。\n'+scenePrompt,coverUrl:url,sourceImages:[url],reversePrompt:scenePrompt,provenance:'canvas',tags:['原片场景','已确认']}})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'场景入库失败');
   const id=data.item?.id;if(!id)throw new Error('入库响应缺少场景编号，请到资产库核对，勿重复保存');
   invalidateGlobalAssetCache();c.update(node.id,undefined,{settings:{beikeSavedSceneAssetId:id}});await onSave(c.read());setSaved(true);setStatus('场景已保存到场景资产库');
  }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}
 };
 return createPortal(<div className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4" onPointerDown={e=>e.stopPropagation()}><section ref={modal} role="dialog" aria-modal="true" aria-label="免费分镜图与场景" className="max-h-[75dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-zinc-900 p-5 text-stone-100"><h2>免费分镜图与场景</h2><p className="my-3 text-sm">本机默认每0.5秒抽一帧（30秒以上每秒一帧），自动检测并遮挡人脸，带时间码拼成分镜图，无模型调用费用。自动检测可能漏检，请检查后使用。{followsStoryboard?'复刻沿用原片各镜的场景、道具与光线。':'生成相似空场景与视频使用当前模型线路。'}</p><div className="flex gap-3"><button disabled={busy} onClick={()=>void extract()}>免费抽取分镜图</button><button disabled={!sheet||busy} onClick={()=>void saveToDownloadDir('原片分镜图.jpg',dataUrlToBlob(sheet))}>下载宫格图</button><button onClick={onClose}>关闭</button></div>{status&&<p className="my-3" role="status">{status}</p>}{error&&<p role="alert" className="my-3 text-red-300">{error}</p>}<div className="grid max-h-[40dvh] grid-cols-4 gap-2 overflow-y-auto">{frames.map(item=>followsStoryboard?<div key={item.time}><img src={item.dataUrl} alt={`${item.time}秒原片`} className="max-h-28 w-full object-contain"/><span>{item.time}s</span></div>:<button key={item.time} disabled={busy} onClick={()=>void choose(item)} aria-label={`使用${item.time}秒帧重建场景`}><img src={item.dataUrl} alt={`${item.time}秒原片`} className="max-h-28 w-full object-contain"/><span>{item.time}s · 选作场景</span></button>)}</div>{!followsStoryboard&&<div className="mt-4 flex gap-3"><input aria-label="场景资产名称" value={title} onChange={e=>setTitle(e.target.value)} className="bg-zinc-800 p-2"/><button disabled={busy||saved} onClick={()=>void saveAsset()}>{saved?'已入库':'确认满意，保存独立场景到资产库'}</button></div>}</section></div>,document.body);
}

import { useRef,useState } from 'react';
import { useAppStore } from '@client/store';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import { studioNodeLabel } from '../../model/studioConnections';
import { studioNodeTaskId,type StudioTaskCommands } from '../../model/studioTaskState';
import { VideoPromptOptimizationDetails } from '../video/VideoPromptOptimizationDetails';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { studioPromptBadge,studioPromptSkill,studioMatchingPromptOptimization } from '../../model/studioPromptBadge';
import { VideoPromptSkillBadge } from '../video/VideoPromptSkillDetails';

export function StudioTasksDialog({commands,onStop,onRetry,onResume,onClose,onSave}: {
  commands:StudioTaskCommands;onStop:(id:string,taskId:string)=>Promise<void>;
  onRetry:(id:string,taskId:string)=>Promise<void>;onResume:(id:string,taskId:string)=>Promise<void>;onClose:()=>void;onSave:()=>Promise<void>;
}) {
  const tasks=useAppStore(state=>state.generationTasks),sessions=useAppStore(state=>state.sessions);
  const [busy,setBusy]=useState<string[]>([]),[error,setError]=useState('');
  const locks=useRef(new Set<string>());
  const dialog=useModalDialog(true,onClose);
  const scene=commands.read();
  const nodes=scene.nodes.filter(node=>['gen-image','gen-video'].includes(node.type));
  async function run(id:string,action:()=>Promise<unknown>) {
    if(locks.current.has(id))return;
    locks.current.add(id);setBusy([...locks.current]);setError('');
    try {await action();}catch(cause){setError(cause instanceof Error?cause.message:'任务操作失败，请重试');}
    finally{locks.current.delete(id);setBusy([...locks.current]);}
  }
  return <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-2">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="画布生成任务" tabIndex={-1}
      className="grid max-h-[90dvh] w-full max-w-lg gap-3 overflow-auto rounded-xl border border-white/20 bg-[#202023] p-4 text-sm text-stone-200">
      <h2 className="font-semibold">画布生成任务</h2>
      <p className="text-xs text-stone-400">取消尚未提交的任务；已提交的任务仅停止画布等待，后台仍会继续。可继续等待或恢复结果。</p>
      {error&&<p role="alert" className="break-words text-red-300">{error}</p>}
      <ul className="grid min-w-0 gap-3">{nodes.map(node=>{
        const taskId=studioNodeTaskId(node),task=[...tasks,...sessions.flatMap(session=>session.tasks)].find(item=>item.id===taskId);
        const active=task&&isImageTaskActive(task.status),stopped=!!node.beikeTaskStopped;
        const status=task ? task.resultUrl?'已完成':active?task.submissionRecoveryRequired?'核对提交结果中':'生成中':task.failReason?.startsWith('已取消')?'已取消':'生成失败'
          :node.isGenerating?node.beikePromptReviewPending?'提示词待确认':node.beikePromptOptimizing?'正在优化提示词':'准备提交':stopped?'已取消':node.errorMsg?'生成失败':node.content?'已有结果':'尚未生成';
        const refs=task?.referenceImages || task?.images || [],videos=task?.referenceVideoUrls||[];
        const versions=(node.settings as {generationVersions?:unknown[]})?.generationVersions?.length||0;
        return <li key={node.id} className="min-w-0" aria-label={studioNodeLabel(node)}><SpotlightCard className="grid min-w-0 gap-2 !rounded-lg !border-white/15 !bg-[#202023] p-3 !shadow-none">
          <h3 className="break-words font-medium">{studioNodeLabel(node)}</h3>
          {node.type==='gen-video' && <VideoPromptSkillBadge skillId={studioPromptSkill(node,scene)?.id} model={studioPromptSkill(node,scene)?.modelIcon} label={studioPromptBadge(node,scene)}/>}
          <p role="status">{stopped&&status!=='已取消'?'已停止等待 · ':''}{status}{active&&task.progress?` ${task.progress}`:''}</p>
          <p className="text-xs text-stone-400">{versions} 个生成版本 · 本次参考图片 {refs.filter(url=>!videos.includes(url)).length} 张、视频 {videos.length} 段</p>
          {node.type==='gen-video' && !(node.settings as Record<string,unknown>)?.beikeOperation && <label className="flex min-h-9 items-center gap-2 text-xs">
            <input type="checkbox" disabled={!!node.isGenerating || busy.includes(node.id)} checked={(node.settings as Record<string,unknown>)?.beikeOptimizePrompt!==false} onChange={event=>{
              const enabled=event.target.checked;
              void run(node.id,async()=>{commands.update(node.id,node.beikeTaskId as string|undefined,{settings:{...(node.settings as Record<string,unknown>||{}),beikeOptimizePrompt:enabled}});await onSave();});
            }}/>生成前优化提示词（增加一次文本模型调用）
          </label>}
          <VideoPromptOptimizationDetails dark historical={!studioMatchingPromptOptimization(node,scene)} value={node.beikePromptOptimization as VideoPromptOptimization|undefined}/>
          <p tabIndex={0} aria-label="本次任务提示词" className="max-h-20 overflow-auto whitespace-pre-wrap break-words text-xs focus-visible:outline-2 focus-visible:outline-sky-300">{task?.prompt||String(node.prompt||'')}</p>
          {Boolean(task?.failReason||node.errorMsg)&&<p className="break-words text-xs text-red-300">{task?.failReason||String(node.errorMsg)}</p>}
          <div className="flex flex-wrap gap-2">
            {!!node.isGenerating&&taskId&&<button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2" onClick={()=>void run(node.id,()=>onStop(node.id,taskId))}>取消等待</button>}
            {stopped&&taskId&&active&&<button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2" onClick={()=>void run(node.id,()=>onResume(node.id,taskId))}>继续等待</button>}
            {stopped&&taskId&&task?.resultUrl&&<button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2" onClick={()=>void run(node.id,()=>onResume(node.id,taskId))}>恢复任务结果</button>}
            {!node.isGenerating&&taskId&&task&&!active&&!task.resultUrl&&<button disabled={busy.includes(node.id)} className="rounded border border-white/20 px-3 py-2" onClick={()=>void run(node.id,()=>onRetry(node.id,taskId))}>重试本次任务</button>}
            {!node.isGenerating&&!active&&<button className="rounded border border-white/20 px-3 py-2" onClick={()=>{setError('');void commands.run(node.id).catch(cause=>setError(String(cause)));}}>按当前连线生成</button>}
          </div>
        </SpotlightCard></li>;
      })}</ul>
      <button className="rounded-lg p-2 hover:bg-white/10" onClick={onClose}>关闭</button>
    </div>
  </div>;
}

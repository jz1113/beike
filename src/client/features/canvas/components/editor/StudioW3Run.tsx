import {useEffect,useRef,useState,type RefObject} from 'react';
import {createW3CopyRunner,type W3CopyStage} from '../../model/w3CopyRunner';
import {createDepthCopyRunner,type DepthCopyStage} from '../../model/depthCopyRunner';
import {stopStudioTask} from '../../model/studioTaskActions';
import type {StudioTaskCommands} from '../../model/studioTaskState';
import type {StudioScene} from '../../model/types';
import {finishW3CopyVideo} from '../../model/w3CopyDelivery';

const labels:Record<W3CopyStage|DepthCopyStage,string>={preflight:'正在检查素材与流程',analysis:'正在分析分镜',keyframe:'2/3 正在生成目标首帧',depth:'正在提取原视频深度动作',compose:'正在回贴原声并保存成片',video:'正在使用当前模型生成视频',delivery:'正在移除音轨并校验15秒成片',complete:'15秒无音轨视频已生成并保存'};
export function StudioW3Run({frame,enabled,onSave,kind}:{frame:RefObject<HTMLIFrameElement|null>;enabled:boolean;kind?:'depth-copy'|'w3-copy';onSave:(scene:StudioScene)=>Promise<void>}) {
  const save=useRef(onSave);save.current=onSave;
  const locked=useRef(false);
  const [busy,setBusy]=useState(false),[stage,setStage]=useState<W3CopyStage|DepthCopyStage|null>(null),[error,setError]=useState('');
  const [runner]=useState(()=>createW3CopyRunner({
    commands:()=>{
      const host=frame.current?.contentWindow as (Window&{beikeStudio?:{taskCommands?:StudioTaskCommands}})|null;
      if(!host?.beikeStudio?.taskCommands)throw new Error('画布尚未载入，请稍后重试');
      return host.beikeStudio.taskCommands;
    },
    save:scene=>save.current(scene),stopTask:stopStudioTask,finishVideo:finishW3CopyVideo,
  }));
  const [depthRunner]=useState(()=>createDepthCopyRunner({commands:()=>{const host=frame.current?.contentWindow as (Window&{beikeStudio?:{taskCommands?:StudioTaskCommands}})|null;if(!host?.beikeStudio?.taskCommands)throw new Error('画布尚未载入');return host.beikeStudio.taskCommands;},save:scene=>save.current(scene),stopTask:stopStudioTask}));
  const activeRunner=kind==='depth-copy'?depthRunner:runner;
  useEffect(()=>()=>{try{runner.cancel();depthRunner.cancel();}catch{/* The iframe may already be gone. */}},[runner,depthRunner]);
  const run=async(finishOnly=false)=>{
    if(locked.current)return;
    locked.current=true;
    setBusy(true);setError('');
    try{await (finishOnly?runner.finish(setStage):activeRunner.run(setStage));}
    catch(cause){setError(cause instanceof Error&&cause.name==='AbortError'?'已停止后续步骤；已提交的任务可在生成任务中查看':cause instanceof Error?cause.message:'复刻流程未完成，请检查生成任务');}
    finally{locked.current=false;setBusy(false);}
  };
  if(!enabled)return null;
  return <aside aria-label="视频复刻一键运行" className="absolute right-20 top-3 z-30 w-52 text-xs text-stone-200">
    <div className="flex h-8 items-center justify-end gap-2">
      <button title="按顺序分析分镜、生成主图和视频，沿用各节点当前选择的模型；深度复刻自动提取动作并回贴原声" disabled={busy} onClick={()=>void run()} className="h-8 flex-1 rounded-lg border border-white/15 bg-[#252527]/95 px-3 font-medium text-white hover:bg-[#353537] disabled:opacity-50">{busy?'复刻运行中…':kind==='depth-copy'?'一键运行视频复刻':'一键运行W3复刻'}</button>
      {busy&&<button onClick={()=>activeRunner.cancel()} title="停止后续步骤" className="h-8 rounded-lg border border-white/20 bg-[#252527] px-2">停止</button>}
    </div>
    {(stage||error)&&<div className="mt-2 grid gap-2 rounded-lg border border-white/15 bg-[#202023]/95 p-3 shadow-lg">
      {stage&&!error&&<p role="status" aria-live="polite">{stage==='complete'&&kind==='depth-copy'?'复刻视频与原声合成已完成并保存':labels[stage]}</p>}
      {error&&<p role="alert" className="break-words text-red-300">{error}</p>}
      {!busy&&error&&stage==='delivery'&&<button onClick={()=>void run(true)} className="rounded-lg border border-white/20 p-2">重试无声处理（不重新生成）</button>}
    </div>}
  </aside>;
}

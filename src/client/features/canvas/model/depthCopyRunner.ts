import type {StudioScene} from './types';
import type {StudioTaskCommands} from './studioTaskState';
import {resolveStudioInputs,studioNodeMedia} from './studioConnections';
import {videoWorkflowKind} from './videoWorkflowRecovery';
import {w3Settings} from './w3CopyRunPlan';
export type DepthCopyStage='preflight'|'analysis'|'keyframe'|'depth'|'video'|'compose'|'complete';
export function createDepthCopyRunner(host:{commands:()=>StudioTaskCommands;save:(scene:StudioScene)=>Promise<void>;stopTask:(id:string)=>void}) {
 let controller:AbortController|undefined,currentNode:string|undefined;
 return {cancel(){controller?.abort();const c=host.commands(),n=c.read().nodes.find(n=>n.id===currentNode);if(n?.isGenerating&&typeof n.beikeTaskId==='string'){host.stopTask(n.beikeTaskId);c.stop(n.id,n.beikeTaskId);}},async run(report:(stage:DepthCopyStage)=>void){
  if(controller)throw new Error('复刻流程已在运行，请勿重复提交');
  const active=new AbortController();controller=active;
  try{
   report('preflight');const c=host.commands(),scene=c.read();
   if(videoWorkflowKind(scene)!=='depth-copy')throw new Error('未找到完整的深度视频复刻流程');
   const find=(key:string)=>{const n=scene.nodes.find(n=>n.id.endsWith('-'+key));if(!n)throw new Error('复刻节点缺失：'+key);return n;};
   const analysis=find('analysis'),keyframe=find('keyframe'),depth=find('depth'),video=find('video'),compose=find('compose');
   for(const n of scene.nodes)if(n.isGenerating||w3Settings(n).isGenerating||w3Settings(n).textNodeIsAnalyzing)throw new Error('画布已有任务正在运行，请等待完成');
   for(const key of ['source','product','person']){const n=find(key);if(!studioNodeMedia(n).url||n.missingMedia)throw new Error('请先添加素材：'+n.nodeName);}
   if(!c.runText)throw new Error('画布运行器尚未就绪');
   resolveStudioInputs(scene,analysis.id);
   const inputKey=()=>JSON.stringify(c.read().nodes.map(n=>[n.id,n.prompt,w3Settings(n).model,w3Settings(n).textNodeDraftPrompt,w3Settings(n).duration,w3Settings(n).resolution,w3Settings(n).beikeVideoMode,n.type==='input-image'?studioNodeMedia(n).url:undefined,n.type==='text-node'&&n.id!==analysis.id?w3Settings(n).text:undefined]).concat([c.read().connections]));
   const key=inputKey(),assert=()=>{active.signal.throwIfAborted();if(inputKey()!==key)throw new Error('素材、模型、提示词或连线已修改，已停止后续步骤，请重新一键运行');};
   await host.save(c.read());assert();currentNode=analysis.id;report('analysis');
   await c.runText(analysis.id,active.signal);assert();
   const analyzed=c.read().nodes.find(n=>n.id===analysis.id)!;
   if(w3Settings(analyzed).beikeTextRunError||!String(w3Settings(analyzed).textNodeDisplayText||w3Settings(analyzed).text||analyzed.content||'').trim())throw new Error('分镜分析未成功，请检查05节点');
   await host.save(c.read());
   for(const [stage,node] of [['keyframe',keyframe],['depth',depth],['video',video],['compose',compose]] as const){
    assert();resolveStudioInputs(c.read(),node.id);const previous=c.read().nodes.find(n=>n.id===node.id)?.beikeLastTaskId;
    currentNode=node.id;report(stage);const ok=await c.run(node.id);assert();const result=c.read().nodes.find(n=>n.id===node.id);
    if(!ok||!result||result.isGenerating||result.errorMsg||(stage!=='compose'&&(!result.beikeLastTaskId||result.beikeLastTaskId===previous))||!studioNodeMedia(result).url)throw new Error(String(result?.errorMsg||'复刻步骤未完成，已停止后续生成'));
    await host.save(c.read());assert();
   }
   report('complete');
  }finally{controller=undefined;currentNode=undefined;}
 }};
}

import type {StudioScene} from './types';
import type {StudioTaskCommands} from './studioTaskState';
import {studioNodeMedia,resolveStudioInputs} from './studioConnections';
import {preflightW3Copy,w3CopyInputKey,w3Settings} from './w3CopyRunPlan';
import {w3CopyAnalysisPrompt} from './videoWorkflowPrompts';

export type W3CopyStage='preflight'|'analysis'|'keyframe'|'video'|'delivery'|'complete';
export interface W3CopyRunHost {
  commands:()=>StudioTaskCommands;
  save:(scene:StudioScene)=>Promise<void>;
  stopTask:(taskId:string)=>void;
  finishVideo:(node:StudioScene['nodes'][number],signal:AbortSignal)=>Promise<string>;
}

/** Each click produces new upstream results; old completed versions cannot satisfy this run. */
export function createW3CopyRunner(host:W3CopyRunHost) {
  let controller:AbortController|undefined;
  let currentNode:string|undefined;
  const deliver=async(signal:AbortSignal,report:(stage:W3CopyStage)=>void,assertCurrent:()=>void)=>{
    const commands=host.commands(),plan=w3CopyRunPlanForDelivery(commands.read());
    report('delivery');
    const video=plan.video,raw=String(w3Settings(video).beikeRawVideoUrl||studioNodeMedia(video).url);
    const url=await host.finishVideo(video,signal);assertCurrent();
    if(!url)throw new Error('无声成片处理失败，模型原始视频已保留，请勿重新提交生成');
    const settings=w3Settings(video),versions=settings.generationVersions as Array<Record<string,unknown>>|undefined;
    const selected=Number(settings.activeGenerationVersionIndex)||0;
    commands.update(video.id,String(video.beikeLastTaskId),{content:url,videoUrl:url,videoPosterUrl:undefined,generatedImages:[{fullUrl:url}],settings:{generatedImages:[{fullUrl:url}],videoPosterUrl:undefined,beikeRawVideoUrl:raw,beikeSilentDelivery:true,
      ...(versions?{generationVersions:versions.map((version,index)=>index===selected?{...version,content:url,originalUrl:url,beikeRawVideoUrl:raw}:version)}:{})}});
    await host.save(commands.read());assertCurrent();report('complete');
  };
  const cancel=()=>{
    if(!controller)return;
    controller?.abort();
    const commands=host.commands(),node=commands.read().nodes.find(n=>n.id===currentNode);
    if(node?.isGenerating&&typeof node.beikeTaskId==='string'){
      host.stopTask(node.beikeTaskId);commands.stop(node.id,node.beikeTaskId);
    }
  };
  return {cancel,async finish(report:(stage:W3CopyStage)=>void) {
    if(controller)throw new Error('W3流程已在运行，请勿重复提交');
    const active=new AbortController();controller=active;
    try{
      preflightW3Copy(host.commands().read());
      const key=w3CopyInputKey(host.commands().read());
      await deliver(active.signal,report,()=>{active.signal.throwIfAborted();if(w3CopyInputKey(host.commands().read())!==key)throw new Error('素材或连线已修改，处理已停止');});
    }finally{if(controller===active)controller=undefined;}
  },async run(report:(stage:W3CopyStage)=>void) {
    if(controller)throw new Error('W3流程已在运行，请勿重复提交');
    const active=new AbortController();controller=active;
    try {
      report('preflight');
      const commands=host.commands(),plan=preflightW3Copy(commands.read());
      if(!commands.runText)throw new Error('画布运行器尚未就绪，请重新打开画布');
      const update=(id:string,patch:Partial<StudioScene['nodes'][number]>)=>{
        const node=commands.read().nodes.find(n=>n.id===id);
        const expected=node?.beikeTaskId||node?.beikeLastTaskId;
        commands.update(id,typeof expected==='string'?expected:undefined,patch);
      };
      const instruction=String(w3Settings(plan.analysis).textNodeDraftPrompt||w3CopyAnalysisPrompt);
      update(plan.analysis.id,{prompt:instruction,content:'',errorMsg:undefined,settings:{text:'',textNodeDisplayText:undefined,aiGenerated:true,textNodeDraftPrompt:instruction,beikeTextRunError:undefined,_chatCompletedAt:undefined,_executeTrigger:undefined,textNodeIsAnalyzing:false}});
      const key=w3CopyInputKey(commands.read());
      const assertCurrent=()=>{
        active.signal.throwIfAborted();
        if(w3CopyInputKey(commands.read())!==key)throw new Error('素材、提示词、参数或连线已修改，本次流程已停止，请重新一键运行');
      };
      await host.save(commands.read());assertCurrent();
      currentNode=plan.analysis.id;report('analysis');
      await commands.runText(plan.analysis.id,active.signal);assertCurrent();
      const script=resolveStudioInputs(commands.read(),plan.keyframe.id);
      const analyzed=commands.read().nodes.find(n=>n.id===plan.analysis.id)!;
      const text=String(w3Settings(analyzed).textNodeDisplayText||w3Settings(analyzed).text||analyzed.content||'');
      if(script.duration!==15||script.audio!==false||[...text.matchAll(/【视频片段\s+\d+｜/g)].length!==1)
        throw new Error('分镜必须是单条15秒且为静音，已停止后续生成，请检查05分镜');
      await host.save(commands.read());assertCurrent();
      for(const [stage,id] of [['keyframe',plan.keyframe.id],['video',plan.video.id]] as const) {
        assertCurrent();
        const inputs=resolveStudioInputs(commands.read(),id);
        if(inputs.duration!==15||inputs.audio!==false)throw new Error('分镜必须是单条15秒且为静音，已停止后续生成，请检查05分镜');
        if(stage==='video'&&(inputs.refs.length!==1||inputs.refs[0].nodeId!==plan.keyframe.id||inputs.refs[0].type!=='image'))throw new Error('视频只允许提交本次目标首帧和分镜脚本');
        const before=commands.read().nodes.find(n=>n.id===id)?.beikeLastTaskId;
        currentNode=id;report(stage);
        const succeeded=await commands.run(id);assertCurrent();
        const result=commands.read().nodes.find(n=>n.id===id);
        if(!succeeded||!result||result.isGenerating||result.errorMsg||!result.beikeLastTaskId||result.beikeLastTaskId===before||!studioNodeMedia(result).url)
          throw new Error(String(result?.errorMsg||`${stage==='keyframe'?'首帧':'视频'}未成功生成，流程已停止`));
        await host.save(commands.read());assertCurrent();
      }
      await deliver(active.signal,report,assertCurrent);
    } finally {if(controller===active){controller=undefined;currentNode=undefined;}}
  }};
}

function w3CopyRunPlanForDelivery(scene:StudioScene) {
  const plan=preflightW3Copy(scene);
  if(!plan.video.beikeLastTaskId||!studioNodeMedia(plan.video).url)throw new Error('请先完成视频生成，再处理无声成片');
  return plan;
}

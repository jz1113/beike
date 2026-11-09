import { apiRequest } from '@client/shared/api/apiRequest';
import { resolveStudioInputs, studioEdgeSources, studioNodeKind, studioNodeMedia } from './studioConnections';
import { studioChannels } from './studioGeneration';
import { findStudioTask, type StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';
import { w3CopyAnalysisPrompt } from './videoWorkflowPrompts';

type Node=StudioScene['nodes'][number];
const w3Settings=(node:Node)=>node.settings as Record<string,unknown>||{};

export function w3PendingDelivery(node:Node):boolean {
  const settings=w3Settings(node);
  return settings.beikeVideoWorkflow==='w3-copy'&&!settings.beikeSilentDelivery
    &&!node.isGenerating&&!node.beikeTaskStopped&&!node.errorMsg
    &&typeof node.beikeLastTaskId==='string'&&Boolean(node.beikeLastTaskId&&studioNodeMedia(node).url);
}

export function w3CopyRunPlan(scene:StudioScene) {
  const videos=scene.nodes.filter(n=>w3Settings(n).beikeVideoWorkflow==='w3-copy');
  if(videos.length!==1)throw new Error('一键运行需要一套W3复刻流程，请保留一个W3视频节点');
  const incoming=(node:Node)=>[...new Set(scene.connections.filter(e=>e.to===node.id&&(!e.inputType||e.inputType==='default')).flatMap(e=>studioEdgeSources(e,scene)))].map(id=>{
    const source=scene.nodes.find(n=>n.id===id);
    if(!source)throw new Error('连线中的节点已不存在，请检查模板连线');
    return source;
  });
  const video=videos[0],sources=incoming(video);
  const analysis=sources.find(n=>n.type==='text-node'&&w3Settings(n).beikeTextResultRequired);
  const keyframe=sources.find(n=>n.type==='gen-image'&&w3Settings(n).beikeStoryboardKeyframe);
  if(sources.length!==2||!analysis||!keyframe)throw new Error('视频节点只能连接分镜脚本和目标首帧，请恢复模板连线');
  const imageInputs=incoming(keyframe),pictures=imageInputs.filter(n=>studioNodeKind(n)==='image');
  const analysisInputs=incoming(analysis),originals=analysisInputs.filter(n=>studioNodeKind(n)==='video');
  const analysisPictures=analysisInputs.filter(n=>studioNodeKind(n)==='image');
  if(pictures.length!==3||pictures.some(n=>n.type!=='input-image')||!imageInputs.some(n=>n.id===analysis.id)
    ||imageInputs.some(n=>!['image','text'].includes(studioNodeKind(n)||''))
    ||originals.length!==1||originals[0].type!=='input-image'||analysisPictures.length!==3
    ||analysisPictures.some(n=>!pictures.some(p=>p.id===n.id)))throw new Error('请连接原视频、人物、商品和背景四项素材，保持模板连线');
  return {video,analysis,keyframe,inputs:[originals[0],...pictures],notes:analysisInputs.filter(n=>studioNodeKind(n)==='text')};
}

export function preflightW3Copy(scene:StudioScene) {
  const plan=w3CopyRunPlan(scene);
  for(const node of scene.nodes)if(node.isGenerating||w3Settings(node).isGenerating||w3Settings(node).textNodeIsAnalyzing)
    throw new Error('画布已有任务正在运行，请等待完成后再一键运行');
  for(const node of plan.inputs)if(!studioNodeMedia(node).url||node.missingMedia)throw new Error(`请先添加或替换素材：${node.nodeName||node.id}`);
  const {beikeVideoMode, resolution, duration}=w3Settings(plan.video);
  if((beikeVideoMode||'first_frame')!=='first_frame'||(resolution||'768P')!=='768P'||(duration||'15s')!=='15s')
    throw new Error('W3一键交付要求08使用首帧生视频、768P、15秒，请先调整视频节点参数');
  resolveStudioInputs(scene,plan.analysis.id);
  return plan;
}

/** Ignore generated results and viewport movement; changing inputs, prompts or wiring stops the remaining steps. */
export function w3CopyInputKey(scene:StudioScene) {
  const plan=w3CopyRunPlan(scene),critical=new Set([plan.analysis.id,plan.keyframe.id,plan.video.id]);
  return JSON.stringify({
    inputs:plan.inputs.map(n=>{const m=studioNodeMedia(n);return [n.id,m.assetId||m.url];}),
    notes:plan.notes.map(n=>[n.id,w3Settings(n).text||n.content||n.prompt]),
    analysis:[w3Settings(plan.analysis).textNodeDraftPrompt,w3Settings(plan.analysis).textNodeChatModel],
    image:[plan.keyframe.prompt,w3Settings(plan.keyframe).model,w3Settings(plan.keyframe).ratio,w3Settings(plan.keyframe).gptImageQuality],
    video:[plan.video.prompt,w3Settings(plan.video).model,w3Settings(plan.video).beikeVideoMode,w3Settings(plan.video).resolution,w3Settings(plan.video).duration,w3Settings(plan.video).beikeVideoAudio,w3Settings(plan.video).beikeOptimizePrompt],
    edges:scene.connections.filter(e=>critical.has(e.to)).map(e=>[e.to,studioEdgeSources(e,scene),e.inputType||'default']),
  });
}

/** Sends only the completed task receipt to the local media processor. */
export async function finishW3CopyVideo(node:StudioScene['nodes'][number],signal:AbortSignal):Promise<string> {
  const task=findStudioTask(String(node.beikeLastTaskId||''));
  if(!task?.taskId||task.status!=='SUCCESS')throw new Error('找不到已完成的视频任务，模型原片已保留，请在生成任务中核对');
  signal.throwIfAborted();
  const response=await apiRequest('POST','/api/generate/video/silent',{signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId:task.taskId})});
  const data:unknown=await response.json().catch(()=>null);
  signal.throwIfAborted();
  const result=data as {success?:boolean;url?:unknown;durationSec?:number;hasAudio?:boolean;error?:string}|null;
  if(!response.ok||!result?.success||typeof result.url!=='string'||!result.url.startsWith('/storage/')||result.durationSec!==15||result.hasAudio!==false)
    throw new Error(result?.error||'无声成片处理失败，模型原片已保留；请重试无声处理，无需重新生成');
  return new URL(result.url,window.location.origin).href;
}

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
  const deliver=async(video:Node,signal:AbortSignal,report:(stage:W3CopyStage)=>void,assertCurrent:()=>void)=>{
    const commands=host.commands(),taskId=String(video.beikeLastTaskId);
    report('delivery');
    const url=await host.finishVideo(video,signal);assertCurrent();
    const current=commands.read().nodes.find(node=>node.id===video.id);
    if(!current||current.beikeLastTaskId!==taskId||!w3PendingDelivery(current))throw new Error('视频任务已变更，请核对当前任务后再处理');
    if(!url)throw new Error('无声成片处理失败，模型原始视频已保留，请勿重新提交生成');
    const versions=w3Settings(current).generationVersions as Array<Record<string,unknown>>|undefined;
    const index=versions?.findIndex(version=>version.id===taskId)??-1;
    const version=index>=0?versions?.[index]:undefined;
    const raw=String(version?.originalUrl||version?.content||studioNodeMedia(current).url);
    const generatedImages=[{fullUrl:url}];
    commands.update(video.id,taskId,{
      content:url,videoUrl:url,videoPosterUrl:undefined,generatedImages,
      settings:{generatedImages,videoPosterUrl:undefined,beikeRawVideoUrl:raw,beikeSilentDelivery:true,
        ...(version&&versions?{
          activeGenerationVersionIndex:index,
          generationVersions:versions.map((item,i)=>i===index?{...item,content:url,originalUrl:url,generatedImages,thumbnailUrl:'',beikeRawVideoUrl:raw}:item),
        }:{})},
    });
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
      const videos=host.commands().read().nodes.filter(w3PendingDelivery);
      if(videos.length!==1)throw new Error('请保留一个已生成、待无声交付的W3视频节点');
      await deliver(videos[0],active.signal,report,()=>active.signal.throwIfAborted());
    }finally{if(controller===active)controller=undefined;}
  },async run(report:(stage:W3CopyStage)=>void) {
    if(controller)throw new Error('W3流程已在运行，请勿重复提交');
    const active=new AbortController();controller=active;
    try {
      report('preflight');
      const commands=host.commands(),plan=preflightW3Copy(commands.read());
      if(!studioChannels().some(channel=>channel.kind==='video'&&channel.metasoH3))
        throw new Error('W3一键交付需要秘塔 MiniMax-H3，请先在模型设置中启用该线路');
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
        const succeeded=await commands.run(id,active.signal);assertCurrent();
        const result=commands.read().nodes.find(n=>n.id===id);
        if(!succeeded||!result||result.isGenerating||result.errorMsg||!result.beikeLastTaskId||result.beikeLastTaskId===before||!studioNodeMedia(result).url)
          throw new Error(String(result?.errorMsg||`${stage==='keyframe'?'首帧':'视频'}未成功生成，流程已停止`));
        await host.save(commands.read());assertCurrent();
      }
      const video=commands.read().nodes.find(node=>node.id===plan.video.id);
      if(!video||!w3PendingDelivery(video))throw new Error('请先完成视频生成，再处理无声成片');
      await deliver(video,active.signal,report,assertCurrent);
    } finally {if(controller===active){controller=undefined;currentNode=undefined;}}
  }};
}

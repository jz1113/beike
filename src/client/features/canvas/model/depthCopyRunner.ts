import { compilerSettings, inheritStudioCompiler, omniCopyPreparationInputs, omniCopyReferenceInputs, omniCopyVideoInputs, resolveStudioInputs, studioCompilerSource, studioNodeMedia } from './studioConnections';
import type { StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';
import { videoWorkflowKind } from './videoWorkflowRecovery';

export { omniCopyPreparationInputs, omniCopyReferenceInputs, omniCopyVideoInputs };
export type DepthCopyStage='preflight'|'analysis'|'keyframe'|'depth'|'optimize'|'video'|'compose'|'ready'|'complete';

/** Freeze generation inputs while respecting 07's ownership of 08's settings. */
export function depthCopyInputsKey(scene: StudioScene, options: {
  analysisId: string;
  videoId: string;
  editingCompilerId?: string;
  compilerConfirmed: boolean;
}): string {
  const { analysisId, videoId, editingCompilerId, compilerConfirmed } = options;
  const nodes = scene.nodes.map(raw => {
    if (raw.id === editingCompilerId) return { id: raw.id };
    const owner = raw.id === videoId && (editingCompilerId || compilerConfirmed)
      ? studioCompilerSource(scene, raw.id) : undefined;
    const node = owner ? inheritStudioCompiler(raw, scene) : raw;
    const settings = compilerSettings(node);
    // During 07 confirmation its own choices may change, including a simultaneous
    // materialization of those choices on 08. The other inputs stay frozen.
    const configuration = owner && owner.id === editingCompilerId && editingCompilerId
      ? { compilerSource: owner.id }
      : {
        model: settings.model,
        duration: settings.beikeScriptOnly === true ? undefined : settings.duration,
        resolution: settings.resolution,
        ratio: settings.ratio,
        mode: settings.beikeVideoMode,
        audio: settings.beikeVideoAudio,
        itemOrder: settings.inputItemOrder,
        imageOrder: settings.inputImageOrder,
        compilerSource: settings.beikeCompilerSource,
        scriptOnly: settings.beikeScriptOnly,
      };
    return {
      id: node.id,
      type: node.type,
      prompt: node.id===analysisId ? settings.textNodeDraftPrompt : node.prompt,
      configuration,
      draft: settings.textNodeDraftPrompt,
      media: node.type === 'input-image' || editingCompilerId ? studioNodeMedia(node) : undefined,
      text: node.type === 'text-node' && node.id !== analysisId && !settings.beikePromptCompiler ? settings.text : undefined,
      editingText: editingCompilerId ? [settings.textNodeDisplayText, settings.text] : undefined,
      approval: compilerConfirmed && settings.beikePromptCompiler
        ? [settings.text, settings.beikeCompilerApproved, settings.beikeCompilerInputKey] : undefined,
    };
  });
  return JSON.stringify({ nodes, connections: scene.connections });
}

export function createDepthCopyRunner(host:{commands:()=>StudioTaskCommands;save:(scene:StudioScene)=>Promise<void>;stopTask:(id:string)=>void}) {
 let controller:AbortController|undefined,currentNode:string|undefined;
 return {cancel(){controller?.abort();const c=host.commands(),n=c.read().nodes.find(n=>n.id===currentNode);if(n?.isGenerating&&typeof n.beikeTaskId==='string'){host.stopTask(n.beikeTaskId);c.stop(n.id,n.beikeTaskId);}},async run(report:(stage:DepthCopyStage)=>void){
  if(controller)throw new Error('复刻流程已在运行，请勿重复提交');
  const active=new AbortController();controller=active;
  try{
   report('preflight');const c=host.commands(),scene=c.read();
   if(videoWorkflowKind(scene)!=='depth-copy')throw new Error('未找到完整的深度视频复刻流程');
   const find=(key:string)=>{const n=scene.nodes.find(n=>n.id.endsWith('-'+key));if(!n)throw new Error('复刻节点缺失：'+key);return n;};
   const analysis=find('analysis'),keyframe=find('keyframe'),video=find('video');
   const depth=scene.nodes.find(n=>n.id.endsWith('-depth')),compose=scene.nodes.find(n=>n.id.endsWith('-compose'));
   for(const n of scene.nodes)if(n.isGenerating||compilerSettings(n).isGenerating||compilerSettings(n).textNodeIsAnalyzing)throw new Error('画布已有任务正在运行，请等待完成');
   for(const key of ['source','product','person']){const n=find(key);if(!studioNodeMedia(n).url||n.missingMedia)throw new Error('请先添加素材：'+n.nodeName);}
   if(!c.runText)throw new Error('画布运行器尚未就绪');
   resolveStudioInputs(scene,analysis.id);
   let compilerConfirmed=false;
   const inputKey=(editingCompilerId?:string)=>depthCopyInputsKey(c.read(),{analysisId:analysis.id,videoId:video.id,editingCompilerId,compilerConfirmed});
   let key=inputKey();const assert=()=>{active.signal.throwIfAborted();if(inputKey()!==key)throw new Error('素材、模型、提示词或连线已修改，已停止后续步骤，请重新一键运行');};
   await host.save(c.read());assert();currentNode=analysis.id;report('analysis');
   await c.runText(analysis.id,active.signal);assert();
   const analyzed=c.read().nodes.find(n=>n.id===analysis.id)!;
   if(compilerSettings(analyzed).beikeTextRunError||!String(compilerSettings(analyzed).textNodeDisplayText||compilerSettings(analyzed).text||analyzed.content||'').trim())throw new Error('分镜分析未成功，请检查05节点');
   if(compilerSettings(video).beikeScriptOnly||compilerSettings(video).beikeCompilerSource)omniCopyVideoInputs([String(compilerSettings(analyzed).textNodeDisplayText||compilerSettings(analyzed).text||analyzed.content)],'【使用片段：01】');
   await host.save(c.read());
   const preparations=scene.nodes.filter(n=>compilerSettings(n).beikeReferencePreparationRole&&compilerSettings(n).beikeReferencePreparationEnabled===true);
   const stages:Array<[DepthCopyStage,StudioScene['nodes'][number]]>=[...preparations.map(n=>['keyframe',n] as [DepthCopyStage,StudioScene['nodes'][number]]),['keyframe',keyframe]];
   if(depth&&!compilerSettings(video).beikeCompilerSource&&compilerSettings(video).beikeScriptOnly!==true)stages.push(['depth',depth]);
   const compiler=scene.nodes.find(n=>compilerSettings(n).beikePromptCompiler===true);
   if(compiler)stages.push(['optimize',compiler]);
   stages.push(['video',video]);if(compose)stages.push(['compose',compose]);
   for(const [stage,node] of stages){
    if(stage==='optimize') {
     assert();currentNode=node.id;report(stage);
     if(!c.runCompiler)throw new Error('请先打开07优化并确认提示词');
     const upstreamKey=inputKey(node.id);
     const approved=await c.runCompiler(node.id);active.signal.throwIfAborted();
     if(inputKey(node.id)!==upstreamKey)throw new Error('素材、模型、提示词或连线已修改，已停止后续步骤，请重新一键运行');
     if(!approved) {
      const failed=c.read().nodes.find(n=>n.id===node.id);
      throw new Error(String(failed?.errorMsg||'07提示词未确认，未提交视频'));
     }
     resolveStudioInputs(c.read(),video.id);compilerConfirmed=true;key=inputKey();
     await host.save(c.read());assert();resolveStudioInputs(c.read(),video.id);report('ready');return;
    }
    if(stage==='depth'&&compilerSettings(video).beikeScriptOnly===true)continue;
    if(stage==='compose'&&(compilerSettings(video).beikeScriptOnly===true||compilerSettings(video).beikeCompilerSource)&&resolveStudioInputs(c.read(),video.id).soundMode!=='保留原声') {
     assert();const current=c.read().nodes.find(n=>n.id===video.id)!;
     c.update(node.id,typeof node.beikeTaskId==='string'?node.beikeTaskId:undefined,{content:studioNodeMedia(current).url,videoUrl:studioNodeMedia(current).url,errorMsg:'',isGenerating:false});
     await host.save(c.read());assert();continue;
    }
    assert();resolveStudioInputs(c.read(),node.id);const previous=c.read().nodes.find(n=>n.id===node.id)?.beikeLastTaskId;
    currentNode=node.id;report(stage);const ok=await c.run(node.id,active.signal);assert();const result=c.read().nodes.find(n=>n.id===node.id);
    if(!ok||!result||result.isGenerating||result.errorMsg||(stage!=='compose'&&(!result.beikeLastTaskId||result.beikeLastTaskId===previous))||!studioNodeMedia(result).url)throw new Error(String(result?.errorMsg||'复刻步骤未完成，已停止后续生成'));
    await host.save(c.read());assert();
   }
   report('complete');
  }finally{controller=undefined;currentNode=undefined;}
 }};
}

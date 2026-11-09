import type { VideoPromptContext } from '@client/shared/agent/videoPromptOperation';
import { optimizeVideoPrompt, recoverVideoPromptOptimization, type VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { videoPromptSkill, type VideoPromptInput } from '@shared/domain/assistant/skills/videoPromptSkills';
import { resolveVideoMode } from '@shared/domain/media/videoCapabilities';
import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import {
  compilerSettings,
  inheritStudioCompiler,
  saveStudioCompilerDraft,
  studioCompilerKey,
  studioCompilerParameters,
  studioCompilerSelectionPrompt,
  studioCompilerSkills,
  studioVideoSettings,
  type StudioCompilerPreview,
} from './studioCompilerState';
import { resolveStudioInputs } from './studioConnections';
import { normalizeStudioReferenceNumbers, studioChannels, type prepareStudioGeneration, type StudioRequest } from './studioGeneration';
import { studioNodeTaskId, type StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';

export type VideoPromptReview = {
  id: string;
  optimization: VideoPromptOptimization;
  onDraft?: (prompt: string) => void;
  confirm: (prompt: string) => void;
  cancel: () => void;
};

export function videoPromptReviewKey(input:VideoPromptInput,refs:readonly unknown[],route:string):string {
  return JSON.stringify({input,refs,route});
}

/** A previous model, route, mode or upstream Skill version must never describe the current selection. */
export function videoPromptBindingMatches(value:VideoPromptOptimization|undefined,target:Pick<VideoPromptInput,'model'|'mode'>,route:string):boolean {
  const skill=videoPromptSkill(target.model,target.mode);
  if(!value || !skill || value.skillId!==skill.id || value.revision!==skill.source?.revision)return false;
  try {
    const binding=JSON.parse(value.inputKey || '');
    return binding.route===route && typeof binding.input?.model==='string'
      && canonicalModelId(binding.input.model)===canonicalModelId(target.model) && binding.input.mode===target.mode;
  } catch {return false;}
}

export function reusableVideoPromptDraft(value:VideoPromptOptimization|undefined,input:VideoPromptInput,refs:readonly unknown[],route:string) {
  return value && !value.submitted && value.inputKey===videoPromptReviewKey(input,refs,route)
    && videoPromptBindingMatches(value,input,route) ? value : undefined;
}

/** No default approval: undefined is cancellation and invalid drafts cannot become task prompts. */
export function approveVideoPrompt(optimization:VideoPromptOptimization,prompt:string|undefined) {
  if(prompt===undefined)return;
  if(!prompt.trim() || prompt.length>20000)throw new Error('请填写 20000 字以内的视频提示词');
  return {...optimization,draft:prompt,submitted:prompt};
}

export async function reviewVideoPrompt(optimization:VideoPromptOptimization,signal:AbortSignal,
  requestReview:(value:VideoPromptOptimization,signal:AbortSignal,onDraft?:(prompt:string)=>void)=>Promise<string|undefined>,onDraft?:(prompt:string)=>void) {
  signal.throwIfAborted();
  const prompt=await requestReview(optimization,signal,onDraft);
  signal.throwIfAborted();
  return approveVideoPrompt(optimization,prompt);
}

/** Save the scene identity before dispatch, independently of the native video's temporary task ID. */
export function studioPromptContext(projectId:string,nodeId:string,stage:VideoPromptContext['stage'],commands:StudioTaskCommands,save:(scene:StudioScene)=>Promise<void>,runId:string=crypto.randomUUID()):VideoPromptContext {
 const node=commands.read().nodes.find(n=>n.id===nodeId);
 if(!node)throw new Error('原提示词节点已不存在，未提交优化');
 const update=async(patch:Record<string,unknown>)=>{
  const current=commands.read().nodes.find(n=>n.id===nodeId);
  if(!current)throw new Error('原提示词节点已不存在');
  commands.update(nodeId,studioNodeTaskId(current),patch);await save(commands.read());
 };
 return {projectId,nodeId,stage,runId,previousOperationId:typeof node.beikePromptOperationId==='string'?node.beikePromptOperationId:undefined,
  recoveryOnly:node.beikePromptRecoveryRequired===true||node.beikePromptOptimizing===true,
  onOperation:id=>update({beikePromptOperationId:id,beikePromptRecoveryRequired:true}),onResolved:()=>update({beikePromptRecoveryRequired:false})};
}

/** Recover 07 before current model, Skill and upstream input validation. Never relabel an old draft. */
export async function recoverStudioCompilerOperation(context:VideoPromptContext,commands:StudioTaskCommands,save:(scene:StudioScene)=>Promise<void>,signal:AbortSignal) {
 const value=await recoverVideoPromptOptimization(context,signal);
 if(!value)return;
 const node=commands.read().nodes.find(n=>n.id===context.nodeId);
 let matches=false;
 try{matches=!!node&&studioCompilerKey(node,resolveStudioInputs(commands.read(),context.nodeId))===value.inputKey;}catch{/* Current inputs may no longer be usable. */}
 if(!matches||!value.operationInput){await context.onResolved?.();throw new Error('原优化已完成，但上游或07配置已修改；原稿已保留，请核对后按当前输入重新优化');}
 const compiled={...value,compiler:true};
 await saveStudioCompilerDraft(commands,context.nodeId,{value:compiled,key:value.inputKey!,input:value.operationInput},compiled.optimized,save);
 return {value:compiled,key:value.inputKey!,input:value.operationInput};
}

export function recoverStudioPromptOperationNode(node:StudioScene['nodes'][number]) {
 if(!node.beikePromptRecoveryRequired&&!node.beikePromptOptimizing)return node;
 // An enqueued video owns its own recovery. This stage only repairs interrupted preflight work.
 if(node.beikeTaskRecord)return node;
 return {...node,isGenerating:false,beikeTaskId:undefined,beikePromptOptimizing:false,beikePromptRecoveryRequired:true,
  settings:{...compilerSettings(node),isGenerating:false,_preGenerateSnapshot:undefined},errorMsg:'原提示词优化结果待核对，再次运行只查询原操作，不会重新优化'};
}

/** Restore the pre-video stage without submitting a video or validating today's model/media. */
export async function recoverStudioVideoPromptOperation(projectId:string,nodeId:string,commands:StudioTaskCommands,save:(scene:StudioScene)=>Promise<void>) {
 const context=studioPromptContext(projectId,nodeId,'video',commands,save);
 const value=await recoverVideoPromptOptimization(context,new AbortController().signal);
 if(!value)return false;
 const node=commands.read().nodes.find(n=>n.id===nodeId);
 if(!node)throw new Error('原视频节点已不存在，原优化稿已保留');
 commands.update(nodeId,studioNodeTaskId(node),{beikePromptOptimization:value,beikePromptRecoveryRequired:false,beikePromptOptimizing:false,
  errorMsg:'原优化稿已恢复，请核对后再次生成；输入已修改时会重新优化。'});
 try{await save(commands.read());}catch(error){commands.update(nodeId,studioNodeTaskId(node),{beikePromptRecoveryRequired:true});throw error;}
 return true;
}

export async function optimizeStudioGeneration(prepared: NonNullable<ReturnType<typeof prepareStudioGeneration>>, request: StudioRequest, signal: AbortSignal, cached:VideoPromptOptimization|undefined,context:VideoPromptContext) {
  const recovered=await recoverVideoPromptOptimization(context,signal);
  if(request.scriptOnly===true && request.optimizePrompt===false)throw new Error('分镜复刻需要先启用所选模型的提示词优化，视频尚未提交');
  const channel = studioChannels().find(model => model.id === request.model);
  if(request.scriptOnly===true && channel?.kind==='video' && !videoPromptSkill(channel.modelId,prepared.task.videoRefMode))throw new Error('当前模型没有对应的提示词优化技能，请选择已支持优化的视频模型，视频尚未提交');
  if (channel?.kind !== 'video' || request.optimizePrompt === false) return prepared;
  const input={
    scriptOnly:request.scriptOnly,model: channel.modelId, prompt: prepared.task.prompt, mode: prepared.task.videoRefMode,
    duration: prepared.task.videoDuration, aspect: prepared.settings?.ratio, resolution: prepared.settings?.resolution, audio: prepared.task.generateAudio,
    images: request.refs.filter(ref => typeof ref === 'string' || ref.type === 'image').length,
    videos: request.refs.filter(ref => typeof ref !== 'string' && ref.type === 'video').length,
    ...(prepared.task.referenceAudioUrls?.length ? {audios:prepared.task.referenceAudioUrls.length} : {}),
  };
  const inputKey=videoPromptReviewKey(input,request.refs,request.model);
  if(recovered&&recovered.inputKey!==inputKey){await context.onResolved?.();throw new Error('原优化已完成，但输入已修改；原稿已保留，请核对后按当前输入重新优化');}
  const optimization=recovered ?? reusableVideoPromptDraft(cached,input,request.refs,request.model) ?? await optimizeVideoPrompt(input,signal,{...context,inputKey});
  if(optimization?.operationId&&optimization.inputKey!==inputKey){await context.onResolved?.();throw new Error('原优化已完成，但输入已修改；原稿已保留，请核对后按当前输入重新优化');}
  if(request.scriptOnly && !optimization)throw new Error('所选模型未返回可用的优化稿，视频尚未提交');
  return optimization ? { ...prepared, task: { ...prepared.task, prompt: optimization.optimized }, optimization:{...optimization,inputKey} } : prepared;
}

/** Track inputs rather than UI/busy state, so saving a draft or moving a node does not invalidate it. */
export function studioPromptPreparationKey(scene:StudioScene,nodeId:string):string {
  const node=scene.nodes.find(item=>item.id===nodeId);
  if(!node)throw new Error('生成节点已不存在');
  const effective=node.type==='gen-video'?inheritStudioCompiler(node,scene):node;
  const settings={...effective.settings as Record<string,unknown>};
  // Renderer controls and inherited settings can use different aliases for
  // the same effective values (for example a first-frame model's Auto ratio).
  if(effective.type==='gen-video'){
    const video=studioVideoSettings(effective,scene);
    if(video)Object.assign(settings,{beikeVideoMode:video.beikeSelectedMode,ratio:video.selectedRatio,resolution:video.selectedResolution,duration:video.selectedDuration,...(video.showAudio?{beikeVideoAudio:video.audioEnabled}:{})});
  }
  const channel=studioChannels().find(item=>item.id===settings.model);
  const inputs=resolveStudioInputs(scene,nodeId);
  return JSON.stringify({type:node.type,model:settings.model,route:channel?.route,upstream:channel?.modelId,metasoH3:channel && 'metasoH3' in channel ? channel.metasoH3 : undefined,
    prompt:inputs.prompt,refs:inputs.refs,ratio:settings.ratio,resolution:settings.resolution,duration:('duration' in inputs ? inputs.duration : undefined) ?? settings.duration,audio:'audio' in inputs ? inputs.audio : undefined,workflow:settings.beikeVideoWorkflow,
    videoMode:settings.beikeVideoMode,videoAudio:settings.beikeVideoAudio,quality:settings.gptImageQuality,optimize:settings.beikeOptimizePrompt!==false,operation:settings.beikeOperation});
}

export function assertStudioPromptPreparation(scene:StudioScene,nodeId:string,taskId:string,key:string):void {
  const node=scene.nodes.find(item=>item.id===nodeId);
  if(!node?.isGenerating || node.beikeTaskId!==taskId || studioPromptPreparationKey(scene,nodeId)!==key)
    throw new Error('模型、参数或上游内容已修改，视频尚未提交，请按当前模型重新优化并确认');
}

function selection(node:StudioScene['nodes'][number],scene?:StudioScene) {
  const settings=node.settings as Record<string,unknown>|undefined;
  if(node.type!=='gen-video' || settings?.beikeOperation)return;
  if(settings?.beikeCompilerSource)return;
  if(settings?.beikeOptimizePrompt===false)return;
  const channel=studioChannels().find(item=>item.id===settings?.model);
  if(channel?.kind!=='video')return;
  let refs:Array<{type:string}>=[];
  try {if(scene)refs=resolveStudioInputs(scene,node.id).refs;}catch { /* Invalid references are explained when generation is requested. */ }
  const mode=typeof settings?.beikeVideoMode==='string' ? settings.beikeVideoMode==='auto'?undefined:settings.beikeVideoMode : settings?.beikeVideoWorkflow==='w3-copy'?'first_frame':undefined;
  return {model:channel.modelId,route:channel.id,mode:resolveVideoMode(channel.modelId,mode ?? (refs.some(ref=>ref.type==='audio')?'omni':undefined),refs.filter(ref=>ref.type==='image').length,refs.filter(ref=>ref.type==='video').length,getGatewayClientBaseUrl(channel.route))};
}

export function studioPromptSkill(node:StudioScene['nodes'][number],scene?:StudioScene) {
  const target=selection(node,scene);
  return target?videoPromptSkill(target.model,target.mode):undefined;
}

export function studioMatchingPromptOptimization(node:StudioScene['nodes'][number],scene?:StudioScene) {
  const target=selection(node,scene),value=node.beikePromptOptimization as VideoPromptOptimization|undefined;
  return target && videoPromptBindingMatches(value,target,target.route)?value:undefined;
}

export function studioPromptBadge(node:StudioScene['nodes'][number],scene?:StudioScene):string {
  const settings=node.settings as Record<string,unknown>|undefined;
  if(node.type!=='gen-video' || settings?.beikeOperation)return '';
  if(settings?.beikeCompilerSource)return '';
  if(settings?.beikeOptimizePrompt===false)return '提示词技能：未启用';
  const target=selection(node,scene),skill=target?videoPromptSkill(target.model,target.mode):undefined;
  if(!skill || !target)return '提示词技能：暂无匹配';
  const optimization=studioMatchingPromptOptimization(node,scene);
  const name=skill.displayName || skill.name;
  if(node.beikePromptReviewPending && optimization)return `待确认 · ${name}`;
  if(node.beikePromptOptimizing)return `优化中 · ${name}`;
  if(optimization)return `${optimization.submitted?'已用':'已优化'} · ${name}`;
  return `待用 · ${name}`;
}

/** Resolve the saved node settings and recover an existing request before making a new one. */
export async function runStudioCompiler({projectId,nodeId,commands,onSave,textModel,signal}:{
 projectId:string;nodeId:string;commands:StudioTaskCommands;onSave:(scene:StudioScene)=>Promise<void>;textModel?:string;signal:AbortSignal;
}):Promise<StudioCompilerPreview> {
 const context=studioPromptContext(projectId,nodeId,'compiler',commands,onSave);
 const recovered=await recoverStudioCompilerOperation(context,commands,onSave,signal);
 if(recovered)return recovered;
 signal.throwIfAborted();
 const previous=commands.read(),node=previous.nodes.find(n=>n.id===nodeId);
 if(!node)throw new Error('07节点已不存在');
 const initial=compilerSettings(node),optimizer=String(textModel||initial.textNodeChatModel||'');
 const selectedOptimizer=studioChannels().find(c=>c.kind==='chat'&&c.id===optimizer);
 const channel=studioCompilerSkills().find(c=>c.id===initial.model);
 if(!selectedOptimizer||!channel)throw new Error('请在 07 选择可用的优化模型和官方技能');
 const {duration,resolution}=studioCompilerParameters(node,previous);
 const settings={...initial,textNodeChatModel:optimizer,duration,resolution,beikeCompilerApproved:undefined};
 const scriptOnly=initial.beikeScriptOnly===true;
 const sourcePrompt=String(node.prompt||'');
 const prompt=scriptOnly&&!sourcePrompt.includes('【使用片段')?studioCompilerSelectionPrompt(sourcePrompt,'01'):sourcePrompt;
 const current={...node,prompt,settings};
 const proposed={...previous,nodes:previous.nodes.map(n=>n.id===nodeId?current:n)};
 const raw=resolveStudioInputs(proposed,nodeId),key=studioCompilerKey(current,raw);
 const config=studioVideoSettings({...current,type:'gen-video'},proposed);
 if(!config)throw new Error('请选择支持全能参考的视频模型');
 if(config.selectedDuration!==`${raw.duration}s`)throw new Error(scriptOnly?'当前模型不支持所选分镜时长，请调整分镜或模型':'当前模型不支持此时长，请调整时长或模型');
 const input:VideoPromptInput={scriptOnly,model:channel.modelId,mode:'omni',prompt:normalizeStudioReferenceNumbers(raw.prompt,raw.refs.map(r=>({type:r.type==='video'?'video' as const:'image' as const}))).replace(/@文本(\d+)/g,'文本$1'),duration:raw.duration,audio:raw.audio,aspect:config.selectedRatio,resolution:config.selectedResolution,images:raw.refs.filter(r=>r.type==='image').length,videos:0};
 commands.update(nodeId,studioNodeTaskId(node),{prompt,settings});
 await onSave(commands.read());
 const value=await optimizeVideoPrompt(input,signal,{...context,inputKey:key,textModel:selectedOptimizer.route});
 signal.throwIfAborted();
 if(!value)throw new Error('当前模型没有可用提示词技能');
 if(value.operationId&&value.inputKey!==key){await context.onResolved?.();throw new Error('原优化已完成，但上游或07配置已修改；原稿已保留，请核对后按当前输入重新优化');}
 const latest=commands.read(),latestNode=latest.nodes.find(n=>n.id===nodeId)!;
 if(studioCompilerKey(latestNode,resolveStudioInputs(latest,nodeId))!==key)throw new Error('上游或07配置已修改，请重新优化');
 const compiled={...value,compiler:true};
 await saveStudioCompilerDraft(commands,nodeId,{value:compiled,key,input},compiled.optimized,onSave);
 return {value:compiled,key,input};
}

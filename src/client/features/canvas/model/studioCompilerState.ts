import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { videoPromptOutput } from '@client/shared/agent/videoPromptOutput';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { videoPromptSkill, type VideoPromptInput } from '@shared/domain/assistant/skills/videoPromptSkills';
import { isVeoNativeBase, veoExtensionHint } from '@shared/domain/media/veoChannels';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { resolveVideoMode, videoDurationOptions, videoModeLabel, videoModes, videoRatioLocked, videoRatioOptions, videoResolutionOptions } from '@shared/domain/media/videoCapabilities';
import { isMetasoH3 } from '@shared/domain/media/videoChannels';
import { compilerSettings, inheritStudioCompiler, mirrorStudioCompilerConnections, resolveStudioInputs, stripVideoPromptRoles, studioCompilerKey, studioCompilerKeyMatches, studioCompilerSource, studioVideoPromptRoles } from './studioConnections';
import { studioChannels } from './studioGeneration';
import type { StudioTaskCommands } from './studioTaskState';
import type { CanvasProject, StudioScene } from './types';

export { compilerSettings, inheritStudioCompiler, mirrorStudioCompilerConnections, stripVideoPromptRoles, studioCompilerKey, studioCompilerKeyMatches, studioCompilerSource, studioVideoPromptRoles };

type EditorReference={nodeId:string;mediaType:string;position1Based:number|string};
type PreviewReference={nodeId:string;position1Based:number};

function remapPreviewMentions(prompt:string,key:unknown,refs:PreviewReference[]) {
 let previous:unknown;
 try {if(typeof key==='string')previous=JSON.parse(key)?.inputs?.refs;}catch { /* An older draft may have no saved bindings. */ }
 const ids=Array.isArray(previous)?previous.map(ref=>ref?.nodeId):[];
 const positions=new Map(refs.map(ref=>[ref.nodeId,ref.position1Based]));
 return prompt.replace(/@(?:图片|视频|音频|文本|img)?(\d+)/gi,(token:string,number:string)=>{
  if(/^@(?:视频|音频|文本)/.test(token))return '（引用待核对）';
  const position=positions.get(ids[Number(number)-1]);
  return position===undefined?'（引用待核对）':`@图片${position}`;
 });
}

/** A live preview may show an unconfirmed draft; only resolveStudioInputs authorizes generation. */
export function studioVideoPromptPreview(scene:StudioScene,nodeId:string,visible:ReadonlyArray<EditorReference>=[]) {
 try {
  const inputs=resolveStudioInputs(scene,nodeId);
  return {prompt:inputs.prompt,ready:true,refs:inputs.refs.map(({nodeId},i)=>({nodeId,position1Based:i+1}))};
 } catch {
  let source:ReturnType<typeof studioCompilerSource>;
  try {source=studioCompilerSource(scene,nodeId);}catch{return;}
  if(!source)return;
  const settings=compilerSettings(source);
  let inputs:ReturnType<typeof resolveStudioInputs>|undefined;
  try {inputs=resolveStudioInputs(scene,source.id);}catch { /* Show the connected refs while upstream is still preparing. */ }
  const refs=inputs?inputs.refs.map(({nodeId},i)=>({nodeId,position1Based:i+1})):
   visible.flatMap(ref=>ref.mediaType==='image'&&ref.nodeId&&typeof ref.position1Based==='number'?[{nodeId:ref.nodeId,position1Based:ref.position1Based}]:[]);
  const optimization=source.beikePromptOptimization as {draft?:string;submitted?:string}|undefined;
  const draft=!optimization?.submitted&&optimization?.draft?.trim();
  const body=draft||String(settings.text||settings.textNodeDisplayText||source.content||'').trim();
  const key=draft?(source.beikeCompilerReview as {key?:string}|undefined)?.key:settings.beikeCompilerInputKey;
  const roles=studioVideoPromptRoles(scene,refs,settings.beikeStoryboardSceneSourceId);
  const previewBody=body?remapPreviewMentions(stripVideoPromptRoles(body),key,refs):inputs?stripVideoPromptRoles(inputs.prompt):'';
  const prompt=[roles,previewBody].filter(Boolean).join('\n\n');
  return {prompt,ready:false,refs};
 }
}

/** Use the host catalog for channel IDs; vendor predicates in the renderer cannot identify them. */
export function studioVideoSettings(node:StudioScene['nodes'][number],scene?:StudioScene) {
  let inherited:ReturnType<typeof studioCompilerSource>;
  if(scene && node.type==='gen-video')try {
    inherited=studioCompilerSource(scene,node.id);
    if(inherited)node=inheritStudioCompiler(node,scene);
  }catch { /* Keep the controls available to inspect or repair an invalid connection. */ }
  const settings=node.settings as Record<string,unknown> || {};
  if(node.type!=='gen-video' || settings.beikeOperation)return;
  const channel=studioChannels().find(item=>item.id===settings.model && item.kind==='video');
  if(!channel)return;
  const model=channel.modelId,baseUrl=getGatewayClientBaseUrl(channel.route);
  const profile=getVideoModelById(model,baseUrl);
  if(!profile)return;
  let refs:Array<{type:string}>=[];
  let scriptAudio:boolean|undefined,scriptDuration:number|undefined;
  try {if(scene){const inputs=resolveStudioInputs({...scene,nodes:scene.nodes.map(item=>item.id===node.id?node:item)},node.id);refs=inputs.refs;scriptAudio=inputs.audio;scriptDuration=inputs.duration;}}catch { /* Submission reports missing inputs. */ }
  const modes=videoModes(model,baseUrl);
  const preferred=typeof settings.beikeVideoMode==='string'?settings.beikeVideoMode:settings.beikeVideoWorkflow==='w3-copy'?'first_frame':'auto';
  const selected=preferred==='auto'||modes.some(item=>item.id===preferred)?preferred:'auto';
  const copy=settings.beikeVideoWorkflow==='w3-copy' && selected==='first_frame' && isMetasoH3(model,baseUrl);
  const imageCount=refs.filter(item=>item.type==='image').length,videoCount=refs.filter(item=>item.type==='video').length;
  const automatic=resolveVideoMode(model,refs.some(item=>item.type==='audio')?'omni':undefined,imageCount,videoCount,baseUrl);
  const mode=selected==='auto'?automatic:resolveVideoMode(model,selected,imageCount,videoCount,baseUrl);
  const resolutions=videoResolutionOptions(model,mode,baseUrl) || profile.supportedResolutions;
  const resolution=resolveVideoResolution(copy?'768P':String(settings.resolution || resolutions[0]),resolutions);
  const durations=videoDurationOptions(model,resolution,mode,baseUrl);
  const requested=(inherited||settings.beikeScriptOnly===true)&&scriptDuration!==undefined?scriptDuration:parseFloat(String(settings.duration || '5s'));
  const duration=durations.reduce((best,value)=>Math.abs(value-requested)<Math.abs(best-requested)?value:best,durations[0]);
  const locked=videoRatioLocked(model,mode,baseUrl),ratios=videoRatioOptions(model,mode,baseUrl);
  const ratio=String(settings.ratio || 'adaptive').replace(/^Auto$/i,'adaptive');
  const aspect=locked?'adaptive':ratios.includes(ratio)?ratio:ratios[0];
  return {
    inheritedFrom:inherited?.id,
    confirmedAudio:inherited?scriptAudio:undefined,
    beikeModeOptions:[{value:'auto',label:`自动 · ${videoModeLabel(automatic)}`},...modes.map(item=>({value:item.id,label:item.name}))],
    beikeSelectedMode:selected,modeLayout:'pills',showGenMode:true,
    ratioOptions:ratios.map(item=>item==='adaptive'?'Auto':item),selectedRatio:aspect==='adaptive'?'Auto':aspect,
    showRatioSection:mode!=='motion_control',showResolutionSection:true,showDurationSection:!['edit','motion_control'].includes(mode),
    videoEditLocksAdaptive:locked,ratioHint:locked?'跟随原素材':undefined,
    resolutionOptions:resolutions,selectedResolution:resolution,resolutionField:'resolution',
    durationHint:veoExtensionHint(model,mode,baseUrl) ? isVeoNativeBase(baseUrl) ? '原生延长 · 新增 7 秒' : '末帧续拍并拼接 · 新增 8 秒' : undefined,
    durationOptions:durations.map(value=>`${value}s`),selectedDuration:`${duration}s`,
    showAudio:!copy && profile.audioSupport==='controllable',audioEnabled:settings.beikeScriptOnly===true?scriptAudio ?? false:typeof settings.beikeVideoAudio==='boolean'?settings.beikeVideoAudio:scriptAudio ?? true,audioField:'beikeVideoAudio',
  };
}

/** A failed durable save retains the editable draft, but never authorizes downstream submission. */
export async function saveStudioCompilerApproval({commands,nodeId,key,input,optimization,edited,save}:{
 commands:StudioTaskCommands;nodeId:string;key:string;input:VideoPromptInput;optimization:VideoPromptOptimization;edited:string;save:(scene:StudioScene)=>Promise<void>;
}) {
 const assertCurrent=()=>{
  const scene=commands.read(),node=scene.nodes.find(n=>n.id===nodeId);
  if(!node||studioCompilerKey(node,resolveStudioInputs(scene,nodeId))!==key)throw new Error('上游或配置已修改，请重新优化');
 };
 assertCurrent();
 const text=videoPromptOutput(edited,input);
 commands.update(nodeId,undefined,{content:text,beikePromptOptimization:{...optimization,draft:edited,submitted:text},settings:{text,beikeCompilerApproved:text,beikeCompilerInputKey:key,textNodeDisplayText:text}});
 try {await save(commands.read());assertCurrent();}
 catch(error) {
  const node=commands.read().nodes.find(n=>n.id===nodeId),settings=node&&compilerSettings(node);
  if(settings?.beikeCompilerApproved===text&&settings.beikeCompilerInputKey===key)commands.update(nodeId,undefined,{settings:{beikeCompilerApproved:undefined,beikeCompilerInputKey:undefined}});
  throw error;
 }
}

export type StudioCompilerPreview={value:VideoPromptOptimization;key:string;input:VideoPromptInput};

function draftKey(node:StudioScene['nodes'][number],inputs:ReturnType<typeof resolveStudioInputs>) {
 return studioCompilerKey(node,{...inputs,refs:inputs.refs.map(ref=>ref.assetId&&/^(blob:|local-asset:)/.test(ref.url)?{...ref,url:`local-asset://${encodeURIComponent(ref.assetId)}`}:ref)});
}

/** A draft is reusable only for the exact scene inputs and current model Skill. */
export function restoreStudioCompilerDraft(scene:StudioScene,nodeId:string):StudioCompilerPreview|undefined {
 const node=scene.nodes.find(n=>n.id===nodeId);
 if(!node||compilerSettings(node).beikeCompilerApproved)return;
 const value=node.beikePromptOptimization as VideoPromptOptimization|undefined;
 const binding=node.beikeCompilerReview as Omit<StudioCompilerPreview,'value'>|undefined;
 if(!value?.compiler||typeof value.optimized!=='string'||!binding?.input||typeof binding.key!=='string')return;
 const skill=videoPromptSkill(binding.input.model,binding.input.mode);
 if(!skill||value.skillId!==skill.id||value.revision!==skill.source?.revision||value.videoModel!==binding.input.model||value.videoMode!==binding.input.mode)return;
 try {
  const inputs=resolveStudioInputs(scene,nodeId);
  if(draftKey(node,inputs)!==binding.key)return;
  return {...binding,key:studioCompilerKey(node,inputs),value:{...value,submitted:undefined}};
 }catch{return;}
}

export async function saveStudioCompilerDraft(commands:StudioTaskCommands,nodeId:string,preview:StudioCompilerPreview,draft:string,save:(scene:StudioScene)=>Promise<void>) {
 const scene=commands.read(),node=scene.nodes.find(n=>n.id===nodeId);
 if(!node||studioCompilerKey(node,resolveStudioInputs(scene,nodeId))!==preview.key)throw new Error('上游或配置已修改，请重新优化');
 commands.update(nodeId,undefined,{...(preview.value.operationId?{beikePromptRecoveryRequired:false}:{}),beikePromptOptimization:{...preview.value,draft,submitted:undefined},beikeCompilerReview:{key:draftKey(node,resolveStudioInputs(scene,nodeId)),input:preview.input}});
 try{await save(commands.read());}catch(error){if(preview.value.operationId)commands.update(nodeId,undefined,{beikePromptRecoveryRequired:true});throw error;}
}

/** Upgrade old compiler graphs once; no media or existing outputs are removed. */
function upgradeStudioCompilerMedia(scene:StudioScene):StudioScene {
 let nodes=scene.nodes,connections=scene.connections,changed=false;
 for(const video of nodes.filter(n=>compilerSettings(n).beikeCompilerSource)) {
  const compiler=nodes.find(n=>n.id===compilerSettings(video).beikeCompilerSource);
  if(!compiler||compilerSettings(compiler).beikePreparedReferences===true||compilerSettings(compiler).beikeCompilerMediaVersion===1)continue;
  const prefix=video.id.endsWith('-video')?video.id.slice(0,-6):'';
  const sources=nodes.filter(n=>prefix&&['product','person','background'].some(k=>n.id===`${prefix}-${k}`));
  for(const source of sources)if(!connections.some(e=>e.from===source.id&&e.to===compiler.id))connections=[...connections,{id:`${source.id}-compiler-ref`,from:source.id,to:compiler.id}];
  nodes=nodes.map(n=>n===compiler?{...n,width:380,height:340,settings:{...compilerSettings(n),beikeCompilerMediaVersion:1}}:n);
  changed=true;
 }
 const mirrored=mirrorStudioCompilerConnections({...scene,nodes,connections});
 if(JSON.stringify(mirrored)!==JSON.stringify(connections)){connections=mirrored;changed=true;}
 return changed?{...scene,nodes,connections}:scene;
}

/** Insert one explicit compiler, retaining user media, previous results and supplementary inputs. */
export function upgradeStudioCompiler(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(!scene)return project;
 if(scene.nodes.some(n=>compilerSettings(n).beikePromptCompiler)){const next=upgradeStudioCompilerMedia(scene);
  const rename=next.nodes.some(n=>compilerSettings(n).beikeCompilerSource&&n.nodeName==='08 视频生成 · 继承07');
  return rename?{...project,studioScene:{...next,nodes:next.nodes.map(n=>compilerSettings(n).beikeCompilerSource&&n.nodeName==='08 视频生成 · 继承07'?{...n,nodeName:'08 视频生成'}:n)}}:next===scene?project:{...project,studioScene:next};}
 const video=scene.nodes.find(n=>n.id.endsWith('-video')&&compilerSettings(n).beikeVideoWorkflow==='depth-copy');
 if(!video)return project;
 const baseId=video.id.slice(0,-6)+'-prompt',s=compilerSettings(video);
 let id=baseId,index=1;
 while(scene.nodes.some(n=>n.id===id))id=`${baseId}-${index++}`;
 const compiler={id,type:'text-node',nodeName:'07 视频提示词优化',x:Number(video.x)-380,y:Number(video.y)-300,width:360,height:340,prompt:video.prompt,
   settings:{model:s.model,beikeVideoAudio:s.beikeVideoAudio,ratio:s.ratio||'9:16',resolution:s.resolution||'480P',duration:s.duration||'15s',beikeVideoMode:'omni',beikeScriptOnly:true,beikePromptCompiler:true,aiGenerated:true,text:'选中文本节点，选择优化模型并提交。优化后确认提示词，再运行 08。'}};
 const nodes=scene.nodes.map(n=>n===video?{...n,nodeName:'08 视频生成',prompt:'',settings:{...s,beikeCompilerSource:id,beikeScriptOnly:false,beikeOptimizePrompt:false}}:n.id.endsWith('-depth')?{...n,nodeName:'辅助 · 本地深度检查'}:n.id.endsWith('-guide')?{...n,settings:{...compilerSettings(n),text:'05分析分镜 → 06生成外观参考图 → 07选中节点，选择优化模型并提交，确认视频参数后优化提示词 → 确认保存07文本 → 08继承07配置与稿件生成。上游或07配置变化后须重新优化确认，08不重复优化。保留原声时生成片段静音，再由09回贴原音轨。'}}:n);
 const connections=scene.connections.map(e=>e.to===video.id?{...e,to:id}:e);
 connections.push({id:id+'-video',from:id,to:video.id});
 return {...project,studioScene:upgradeStudioCompilerMedia({...scene,nodes:[...nodes,compiler],connections})};
}

export function studioCompilerSelectionPrompt(prompt:string,segment:string) {
 if(!/^\d+$/.test(segment.trim())||Number(segment)<=0)throw new Error('请选择有效的分镜片段编号');
 const marker=`【使用片段：${segment.trim().padStart(2,'0')}】`;
 return `${marker}\n${prompt.replace(/【使用片段[：:]\s*\d+】/g,'').trim()}`;
}

/** Read the selected storyboard duration without letting stale node defaults override it. */
export function studioCompilerSelectionDuration(scene:StudioScene,nodeId:string,segment:string):string|undefined {
 const nodes=scene.nodes.map(node=>node.id===nodeId?{...node,prompt:studioCompilerSelectionPrompt(String(node.prompt||''),segment),settings:{...compilerSettings(node),duration:undefined}}:node);
 try {
  const duration=resolveStudioInputs({...scene,nodes},nodeId).duration;
  return duration?`${duration}s`:undefined;
 }catch{return undefined;}
}

export function studioCompilerParameters(node:StudioScene['nodes'][number],scene?:StudioScene) {
 const settings=compilerSettings(node);
 const storedDuration=String(settings.duration??'');
 const duration=settings.beikeCompilerDurationEdited===true
  ? /^\d+$/.test(storedDuration)?`${storedDuration}s`:storedDuration : (scene&&settings.beikeScriptOnly===true&&studioCompilerSelectionDuration(scene,node.id,String(node.prompt||'').match(/【使用片段[：:]\s*(\d+)】/)?.[1]||'01'))||String(settings.duration||(settings.beikeScriptOnly===false?'5s':'15s'));
 const config=studioVideoSettings({...node,type:'gen-video',settings:{...settings,duration}});
 return {duration:settings.beikeScriptOnly===false&&settings.beikeCompilerDurationEdited!==true?config?.selectedDuration||duration:duration,resolution:config?.selectedResolution||String(settings.resolution||'480P'),resolutions:config?.resolutionOptions||[],
  audio:typeof settings.beikeVideoAudio==='boolean'?String(settings.beikeVideoAudio):'script'};
}

/** A skill selection carries its exact video route, so optimization and generation stay paired. */
export function studioCompilerSkills() {
 return studioChannels().flatMap(channel=>{
  if(channel.kind!=='video'||!videoModes(channel.modelId,getGatewayClientBaseUrl(channel.route)).some(mode=>mode.id==='omni'))return [];
  const skill=videoPromptSkill(channel.modelId,'omni');
  if(!skill)return [];
  const skillName=skill.displayName||skill.name;
  return [{...channel,skillName,label:`${skillName} · ${channel.name}`}];
 });
}

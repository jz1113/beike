import {bindVideoWorkflowReferences} from './videoWorkflowReferences';
import type {CanvasProject,StudioScene} from './types';
import {videoCopyAnalysisPrompt,videoCopyKeyframePrompt,depthCopyVideoPrompt,w3CopyAnalysisPrompt,w3CopyKeyframePrompt,w3CopyVideoPrompt} from './videoWorkflowPrompts';
const settings=(n:StudioScene['nodes'][number])=>n.settings as Record<string,unknown>||{};
export function videoWorkflowKind(scene?:StudioScene) {
 if(scene?.nodes.some(n=>settings(n).beikeVideoWorkflow==='w3-copy'))return 'w3-copy';
 if(scene?.nodes.some(n=>settings(n).beikeOperation==='depth-video')&&scene.nodes.some(n=>settings(n).beikeOperation==='compose-original'))return 'depth-copy';
}
/** Repair empty instructions only; preserve custom prompts, selected models, results and graph geometry. */
export function restoreVideoWorkflowPrompts(project:CanvasProject):CanvasProject {
 project=upgradeDepthReferences(project);
 const kind=videoWorkflowKind(project.studioScene),scene=project.studioScene;
 if(!kind||!scene)return project;
 let changed=false;
 const nodes=scene.nodes.map(n=>{
  const s=settings(n),analysis=n.id.endsWith('-analysis'),frame=n.id.endsWith('-keyframe'),video=n.id.endsWith('-video');
  if(!analysis&&!frame&&!video)return n;
  const fallback=kind==='depth-copy'?(analysis?videoCopyAnalysisPrompt:frame?videoCopyKeyframePrompt:depthCopyVideoPrompt):(analysis?w3CopyAnalysisPrompt:frame?w3CopyKeyframePrompt:w3CopyVideoPrompt);
  const original=typeof n.prompt==='string'&&n.prompt.trim()?n.prompt:analysis&&typeof s.textNodeDraftPrompt==='string'&&s.textNodeDraftPrompt.trim()?s.textNodeDraftPrompt:fallback;
  const cleaned=kind==='depth-copy'?removeLegacyDuplicate(original,fallback,frame,analysis):original;
  const prompt=kind==='depth-copy'?bindVideoWorkflowReferences(scene,n,cleaned,fallback):cleaned;
  const patch:Record<string,unknown>={};
  if(analysis){if(!s.textNodeDraftPrompt||prompt!==original)patch.textNodeDraftPrompt=prompt;if(s.beikeTextResultRequired!==true)patch.beikeTextResultRequired=true;if(s.textNodeComposerPromptExpanded!==true)patch.textNodeComposerPromptExpanded=true;}
  if(video&&s.beikeVideoWorkflow!==kind)patch.beikeVideoWorkflow=kind;
  if(n.prompt===prompt&&!Object.keys(patch).length)return n;
  changed=true;return {...n,prompt,settings:{...s,...patch}};
 });
 return changed?{...project,studioScene:{...scene,nodes}}:project;
}

/** Add the missing scene input once, retaining uploaded media, outputs and user instructions. */
function upgradeDepthReferences(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(videoWorkflowKind(scene)!=='depth-copy'||!scene)return project;
 const video=scene.nodes.find(n=>n.id.endsWith('-video')&&settings(n).beikeVideoWorkflow!=='w3-copy');
 if(!video||settings(video).beikeReferenceVersion===2)return project;
 const prefix=video.id.slice(0,-6),backgroundId=`${prefix}-background`;
 const nodes=[...scene.nodes];
 if(!nodes.some(n=>n.id===backgroundId))nodes.push({id:backgroundId,type:'input-image',nodeName:'04 上传场景 / 背景图',x:80,y:1290,width:340,height:300,prompt:'',settings:{mediaType:'image'}});
 const defaults=new Map([['analysis',videoCopyAnalysisPrompt],['keyframe',videoCopyKeyframePrompt],['video',depthCopyVideoPrompt]]);
 const updated=nodes.map(n=>{
  const key=n.id.slice(prefix.length+1),fallback=defaults.get(key);
  if(!fallback)return n;
  const draft=key==='analysis'?settings(n).textNodeDraftPrompt:undefined;
  const old=typeof draft==='string'&&draft.trim()?draft:typeof n.prompt==='string'?n.prompt:'';
  const prompt=!old.trim()?fallback:(settings(video).beikeReferenceVersion===1||old.includes('输入对应：'))?old:`${fallback}\n用户补充要求：\n${old}`;
  return {...n,prompt,settings:{...settings(n),...(key==='analysis'?{textNodeDraftPrompt:prompt,beikeTextImageCount:3}:{}),...(key==='video'?{beikeReferenceVersion:2}:{})}};
 });
 const connections=[...scene.connections];
 for(const key of ['analysis','keyframe']) {
  const to=`${prefix}-${key}`;
  for(const source of ['source','product','person','background','brief']) {
   if(key==='keyframe'&&source==='source')continue;
   const from=`${prefix}-${source}`;
   if(updated.some(n=>n.id===from)&&updated.some(n=>n.id===to)&&!connections.some(e=>e.from===from&&e.to===to))connections.push({id:`${from}-${key}`,from,to});
  }
 }
 return {...project,studioScene:{...scene,nodes:updated,connections}};
}

/** Remove only the exact previous template; retain any genuine appended requirements. */
function removeLegacyDuplicate(prompt:string,fallback:string,frame:boolean,analysis:boolean):string {
 let legacy=frame?videoCopyKeyframePrompt.split('\n').filter((_,index)=>index!==0&&index!==2).join('\n'):fallback.split('\n').slice(1).join('\n');
 if(analysis)legacy=legacy.replace('场景图确定空间布局、透视、地面、光线与色调；','').replace(/每段提示词必须独立完整：[\s\S]*?最后按模型支持时长分段，/,'最后按模型支持时长分段，');
 const duplicate=`${fallback}\n用户补充要求：\n${legacy}`;
 if(!prompt.startsWith(duplicate))return prompt;
 const custom=prompt.slice(duplicate.length);
 return custom.trim()?`${fallback}\n用户补充要求：\n${custom.trim()}`:fallback;
}

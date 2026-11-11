import { coverLayoutId, formatCoverSkillReply, isCurrentCoverTextOperation, validateCoverPromptFormat } from './coverBatch';
import { readCanvasTextOperation, requestCanvasText, type CanvasTextContext } from './canvasTextRequest';
import { canvasChatRequest } from './studioGeneration';
import { studioNodeTaskId, type StudioTaskCommands } from './studioTaskState';
import type { CanvasProject, StudioScene } from './types';
import {
  depthCopyVideoPrompt,
  legacyDepthCopyVideoPrompt,
  legacyScriptVideoPrompt,
  legacyVideoCopyAnalysisPrompt,
  legacyVideoCopyKeyframePrompt,
  previousAssetAnalysisPrompt,
  previousAssetKeyframePrompt,
  previousDepthCopyVideoPrompt,
  previousDurationAnalysisPrompt,
  previousVideoCopyAnalysisPrompt,
  previousVideoCopyKeyframePrompt,
  unstyledDepthCopyVideoPrompt,
  unstyledVideoCopyAnalysisPrompt,
  unstyledVideoCopyKeyframePrompt,
  videoCopyAnalysisPrompt,
  videoCopyKeyframePrompt,
} from './videoWorkflowPrompts';

const settings=(n:StudioScene['nodes'][number])=>n.settings as Record<string,unknown>||{};

export function videoWorkflowKind(scene?:StudioScene) {
 if(scene?.nodes.some(n=>settings(n).beikeVideoWorkflow==='w3-copy'))return 'w3-copy';
 if(scene?.nodes.some(n=>settings(n).beikeVideoWorkflow==='depth-copy'))return 'depth-copy';
 if(scene?.nodes.some(n=>settings(n).beikeOperation==='depth-video')&&scene.nodes.some(n=>settings(n).beikeOperation==='compose-original'))return 'depth-copy';
}

export function canvasMemoryWorkflow(project: CanvasProject) {
 return project.nativeCommerce?.kind || videoWorkflowKind(project.studioScene) || 'canvas';
}

const copyUploadSlots = {
 source: { kind: 'video', label: '01 原片视频' },
 product: { kind: 'image', label: '02 商品 / 服装参考图' },
 person: { kind: 'image', label: '03 目标人物图', hideRoleLabel: true },
 background: { kind: 'image', label: '04 场景 / 背景图' },
} as const;

export function canvasWorkflowUploadSlot(project: CanvasProject | undefined, nodeId: string) {
 if (!project) return;
 const role = nodeId.slice(nodeId.lastIndexOf('-') + 1);
 if (project.nativeCommerce) {
  if (role === 'product') return { kind: 'image', label: project.nativeCommerce.kind === 'poster' ? '商品素材' : '商品参考图' } as const;
  if (role === 'reference' && project.nativeCommerce.kind === 'poster') return { kind: 'image', label: '封面风格参考（可选）' } as const;
 }
 const workflow = videoWorkflowKind(project.studioScene);
 if ((workflow || project.studioScene?.nodes.some(node => settings(node).beikeStoryboardSceneSourceId)) && Object.hasOwn(copyUploadSlots, role)) {
  return copyUploadSlots[role as keyof typeof copyUploadSlots];
 }
}

export function canvasWorkflowUploadAccept(slot: ReturnType<typeof canvasWorkflowUploadSlot>) {
 if (slot?.kind === 'image') return 'image/*';
 if (slot?.kind === 'video') return 'video/*,.mkv,.avi,.flv';
 return 'image/*,video/*,audio/*,.mkv,.avi,.flv,.opus';
}

export function canvasWorkflowUploadError(slot: ReturnType<typeof canvasWorkflowUploadSlot>, kind: string | undefined) {
 return slot && slot.kind !== kind ? `「${slot.label}」仅支持${slot.kind === 'image' ? '图片' : '视频'}，请选择对应素材。` : undefined;
}

/** Restore the missing result handoff without recreating optional processing nodes. */
export function restoreAnalysisHandoff(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(!scene||!videoWorkflowKind(scene))return project;
 const video=scene.nodes.find(n=>n.id.endsWith('-video'));
 if(!video)return project;
 if(settings(video).beikeAnalysisHandoffVersion===1)return project;
 const prefix=video.id.slice(0,-6),connections=[...scene.connections];
 for(const target of ['keyframe','video']) {
  const from=`${prefix}-analysis`,to=target==='video'?String(settings(video).beikeCompilerSource||video.id):`${prefix}-${target}`;
  if(scene.nodes.some(n=>n.id===from)&&scene.nodes.some(n=>n.id===to)&&!connections.some(e=>e.from===from&&e.to===to))connections.push({id:`${from}-handoff-${target}`,from,to});
 }
 const nodes=scene.nodes.map(n=>n===video?{...n,settings:{...settings(n),beikeAnalysisHandoffVersion:1}}:n);
 return {...project,studioScene:{...scene,nodes,connections}};
}

/** Add the missing scene input once, retaining uploaded media, outputs and user instructions. */
export function upgradeDepthReferences(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(videoWorkflowKind(scene)!=='depth-copy'||!scene)return project;
 const video=scene.nodes.find(n=>n.id.endsWith('-video')&&settings(n).beikeVideoWorkflow!=='w3-copy');
 if(!video||settings(video).beikeOriginalStoryboardScene===true||Number(settings(video).beikeReferenceVersion)>=2)return project;
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
export function removeLegacyDuplicate(prompt:string,fallback:string,frame:boolean,analysis:boolean):string {
 let legacy=frame?videoCopyKeyframePrompt.split('\n').filter((_,index)=>index!==0&&index!==2).join('\n'):fallback.split('\n').slice(1).join('\n');
 if(analysis)legacy=legacy.replace('场景图确定空间布局、透视、地面、光线与色调；','').replace(/每段提示词必须独立完整：[\s\S]*?最后按模型支持时长分段，/,'最后按模型支持时长分段，');
 const duplicate=`${fallback}\n用户补充要求：\n${legacy}`;
 if(!prompt.startsWith(duplicate))return prompt;
 const custom=prompt.slice(duplicate.length);
 return custom.trim()?`${fallback}\n用户补充要求：\n${custom.trim()}`:fallback;
}

/** Keep generated media intact; only retire video references from the generation input. */
export function upgradeDepthScriptInputs(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(!scene||videoWorkflowKind(scene)!=='depth-copy')return project;
 const video=scene.nodes.find(n=>n.id.endsWith('-video'));
 if(!video||settings(video).beikeCompilerSource||settings(video).beikeScriptOnly===true&&settings(video).beikeScriptModeVersion===2)return project;
 const prefix=video.id.slice(0,-6),old=typeof video.prompt==='string'?video.prompt:'';
 const prompt=old.startsWith(legacyScriptVideoPrompt)?depthCopyVideoPrompt+old.slice(legacyScriptVideoPrompt.length):old.startsWith(legacyDepthCopyVideoPrompt)?depthCopyVideoPrompt+old.slice(legacyDepthCopyVideoPrompt.length):old.startsWith('输入对应：@视频')?depthCopyVideoPrompt:old||depthCopyVideoPrompt;
 const nodes=scene.nodes.map(n=>n!==video?n:{...n,prompt,settings:{...settings(n),beikeScriptOnly:true,beikeScriptModeVersion:2,beikeReferenceVersion:3,beikeOptimizePrompt:true,beikeVideoMode:'omni',beikeRequiredInputs:[`${prefix}-keyframe`,`${prefix}-analysis`]}});
 const connections=scene.connections.filter(e=>e.to!==video.id||[e.from,...(Array.isArray(e.fromGroupNodeIds)?e.fromGroupNodeIds as string[]:[])].every(id=>{const n=nodes.find(n=>n.id===id);return n&&['text-node','gen-image'].includes(n.type);}));
 return {...project,studioScene:{...scene,nodes,connections}};
}

/** Upgrade recognized defaults only, retaining appended user requirements and all outputs. */
export function upgradeOmniReferencePrompts(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(!scene||videoWorkflowKind(scene)!=='depth-copy')return project;
 let changed=false;
 const normalize=(text:string)=>text.replace(/@(图片|视频)\d+/g,'@$1');
 const nodes=scene.nodes.map(n=>{
  const analysis=n.id.endsWith('-analysis'),frame=n.id.endsWith('-keyframe'),video=n.id.endsWith('-video');
  if(!analysis&&!frame&&!video||video&&settings(n).beikeCompilerSource)return n;
  const fallback=analysis?videoCopyAnalysisPrompt:frame?videoCopyKeyframePrompt:depthCopyVideoPrompt,legacy=analysis?legacyVideoCopyAnalysisPrompt:frame?legacyVideoCopyKeyframePrompt:unstyledDepthCopyVideoPrompt;
  const previous=analysis?previousVideoCopyAnalysisPrompt:frame?previousVideoCopyKeyframePrompt:previousDepthCopyVideoPrompt;
  const unstyled=analysis?unstyledVideoCopyAnalysisPrompt:frame?unstyledVideoCopyKeyframePrompt:unstyledDepthCopyVideoPrompt;
  const matches=(value:string)=>{
   const base=value.split('\n用户补充要求：\n')[0];
   return (analysis&&[previousDurationAnalysisPrompt,previousAssetAnalysisPrompt].some(template=>base.replace(/\s/g,'').endsWith(template.slice(template.indexOf('【节点交接规范】')).replace(/\s/g,''))))||[...(analysis?[previousDurationAnalysisPrompt,previousAssetAnalysisPrompt]:frame?[previousAssetKeyframePrompt]:[]),fallback.split('\n【节点交接规范】')[0],previous,legacy,legacy.split('\n【节点交接规范】')[0],unstyled].some(item=>normalize(item)===normalize(base));
  };
  const saved=typeof n.prompt==='string'?n.prompt:'';
  const draft=analysis?settings(n).textNodeDraftPrompt:undefined;
  const old=matches(saved)?saved:typeof draft==='string'&&matches(draft)?draft:saved;
  const base=old.split('\n用户补充要求：\n')[0];
  const prompt=matches(old)?fallback+old.slice(base.length):old;
  const name=frame&&(!n.nodeName||n.nodeName==='06 制作人物、商品与场景参考图')?'06 人物、服装与场景整合图 · 默认1张':n.nodeName;
  if(prompt===old&&name===n.nodeName&&(!frame||settings(n).beikeOmniReferenceImage===true))return n;
  changed=true;
  return {...n,nodeName:name,prompt,settings:{...settings(n),...(analysis?{textNodeDraftPrompt:prompt}:frame?{beikeOmniReferenceImage:true}:{})}};
 });
 return changed?{...project,studioScene:{...scene,nodes}}:project;
}

export function recoverStudioTextNode(projectId:string,node:StudioScene['nodes'][number]):StudioScene['nodes'][number] {
  if(node.type!=='text-node')return node;
  const nodeSettings=node.settings as Record<string,unknown> || {};
  try {
    const saved=readCanvasTextOperation({projectId,nodeId:node.id});
    const unknown=saved?.status==='pending' || node.beikeTextRecoveryRequired || nodeSettings.textNodeIsAnalyzing;
    if(!unknown)return node;
    return {...node,beikeTextOperationId:saved?.id || node.beikeTextOperationId,beikeTextRecoveryRequired:true,
      settings:{...nodeSettings,textNodeIsAnalyzing:false,beikeTextRunError:nodeSettings.beikeCoverPromptWriter === true ? '封面提示词结果待核对，可查询原请求回执' : '上次文本或05分析结果待核对，再次运行将查询原回执，不会重新调用模型'}};
  } catch {
    return {...node,beikeTextRecoveryRequired:true,settings:{...nodeSettings,textNodeIsAnalyzing:false,beikeTextRunError:'原文本记录暂不可读，请恢复存储后查询，不会重新提交'}};
  }
}

/** Explicit node correlation prevents overlapping text runs from borrowing another node's identity. */
export async function studioTextRequest(projectId:string,payload:Record<string,unknown>,signal:AbortSignal,commands:StudioTaskCommands,save:(scene:StudioScene)=>Promise<void>) {
  const supplied=payload.beikeTextContext as Partial<CanvasTextContext>|undefined;
  if(!supplied || typeof supplied.nodeId!=='string' || typeof supplied.runId!=='string')throw new Error('无法核对原文本节点，未提交模型请求');
  const node=commands.read().nodes.find(node=>node.id===supplied.nodeId && node.type==='text-node');
  if(!node)throw new Error('原文本节点已不存在，未提交模型请求');
  const context:CanvasTextContext={projectId,nodeId:node.id,runId:supplied.runId,
    previousOperationId:typeof supplied.previousOperationId==='string'?supplied.previousOperationId:undefined,recoveryOnly:supplied.recoveryOnly===true,
    acceptSettledIncomplete: supplied.acceptSettledIncomplete === true,
    onOperation:async id=>{
      const current=commands.read().nodes.find(row=>row.id===node.id);
      if(!current)throw new Error('原文本节点已不存在');
      commands.update(node.id,studioNodeTaskId(current),{beikeTextOperationId:id,beikeTextRecoveryRequired:true});
      await save(commands.read());
    }};
  try {return await canvasChatRequest(payload,signal,context);}
  catch(error) {
    if(error instanceof Error && ('submissionRejected' in error || 'submissionSettled' in error)) {
      const current=commands.read().nodes.find(row=>row.id===node.id);
      if(current){commands.update(node.id,studioNodeTaskId(current),{beikeTextRecoveryRequired:false});await save(commands.read());}
    }
    throw error;
  }
}

/** Query before loading references or validating today's models; an old receipt owns its inputs. */
export async function recoverStudioTextRun(
  projectId: string, nodeId: string, commands: StudioTaskCommands, save: (scene: StudioScene) => Promise<void>,
  signal = new AbortController().signal, recoveryOnly = false,
): Promise<boolean> {
  const node=commands.read().nodes.find(node=>node.id===nodeId && node.type==='text-node');
  if(!node)return false;
  const saved=readCanvasTextOperation({projectId,nodeId});
  if(!recoveryOnly && saved?.status!=='pending' && !node.beikeTextRecoveryRequired)return false;
  const originalText=(node.settings as Record<string,unknown>|undefined)?.text;
  const operationId=saved?.id || (typeof node.beikeTextOperationId==='string'?node.beikeTextOperationId:undefined);
  const data=await requestCanvasText(()=>{throw new Error('恢复不提交新请求')},{projectId,nodeId,runId:crypto.randomUUID(),
    previousOperationId:operationId,recoveryOnly:true,
    acceptSettledIncomplete: (node.settings as Record<string, unknown> | undefined)?.beikeBatchCoverWriter === true},signal).catch(async error=>{
    if(error instanceof Error && ('submissionRejected' in error || 'submissionSettled' in error)) {
      const current=commands.read().nodes.find(row=>row.id===nodeId);
      if(current && current.beikeTextOperationId===node.beikeTextOperationId){
        commands.update(nodeId,studioNodeTaskId(current),{
          beikeTextOperationId:operationId,beikeTextRecoveryRequired:false,errorMsg:error.message,
          settings:{textNodeIsAnalyzing:false,beikeTextRunError:error.message},
        });
        await save(commands.read());
      }
    }
    throw error;
  });
  const choices=data.choices as Array<{message?:{content?:unknown}}>|undefined;
  const text=typeof data.text==='string'?data.text:choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim())throw new Error('原回执没有可恢复的文本，请核对原操作');
  const current=commands.read().nodes.find(node=>node.id===nodeId);
  if(!current || (current.settings as Record<string,unknown>|undefined)?.text!==originalText)throw new Error('文本已修改，原回执未覆盖新内容');
  const writer = current.settings as Record<string, unknown> | undefined;
  if (writer?.beikeLayerLocked === true) throw new Error('节点已锁定，原回执仍可查询');
  const coverWriter = writer?.beikeBatchCoverWriter === true;
  const draft = writer?.beikeCoverDraftRequest as { offset?: number; title?: unknown; sourceUrl?: string; used?: string[] } | undefined;
  if (coverWriter && !isCurrentCoverTextOperation(operationId)) {
    commands.update(nodeId, studioNodeTaskId(current), {
      beikeTextOperationId: operationId,
      beikeTextRecoveryRequired: false,
      settings: { textNodeIsAnalyzing: false },
    });
    await save(commands.read());
    throw new Error('旧版提示词回执已核对，请重新执行以使用新版素材');
  }
  let recovered = text;
  if (coverWriter) {
    try {
      if (!draft?.sourceUrl || typeof draft.offset !== 'number') throw new Error('原回执缺少商品图或轮换信息，请重新撰写');
      recovered = formatCoverSkillReply(text, undefined, { offset: draft.offset, used: draft.used });
      validateCoverPromptFormat(recovered, undefined, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '原提示词回执不符合版式要求';
      commands.update(nodeId, studioNodeTaskId(current), {
        beikeTextRecoveryRequired: false,
        errorMsg: message,
        settings: { textNodeIsAnalyzing: false, beikeTextRunError: message },
      });
      await save(commands.read());
      throw error;
    }
  }
  commands.update(nodeId,studioNodeTaskId(current),{
    errorMsg: undefined, isGenerating: false,
    content: recovered, beikeTextOperationId: operationId, beikeTextRecoveryRequired: false,
    settings:{text: recovered, textNodeDisplayText: recovered, beikeTextHtml: undefined, error: undefined, isGenerating: false, ...(coverWriter ? {
      beikeCoverSourceUrl: draft?.sourceUrl,
      beikeBatchCoverLayout: coverLayoutId(recovered),
    } : {}),
      aiGenerated:true,_chatCompletedAt:Date.now(),textNodeIsAnalyzing:false,beikeTextRunError:undefined}});
  await save(commands.read());return true;
}

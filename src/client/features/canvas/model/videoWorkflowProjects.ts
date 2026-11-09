import { compilerSettings, mirrorStudioCompilerConnections, upgradeStudioCompiler } from './studioCompilerState';
import { studioEdgeSources, studioNodeKind, studioNodeMedia } from './studioConnections';
import { wireStudioStoryboards } from './studioStoryboard';
import type { CanvasProject, StudioScene } from './types';
import { depthCopyVideoPrompt, referencePreparationHandoff, videoCopyAnalysisPrompt, videoCopyKeyframePrompt, videoCopyVideoPrompt, w3CopyAnalysisPrompt, w3CopyKeyframePrompt, w3CopyVideoPrompt } from './videoWorkflowPrompts';
import { removeLegacyDuplicate, restoreAnalysisHandoff, upgradeDepthReferences, upgradeDepthScriptInputs, upgradeOmniReferencePrompts, videoWorkflowKind } from './videoWorkflowRecovery';

export type VideoWorkflowKind = 'depth-copy' | 'w3-copy';
const W3_WORKFLOW_VERSION = 4;
export const videoWorkflowTemplates = [
  {kind:'depth-copy' as const,title:'深度视频复刻'},
  {kind:'w3-copy' as const,title:'W3复刻模板'},
];

const opening='原片遮脸分镜按页、从左到右从上到下阅读。保留各镜的空间、透视、布景、道具、实际光向、阴影与色调，以及动作、镜头、视线和节奏。遮脸区域、格线和时间码只是标注；人物身份和脸只用目标人物图，指定服装或商品以商品图为准。保留可见且与目标商品兼容的原片道具及手与道具的接触，不把道具误认成目标商品。';
const storyboardAnalysisPrompt=videoCopyAnalysisPrompt.replace(referencePreparationHandoff,'')
 .replace(/^[^\n]+/,'输入是原片视频、商品/服装图、目标人物图及遮脸分镜页，按素材来源识别。需要这些素材齐全；无需上传场景图。'+opening)
 .replace('场景图确定布局、透视、地面与实际光向','遮脸分镜确定各镜的布局、透视、道具与实际光向')
 .replace('原片风格与目标场景冲突时保留目标场景结构和实际光向，迁移相容的软硬、反差与色彩倾向','沿用原片各镜的场景结构、实际光向、反差与色彩倾向')
 .replace('不要求复现某一镜头','取开场对应镜头的场景与光线')
 .replace('08由文字分镜独立决定开场、动作与镜头','08结合文字分镜与遮脸分镜对应画面决定开场、动作与镜头')
 +'\n按镜记录背景、道具位置和交互、光向与明暗变化，并写进目标分镜。06参考图制作要求明确开场对应的时间码、背景和道具，不把后续镜头的空间拼到开场。';
const storyboardImagePrompt=videoCopyKeyframePrompt
 .replace(/^[^\n]+/,'输入是商品/服装图、目标人物图、原片遮脸分镜页与05文字。脸、发型和体态来自目标人物图，指定服装与商品来自商品图。分镜从左到右、从上到下排列；原片人物脸、遮脸块、格线和时间码不进入结果。')
 .replaceAll('目标场景参考','原片开场分镜')
 .replace('场景图确定布局','原片开场分镜确定布局')
 .replace('明确落实侧向受光','按开场分镜还原实际光向')
 +'\n只取05指定的开场时间码对应格；用该格的空间、道具与光线画一张完整单图，其他格用于核对，不混合场景。若旧文字与分镜所见的场景冲突，以分镜为准。';
const storyboardVideoPrompt=depthCopyVideoPrompt
 .replace(/^@图片1[^\n]+/m,opening+'06整合图补充目标人物脸和商品外观；各镜场景、道具、机位和光线以对应分镜格为准。整合图不是首尾帧，不把其开场背景套到后续镜头。')
 +'\n优化稿必须保留各编号图片的职责及逐镜的场景、道具交互、动作、光线和切点。旧分镜文字若与遮脸分镜的场景冲突，以对应画面为准。';

const storyboardSceneGuide='上传01参考视频、02商品/服装图、03目标人物图。01自动抽帧并处理人脸；请检查分镜图是否有漏遮。原片分镜负责背景、道具、动作、镜头与光线，无需另传背景。\n05分析分镜 → 06生成一张整合图（保留开场场景与光线，换成目标人物和服装）→ 07优化并确认 → 08生成视频。已有画布更新后，从05重新运行。需要保留原声时再用09回贴。';

const workflowNodeNames:Record<string,string>={
 brief:'04 创作要求 · 商品与声音',analysis:'05 分析原片与改编分镜',keyframe:'06 人物、服装与场景整合图 · 默认1张',
 prompt:'07 官方技能 · 视频提示词优化',video:'08 视频生成',compose:'可选 · 09 回贴原声 / 合成 WebM',
 preview:'10 预览成片',timeline:'11 剪辑时间线 · 可选',save:'12 保存生成结果',guide:'使用顺序与成本说明',
};
const workflowNodesGuide='01原视频：更多工具 → 免费抽帧，每0.5秒一帧、每页16格，自动遮脸并连接当前复刻流程。02商品/服装和03目标人物保留原图；04场景可上传，也可从原片选帧。\n05分析完整原片，输出一个15秒片段，内部保留真实切镜与动作顺序。06只生成一张人物、服装、场景整合图，先检查身份、服装细节和光影。不再保留独立06a/b/c补图节点；已有场景参考自动沿用。\n选中07，在文字面板选择优化模型，按需补充要求后提交。核对目标视频模型、时长、清晰度及声音，优化后确认。选中08查看确认稿和生成参数，再点击生成；改动上游后需要重新确认。抽帧页只提供动作、构图、场景与光线，不提供原人物或服装身份。\n10默认预览08结果，12下载生成文件；09仅在需要回贴原声时手动使用，输出WebM。需要剪辑时从左侧工具栏添加时间线。\n按图片0.10元、视频2.50元估算，默认一图一视频为2.60元，未含文字分析、抓取和失败重试。新模板默认15秒；已有画布保留已选模型、配置、素材和结果。';

/** Template roles follow actual connected sources, including the user's reference ordering. */
export function bindVideoWorkflowReferences(scene:StudioScene,node:StudioScene['nodes'][number],prompt:string,canonical:string):string {
 if(!prompt.startsWith(canonical))return prompt;
 const key=node.id.endsWith('-analysis')?'analysis':node.id.endsWith('-keyframe')?'keyframe':'video';
 const prefix=node.id.slice(0,-key.length-1);
 const roles=key==='analysis'?['source','product','person','background']:key==='keyframe'?['product','person','background']:['keyframe'];
 const ids=[...new Set(scene.connections.filter(e=>e.to===node.id&&(!e.inputType||e.inputType==='default')).flatMap(e=>studioEdgeSources(e,scene)))];
 const media=ids.map(id=>scene.nodes.find(n=>n.id===id)).filter(n=>n&&studioNodeKind(n)!=='text') as StudioScene['nodes'];
 const s=node.settings as Record<string,unknown>||{},order=s.inputItemOrder||s.inputImageOrder;
 if(Array.isArray(order))media.sort((a,b)=>{
  const index=(n:StudioScene['nodes'][number])=>{const i=order.indexOf(studioNodeMedia(n).url);return i<0?Infinity:i;};
  return index(a)-index(b);
 });
 const bound=canonical.replace(/@(图片|视频)(\d+)/g,(token,kind:string,number:string)=>{
  const prepared=['product','identity','scene'][Number(number)-1];
  const source=key==='keyframe'&&Array.isArray(s.beikeReferenceInputIds)?String(s.beikeReferenceInputIds[Number(number)-1]):key==='keyframe'&&s.beikeReferencePreparationVersion===1?media.find(n=>(n.settings as Record<string,unknown>|undefined)?.beikeReferencePreparationRole===prepared)?.id:`${prefix}-${roles[Number(number)-1]}`;
  const index=media.findIndex(n=>n.id===source);
  return index<0?token:`@${kind}${index+1}`;
 });
 return bound+prompt.slice(canonical.length);
}

/** Keep legacy prep nodes, but make one integrated reference image the default path. */
export function upgradeVideoReferencePreparation(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(!scene)return project;
 const compiler=scene.nodes.find(n=>compilerSettings(n).beikePromptCompiler===true),frame=scene.nodes.find(n=>n.id.endsWith('-keyframe'));
 if(!compiler||!frame||compilerSettings(frame).beikeReferencePreparationVersion===3)return project;
 const prefix=frame.id.slice(0,-9),video=scene.nodes.find(n=>compilerSettings(n).beikeCompilerSource===compiler.id);
 if(!video)return project;
 const analysis=scene.nodes.find(n=>n.id===prefix+'-analysis');
 const originalIds=['product','person','background'].map(key=>prefix+'-'+key);
 if(originalIds.some(id=>!scene.nodes.some(n=>n.id===id)))return project;
 const roles=['product','identity','scene'];
 const preparations=scene.nodes.filter(n=>compilerSettings(n).beikeReferencePreparationRole&&(n.id.startsWith(prefix+'-reference-')||scene.connections.some(e=>e.from===n.id&&e.to===frame.id)));
 const inputIds=originalIds.map((id,index)=>preparations.find(n=>compilerSettings(n).beikeReferencePreparationRole===roles[index]&&studioNodeMedia(n).url)?.id||id);
 const replacedIds=new Set([...originalIds,...preparations.map(n=>n.id)]);
 const connections=scene.connections.filter(e=>e.to!==frame.id||!replacedIds.has(e.from));
 for(const id of inputIds)if(!connections.some(e=>e.from===id&&e.to===frame.id))connections.push({id:`${id}-integrated-${frame.id}`,from:id,to:frame.id});
 if(analysis&&!connections.some(e=>e.from===analysis.id&&e.to===frame.id))connections.push({id:analysis.id+'-integrated-'+frame.id,from:analysis.id,to:frame.id});
 for(const to of [compiler.id,video.id])if(!connections.some(e=>e.from===frame.id&&e.to===to))connections.push({id:frame.id+'-prepared-'+to,from:frame.id,to});
 const updated=scene.nodes.map(n=>preparations.includes(n)?{...n,nodeName:String(n.nodeName||'').startsWith('可选 · ')?n.nodeName:'可选 · '+String(n.nodeName||'参考补图')}:n.id.endsWith('-guide')?{...n,settings:{...compilerSettings(n),text:'低成本流程：原视频菜单免费抽帧并遮脸 → 05分析完整分镜 → 06只生成一张人物、服装、场景整合参考图 → 检查脸、服装细节和场景 → 07使用官方技能优化并确认 → 08继承模型、480P和15秒配置生成。\n06a/06b/06c仅为可选补图，已有图保留复用，一键准备不会自动生成。抽帧图自动作为07/08动作与镜头参考，不作为目标人物和服装依据。09仅在需要保留原声时手动运行。'}}:n.id===frame.id?{...n,settings:{...compilerSettings(n),beikeRequiredInputs:inputIds,beikeReferenceInputIds:inputIds,beikeOmniReferenceImage:true,beikeReferencePreparationVersion:3}}:n.id===compiler.id?{...n,settings:{...compilerSettings(n),beikeCompilerApproved:undefined,beikeCompilerInputKey:undefined,beikePreparedReferences:true}}:n.id===video.id?{...n,settings:{...compilerSettings(n),beikePreparedReferences:true}}:n);
 const preparedScene={...scene,nodes:updated,connections};
 const framePrompt=String(frame.prompt||'');
 const bound=updated.map(n=>n.id===frame.id&&framePrompt.startsWith('输入对应：')&&framePrompt.includes('【整合参考图验收】')?{...n,prompt:bindVideoWorkflowReferences(preparedScene,n,framePrompt.replace(/^[^\n]*/,videoCopyKeyframePrompt.split('\n')[0]).replace('与身份单图一致','与目标人物参考一致').replace('与干净服装图一致。只采用空场景图中的','与商品/服装参考一致。只采用目标场景参考中的'),videoCopyKeyframePrompt)}:n);
 const upgraded={...preparedScene,nodes:bound};
 return {...project,studioScene:{...upgraded,connections:mirrorStudioCompilerConnections(upgraded)}};
}

/** Refresh standard node labels and routing without replacing custom content or finished outputs. */
export function upgradeVideoWorkflowNodes(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(!scene)return project;
 const video=scene.nodes.find(n=>compilerSettings(n).beikeVideoWorkflow==='depth-copy'&&n.id.endsWith('-video'));
 if(!video||compilerSettings(video).beikeWorkflowNodesVersion===2)return project;
 const prefix=video.id.slice(0,-6),compose=scene.nodes.find(n=>n.id===prefix+'-compose');
 const nodes=scene.nodes.map(n=>{
  if(!n.id.startsWith(prefix+'-'))return n;
  const key=n.id.slice(prefix.length+1),name=String(n.nodeName||'');
  const standard=!name||/^(?:\d{2}\s|可选 · \d{2}|使用顺序)/.test(name);
  return {...n,...(workflowNodeNames[key]&&standard?{nodeName:workflowNodeNames[key]}:{}),settings:{...compilerSettings(n),...(key==='video'?{beikeWorkflowNodesVersion:2}:{}),...(key==='guide'?{text:workflowNodesGuide}:{})}};
 });
 const versions=compose&&compilerSettings(compose).generationVersions;
 const hasComposedResult=!!(compose?.content||compose?.videoUrl||Array.isArray(versions)&&versions.length);
 const connections=hasComposedResult?scene.connections:scene.connections.map(e=>e.from===compose?.id&&[prefix+'-preview',prefix+'-save'].includes(e.to)?{...e,from:video.id}:e);
 return {...project,studioScene:{...scene,nodes,connections}};
}

/** Retire superseded cards while retaining their media records and selected scene. */
export function pruneVideoWorkflowNodes(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 if(!scene)return project;
 const video=scene.nodes.find(n=>compilerSettings(n).beikeVideoWorkflow==='depth-copy'&&n.id.endsWith('-video'));
 if(!video)return project;
 const prefix=video.id.slice(0,-6),frame=scene.nodes.find(n=>n.id===prefix+'-keyframe');
 if(!frame)return project;
 const originals=['product','person','background'].map(key=>prefix+'-'+key);
 if(originals.some(id=>!scene.nodes.some(n=>n.id===id)))return project;
 const usedElsewhere=(id:string)=>scene.connections.some(e=>e.from===id&&e.to!==frame.id||Array.isArray(e.fromGroupNodeIds)&&e.fromGroupNodeIds.includes(id))||scene.nodes.some(n=>n.id!==frame.id&&['beikeRequiredInputs','beikeReferenceInputIds'].some(key=>{const value=compilerSettings(n)[key];return Array.isArray(value)&&value.includes(id);}));
 const redundant=scene.nodes.filter(n=>n.id.startsWith(prefix+'-reference-')&&compilerSettings(n).beikeReferencePreparationRole&&!n.isGenerating&&!usedElsewhere(n.id));
 const emptyTools=scene.nodes.filter(n=>[prefix+'-depth',prefix+'-timeline'].includes(n.id)&&!n.isGenerating&&!studioNodeMedia(n).url&&!usedElsewhere(n.id)&&!scene.connections.some(e=>e.from===n.id)&&!['videoTimelineClips','videoTimelineSources'].some(key=>{const value=compilerSettings(n)[key];return Array.isArray(value)&&value.length;}));
 const removed=[...redundant,...emptyTools],ids=new Set(removed.map(n=>n.id));
 if(!ids.size)return project;
 const selectedScene=redundant.find(n=>compilerSettings(n).beikeReferencePreparationRole==='scene');
 const settings=compilerSettings(frame),previous=settings.beikeRetiredReferenceNodes;
 const nodes=scene.nodes.filter(n=>!ids.has(n.id)).map(n=>n.id===frame.id?{...n,settings:{...settings,beikeRetiredReferenceNodes:[...(Array.isArray(previous)?previous:[]),...redundant],...(redundant.length?{beikeReferenceInputIds:originals,beikeRequiredInputs:originals,...(!settings.beikeSceneFrameUrl&&selectedScene&&studioNodeMedia(selectedScene).url?{beikeSceneFrameUrl:studioNodeMedia(selectedScene).url,beikeSceneSourceMode:'retained-reference'}:{})}:{})}}:n);
 const connections=scene.connections.filter(e=>!ids.has(e.from)&&!ids.has(e.to));
 if(redundant.length)for(const from of originals)if(!connections.some(e=>e.from===from&&e.to===frame.id))connections.push({id:from+'-direct-'+frame.id,from,to:frame.id});
 const next={...scene,nodes,connections};
 const current=nodes.find(n=>n.id===frame.id)!;
 if(redundant.length&&String(current.prompt||'').startsWith('输入对应：')&&String(current.prompt).includes('【整合参考图验收】'))current.prompt=bindVideoWorkflowReferences(next,current,String(current.prompt).replace(/^[^\n]*/,videoCopyKeyframePrompt.split('\n')[0]),videoCopyKeyframePrompt);
 return {...project,studioScene:next};
}

/** Repair empty instructions only; preserve custom prompts, selected models, results and graph geometry. */
export function restoreVideoWorkflowPrompts(project:CanvasProject):CanvasProject {
 if(project.studioScene){const scene=wireStudioStoryboards(project.studioScene);if(scene!==project.studioScene)project={...project,studioScene:scene};}
 project=restoreAnalysisHandoff(project);
 project=upgradeOmniReferencePrompts(upgradeDepthScriptInputs(upgradeDepthReferences(project)));
 const kind=videoWorkflowKind(project.studioScene),scene=project.studioScene;
 if(!kind||!scene)return project;
 let changed=false;
 const nodes=scene.nodes.map(n=>{
  const s=compilerSettings(n),analysis=n.id.endsWith('-analysis'),frame=n.id.endsWith('-keyframe'),video=n.id.endsWith('-video');
  if(s.beikeStoryboardSceneSourceId||!analysis&&!frame&&!video||video&&s.beikeCompilerSource)return n;
  const fallback=kind==='depth-copy'?(analysis?videoCopyAnalysisPrompt:frame?videoCopyKeyframePrompt:depthCopyVideoPrompt):(analysis?w3CopyAnalysisPrompt:frame?w3CopyKeyframePrompt:w3CopyVideoPrompt);
  const original=typeof n.prompt==='string'&&n.prompt.trim()?n.prompt:analysis&&typeof s.textNodeDraftPrompt==='string'&&s.textNodeDraftPrompt.trim()?s.textNodeDraftPrompt:fallback;
  const previous=fallback.split('\n【节点交接规范】')[0];
  const refreshed=kind==='depth-copy'&&original.startsWith(previous)&&(original===previous||original.startsWith(`${previous}\n用户补充要求：\n`))?fallback+original.slice(previous.length):original;
  const cleaned=kind==='depth-copy'?removeLegacyDuplicate(refreshed,fallback,frame,analysis):refreshed;
  const prompt=kind==='depth-copy'?bindVideoWorkflowReferences(scene,n,cleaned,fallback):cleaned;
  const patch:Record<string,unknown>={};
  if(analysis){if(!s.textNodeDraftPrompt||prompt!==original)patch.textNodeDraftPrompt=prompt;if(s.beikeTextResultRequired!==true)patch.beikeTextResultRequired=true;if(s.textNodeComposerPromptExpanded!==true)patch.textNodeComposerPromptExpanded=true;}
  if(video&&s.beikeVideoWorkflow!==kind)patch.beikeVideoWorkflow=kind;
  if(n.prompt===prompt&&!Object.keys(patch).length)return n;
  changed=true;return {...n,prompt,settings:{...s,...patch}};
 });
 const upgraded=pruneVideoWorkflowNodes(upgradeVideoWorkflowNodes(upgradeVideoReferencePreparation(upgradeStudioCompiler(changed?{...project,studioScene:{...scene,nodes}}:project))));
 const wired=wireStudioStoryboards(upgraded.studioScene!);
 return wired===upgraded.studioScene?upgraded:{...upgraded,studioScene:wired};
}

function applyOriginalStoryboardScene(project:CanvasProject):CanvasProject {
 const scene=project.studioScene;
 const video=scene?.nodes.find(n=>n.id.endsWith('-video')&&compilerSettings(n).beikeVideoWorkflow==='depth-copy');
 if(!scene||!video)return project;
 if(compilerSettings(video).beikeOriginalStoryboardScene===true)return compilerSettings(video).beikeStoryboardLabelsVersion===1?project:labelStoryboardNodes(project,video.id.slice(0,-6));
 const prefix=video.id.slice(0,-6),sourceId=prefix+'-source',backgroundId=prefix+'-background';
 const compilerId=compilerSettings(video).beikeCompilerSource;
 const targets=new Set([prefix+'-analysis',prefix+'-keyframe',compilerId,video.id]);
 const background=scene.nodes.find(n=>n.id===backgroundId);
 const sceneIds=new Set([backgroundId,...scene.nodes.filter(n=>compilerSettings(n).beikeReferencePreparationRole==='scene').map(n=>n.id)]);
 const frameId=prefix+'-keyframe';
 const inputIds=[prefix+'-product',prefix+'-person'];
 const replacedPreparations=new Set(scene.nodes.filter(n=>n.id.startsWith(prefix+'-')&&['identity','product'].includes(String(compilerSettings(n).beikeReferencePreparationRole))).map(n=>n.id));
 const connections=scene.connections.flatMap(e=>{
  if(!targets.has(e.to))return [e];
  const sources=studioEdgeSources(e,scene),remaining=sources.filter(id=>!sceneIds.has(id)&&(e.to!==frameId||!replacedPreparations.has(id)));
  if(remaining.length===sources.length)return [e];
  return remaining.map(from=>({...e,id:`${e.id}-keep-${from}`,from,fromGroupId:undefined,fromGroupNodeIds:undefined}));
 });
 for(const from of inputIds)if(scene.nodes.some(n=>n.id===from)&&scene.nodes.some(n=>n.id===frameId)&&!connections.some(e=>e.to===frameId&&studioEdgeSources(e,scene).includes(from)))connections.push({id:`${from}-storyboard-${frameId}`,from,to:frameId});
 const keepBackground=background&&(studioNodeMedia(background).url||background.isGenerating||background.missingMedia||compilerSettings(background).generationVersions||connections.some(e=>e.to===backgroundId||studioEdgeSources(e,scene).includes(backgroundId)));
 const nodes=scene.nodes.filter(n=>n!==background||keepBackground).map(n=>{
  const settings={...compilerSettings(n)};
  const analysis=n.id===prefix+'-analysis',frame=n.id===prefix+'-keyframe';
  if(n.id===prefix+'-guide')return {...n,settings:{...settings,text:storyboardSceneGuide}};
  if(n===background)return {...n,nodeName:'旧背景素材 · 未接入复刻'};
  if((sceneIds.has(n.id)||replacedPreparations.has(n.id))&&n.id!==backgroundId&&n.id.startsWith(prefix+'-'))return {...n,settings:{...settings,beikeReferencePreparationEnabled:false}};
  if(n.id===prefix+'-brief'&&settings.text==='填写商品名称、已核实卖点、要保留的外观细节、替换场景，以及台词和声音要求。')return {...n,settings:{...settings,text:'填写商品名称、已核实卖点、要保留的外观细节，以及台词和声音要求。场景、道具和光线默认沿用原片。'}};
  if(n===video)return {...n,settings:{...settings,beikeOriginalStoryboardScene:true}};
  if(!analysis&&!frame&&n.id!==compilerId)return n;
  const previous=String((analysis&&settings.textNodeDraftPrompt)||n.prompt||'');
  const base=analysis?videoCopyAnalysisPrompt:frame?videoCopyKeyframePrompt:depthCopyVideoPrompt;
  const old=previous.replace(/\n【场景来源选择】[\s\S]*?【场景来源选择结束】/g,'');
  const normalize=(s:string)=>s.replace(/@(图片|视频)\d+/g,'@$1');
  const custom=normalize(old).startsWith(normalize(base))?old.slice(base.length).trim():old.trim();
  const prompt=(analysis?storyboardAnalysisPrompt:frame?storyboardImagePrompt:storyboardVideoPrompt)+(custom?'\n附加要求（场景与人物素材分工按上文执行）：\n'+custom.replace(/【使用片段[：:]\s*\d+】/g,''):'');
  return {...n,prompt,settings:{...settings,beikeStoryboardSceneSourceId:sourceId,
   ...(analysis?{textNodeDraftPrompt:prompt,beikeTextImageCount:3,...(settings._chatCompletedAt||n.content||settings.text?{beikeSourceVideoChangedAt:Math.max(Date.now(),Number(settings._chatCompletedAt||0)+1)}:{})}:frame?{beikeRequiredInputs:inputIds,beikeReferenceInputIds:inputIds}:{beikeCompilerApproved:undefined,beikeCompilerInputKey:undefined})}};
 });
 return labelStoryboardNodes({...project,studioScene:wireStudioStoryboards({...scene,nodes,connections})},prefix);
}

function labelStoryboardNodes(project:CanvasProject,prefix:string):CanvasProject {
 const scene=project.studioScene!;
 const labels:Record<string,string>={
  [prefix+'-analysis']:'05 分析原片分镜',
  [prefix+'-keyframe']:'06 开场整合图 · 沿用原片场景',
  [prefix+'-background']:'旧背景（停用）',
 };
 const brief=prefix+'-brief';
 let changed=false;
 const nodes=scene.nodes.map(node=>{
  const label=labels[node.id];
  const s=compilerSettings(node);
  if(node.id===prefix+'-video'){changed=true;return {...node,settings:{...s,beikeStoryboardLabelsVersion:1}};}
  if(node.id===brief&&String(s.text||'').trim()==='填写商品名称、已核实卖点、要保留的外观细节、替换场景，以及台词和声音要求。'){
   changed=true;return {...node,settings:{...s,text:'填写商品、服装细节及声音要求。背景、道具和光线沿用原片分镜。'}};
  }
  if(!label||node.nodeName===label)return node;
  changed=true;return {...node,nodeName:label};
 });
 return changed?{...project,studioScene:{...scene,nodes}}:project;
}

/** Native media/processing/generation nodes; creation never submits a task. */
export function createVideoWorkflowProject(kind: VideoWorkflowKind, id: string, now: number): CanvasProject {
  const project = applyOriginalStoryboardScene(buildVideoWorkflowProject(kind,id,now));
  const scene = project.studioScene;
  if (kind !== 'depth-copy' || !scene) return project;

  // Storyboard sheets automatically stack beside the source, in their own column.
  const layout: Record<string, { x: number; y: number; nodeName?: string }> = {
    source: { x: 80, y: 120 },
    product: { x: 80, y: 520 },
    person: { x: 80, y: 920 },
    brief: { x: 880, y: 520, nodeName: '04 创作要求 · 卖点与声音' },
    analysis: { x: 880, y: 120 },
    keyframe: { x: 1320, y: 120 },
    prompt: { x: 1760, y: 120, nodeName: '07 优化并确认视频提示词' },
    video: { x: 2200, y: 120 },
    preview: { x: 2640, y: 120, nodeName: '09 预览成片' },
    save: { x: 3080, y: 120, nodeName: '10 保存成片' },
    compose: { x: 2640, y: 460, nodeName: '可选 · 回贴原声（WebM）' },
    guide: { x: 1320, y: 620, nodeName: '走查顺序' },
  };
  const nodes = scene.nodes.map(node => {
    const key = node.id.slice(id.length + 1);
    const placement = layout[key];
    if (!placement) return node;
    return {
      ...node,
      ...placement,
      ...(key === 'guide' ? {
        settings: {
          ...compilerSettings(node),
          text: '① 上传原片、商品图和人物图，按需填写创作要求。检查原片自动抽出的分镜，确认人脸遮挡和顺序。\n② 运行05并检查分镜，再运行06生成一张开场参考图，检查人物、商品和光线。\n③ 在07优化并确认提示词和视频参数，运行08。生成后在09预览、10保存。\n需要原声时，单独运行回贴原声节点，在该节点查看 WebM 结果。',
        },
      } : {}),
    };
  });
  return { ...project, studioScene: { ...scene, nodes, view: { ...scene.view, zoom: 0.43 } } };
}

/** Base graph also used to recover the original delivered templates. */
export function buildVideoWorkflowProject(kind: VideoWorkflowKind, id: string, now: number): CanvasProject {
  const depth = kind === 'depth-copy';
  const analysisPrompt = depth ? videoCopyAnalysisPrompt : w3CopyAnalysisPrompt;
  const nodes: StudioScene['nodes'] = [];
  const connections: StudioScene['connections'] = [];
  const node = (key:string,type:string,name:string,x:number,y:number,settings:Record<string,unknown>={},prompt='') => {
    nodes.push({id:`${id}-${key}`,type,nodeName:name,x,y,width:340,height:300,prompt,settings});
  };
  const link = (from:string,to:string) => connections.push({id:`${id}-${from}-${to}`,from:`${id}-${from}`,to:`${id}-${to}`});
  node('source','input-image','01 上传参考视频',80,120,{mediaType:'video'});
  node('product','input-image','02 上传商品 / 服装参考图',80,510,{mediaType:'image'});
  node('person','input-image','03 上传目标人物图',80,900,{mediaType:'image'});
  node('background','input-image','04 上传场景 / 背景图',80,1290,{mediaType:'image'});
  node('brief','text-node',depth?'创作要求 · 商品与声音':'创作要求 · 15秒静音',500,900,{text:depth?'填写商品名称、已核实卖点、要保留的外观细节、替换场景，以及台词和声音要求。':'成片固定为单条15秒、竖屏9:16、全程静音，无台词、音乐、环境声或音效。人物、商品和背景分别以当前连接的参考图为准。原片只供分析动作与镜头；取舍重复动作，保持自然速度，不把整段原片加速塞进15秒。',aiGenerated:true});
  node('analysis','text-node','05 分析原片与改编分镜',500,120,{textNodeComposerPromptExpanded:true,textNodeDraftPrompt:analysisPrompt,beikeTextResultRequired:true,beikeTextImageCount:3},analysisPrompt);
  link('source','analysis'); link('product','analysis'); link('person','analysis'); link('brief','analysis');
  link('background','analysis');
  node('keyframe','gen-image',depth?'06 制作人物、商品与场景参考图':'06 制作目标人物与商品主图',920,650,{ratio:'9:16',batchCount:1,beikeRequiredInputs:[`${id}-product`,`${id}-person`],...(!depth ? {beikeStoryboardKeyframe:true} : {beikeOmniReferenceImage:true})},
    depth ? videoCopyKeyframePrompt : w3CopyKeyframePrompt);
  link('product','keyframe');link('person','keyframe');link('brief','keyframe');link('analysis','keyframe');
  link('background','keyframe');
  if(depth) {
    node('depth','gen-video','07 本地深度视频转换',920,120,{beikeOperation:'depth-video',model:'beike:depth:video',beikeRequiredInputs:[`${id}-source`]},'本地深度动作提取');
    link('source','depth');
  } else {
    node('frames','video-input','07 参考片抽帧 / 镜头检查',920,120);
    link('source','frames');
  }
  node('video','gen-video',depth?'08 生成复刻视频':'08 生成15秒静音视频 · 秘塔H3 / 768P',1340,350,{ratio:'9:16',resolution:depth?'480P':'768P',duration:'15s',beikeRequiredInputs:[`${id}-keyframe`,`${id}-analysis`],
    beikeAnalysisHandoffVersion:1,beikeVideoWorkflow:kind,...(depth?{model:'doubao-seedance-2.0-mini',beikeReferenceVersion:3,beikeScriptOnly:true,beikeScriptModeVersion:2,beikeOptimizePrompt:true,beikeVideoMode:'omni'}:{}),...(!depth ? {model:'MiniMax-H3',beikeVideoWorkflow:'w3-copy',beikeWorkflowVersion:W3_WORKFLOW_VERSION,beikeVideoMode:'first_frame',beikeVideoAudio:false,beikeOptimizePrompt:false} : {})},depth ? depthCopyVideoPrompt : w3CopyVideoPrompt);

  link('keyframe','video');link('analysis','video');
  if(depth) {
    node('compose','gen-video','09 回贴原声 / 合成 WebM',1760,120,{beikeOperation:'compose-original',beikeOriginalNodeId:`${id}-source`,beikeRequiredInputs:[`${id}-source`,`${id}-video`]},'保留原视频音轨，按连接顺序拼接生成片段。浏览器实时合成 WebM，请保持页面可见。');
    link('video','compose');
  }
  node('preview','preview','10 预览成片',2180,120);
  link(depth?'compose':'video','preview');
  node('timeline','video-timeline','10 剪辑时间线：导入生成片段',1760,800,{videoTimelineSources:[],videoTimelineClips:[],videoTimelinePixelsPerSecond:12,videoTimelineZoomVersion:2,videoTimelineMuted:false});
  // Timeline has its own clip picker and deliberately does not accept graph edges.
  node('save','local-save','12 保存生成结果',2600,120);
  link(depth?'compose':'video','save');
  node('guide','text-node','使用顺序与成片要求',1340,900,{aiGenerated:true,text:
    depth ? '从左向右操作：上传素材 → 编辑商品要求 → 运行分镜分析 → 生成人物、商品与场景参考图 → 检查文字分镜 → 按所选模型优化提示词 → 以目标图作全能参考生成 → 预览 → 在剪辑时间线选取生成片段 → 保存。\n长片按已确认的分镜复制视频节点并分别设置时长，不能用默认 5 秒代替整片。\n原声合成节点会将连接的生成片段顺序拼接并回贴原声，输出 WebM（不是 MP4），需保持页面可见；原声不足时尾部静音。改写台词请直接预览和下载生成节点的模型声音，不运行原声回贴。去字幕尚未接入。时间线用于修剪预览，其桌面合并导出不适用于浏览器。当前使用贝壳模型网关。07深度转换仅供人工检查，不提交给视频模型。'
    : '先复制本模板，再替换01原视频、02商品图、03人物图、04背景图。节点提示词与连线已经配置，无需重新填写。\n换好四项素材后，点击画布右下角“一键运行W3复刻”，自动分析分镜 → 生成单张首帧 → H3生成视频 → 移除音轨并校验15秒768P成片。任一步失败停止后续步骤；无声处理失败可单独重试，不重新生成。运行时保持画布打开。07抽帧仅供人工检查，剪辑时间线为可选工具。\n默认秘塔MiniMax-H3、首帧模式、768P、15秒、静音，不调用额外的视频提示词优化。05只输出一个【视频片段 01｜时长 15 秒】，06只接收全片一致性和首帧姿态，不接收动作时间轴，不画分镜拼图。\n原视频只进入05分析和07人工抽帧。08只连接05分镜与06目标首帧，不上传原视频、人物原图、商品原图、背景原图或音频；画面结果直接进入预览和保存，不回贴原声。\n本模板没有预置素材、分镜结果、关键帧、成片或任务记录；复制后再运行。'});
  return pruneVideoWorkflowNodes(upgradeVideoWorkflowNodes(upgradeVideoReferencePreparation(upgradeStudioCompiler({id,title:depth?'深度视频复刻 · 电商视频':'W3复刻模板',createdAt:now,updatedAt:now,draft:false,nodes:[],edges:[],
    studioScene:{nodes,connections,groups:[],textBoxes:[],strokes:[],view:{x:40,y:60,zoom:0.55}}}))));
}

/** Upgrade the two delivered projects and retire their eight obsolete explanatory cards. */
export function upgradeVideoWorkflowProject(project:CanvasProject):CanvasProject {
  return applyOriginalStoryboardScene(recoverVideoWorkflowProject(project));
}

function recoverVideoWorkflowProject(project:CanvasProject):CanvasProject {
  const kinds:Record<string,VideoWorkflowKind> = {
    'canvas-proj-4d8c2240-3ae8-4a81-bfda-bf73851516f6':'depth-copy',
    'canvas-proj-827c82ad-c7bc-4b5e-a8ef-d6c29022096d':'w3-copy',
  };
  const kind=kinds[project.id];
  const scene=project.studioScene;
  if(!kind || !scene?.nodes.length) return restoreVideoWorkflowPrompts(project);
  const retiredIds=new Set(Array.from({length:8},(_,i)=>`${project.id}-step-${i}`));
  const removed=new Set(scene.nodes.filter(n=>n.type==='text-node' && retiredIds.has(n.id)).map(n=>n.id));
  let next=project;
  if(removed.size && removed.size!==scene.nodes.length) next={...project,updatedAt:Date.now(),studioScene:{...scene,
    nodes:scene.nodes.filter(n=>!removed.has(n.id)),
    connections:scene.connections.filter(edge=>!removed.has(edge.from)&&!removed.has(edge.to)),
  }};
  else if(removed.size) next={...project,studioScene:buildVideoWorkflowProject(kind,project.id,project.createdAt).studioScene,updatedAt:Date.now()};
  return restoreVideoWorkflowPrompts(kind==='w3-copy' ? upgradeW3StoryboardProject(next) : next);
}

/** The delivered W3 project is explicitly upgraded; media, output versions and geometry stay intact. */
function upgradeW3StoryboardProject(project:CanvasProject):CanvasProject {
  const scene=project.studioScene!,id=project.id;
  const video=scene.nodes.find(n=>n.id===`${id}-video`);
  if(!video || (video.settings as Record<string,unknown>)?.beikeWorkflowVersion===W3_WORKFLOW_VERSION) return project;
  const template=buildVideoWorkflowProject('w3-copy',id,project.createdAt).studioScene!;
  const prompts=new Map([['analysis',videoCopyAnalysisPrompt],['keyframe',videoCopyKeyframePrompt],['video',videoCopyVideoPrompt]]);
  const nodes=scene.nodes.map(node=>{
    const key=node.id.slice(id.length+1),fresh=template.nodes.find(n=>n.id===node.id);
    if(!fresh || !['analysis','keyframe','video','guide','compose'].includes(key))return node;
    const previous=node.settings as Record<string,unknown> || {},defaults=fresh.settings as Record<string,unknown>;
    if(key==='guide')return {...node,settings:{...previous,text:defaults.text}};
    if(key==='compose')return {...node,nodeName:fresh.nodeName,prompt:fresh.prompt};
    const custom=typeof node.prompt==='string' && node.prompt!==prompts.get(key) && node.prompt!==fresh.prompt
      && node.prompt!==previous.text && node.prompt!==node.content ? node.prompt : '';
    const prompt=String(fresh.prompt)+(custom ? `\n用户补充要求：\n${custom}` : '');
    const settings={...previous,...defaults,...(key==='analysis'?{text:previous.text,textNodeDraftPrompt:prompt}:{}),
      ...(key==='keyframe'?{model:previous.model}:{} )};
    return {...node,nodeName:fresh.nodeName,prompt,settings};
  });
  // Detach original/depth/video references without deleting user media or their other connections.
  const types=new Map(nodes.map(n=>[n.id,n]));
  const connections=scene.connections.filter(edge=>edge.to!==video.id || ![edge.from,...(Array.isArray(edge.fromGroupNodeIds)?edge.fromGroupNodeIds as string[]:[])].some(from=>{
    const n=types.get(from),settings=n?.settings as Record<string,unknown> | undefined;
    return n?.type==='gen-video'||n?.type==='video-input'||settings?.mediaType==='video';
  })).map(edge=>edge.from===`${id}-compose` && [`${id}-preview`,`${id}-save`].includes(edge.to) ? {...edge,from:video.id} : edge);
  for(const edge of template.connections.filter(e=>[`${id}-analysis`,`${id}-keyframe`,video.id].includes(e.to))) {
    if(types.has(edge.from)&&types.has(edge.to)&&!connections.some(e=>e.from===edge.from&&e.to===edge.to))connections.push(edge);
  }
  return {...project,updatedAt:Date.now(),studioScene:{...scene,nodes,connections}};
}

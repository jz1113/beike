import { resolveRefMediaIdentity } from '@client/shared/media/refMediaRegistry';
import { parseSubjectMention, PROMPT_MENTION_REGEX } from '@shared/domain/prompts/prompt-engine/mentions';
import type { StudioScene } from './types';

type Node = StudioScene['nodes'][number];
type Edge = StudioScene['connections'][number];
export type StudioConnectionChange = { kind:'add'|'reconnect'; from:string; to:string; id?:string } | {kind:'remove';id:string};
export type StudioConnectionCommands = { read:()=>StudioScene; apply:(change:StudioConnectionChange)=>StudioScene };
const settingsOf = (node:Node) => node.settings as Record<string,unknown> || {};
const text = (value:unknown) => typeof value==='string'?value.trim():'';
export const compilerSettings = settingsOf;
export const studioNodeLabel = (node:Node) => text(node.nodeName) || node.type || node.id;

export function sortStudioMediaReferences<T>(refs: T[], settings: unknown, urlOf: (ref: T) => string | undefined): T[] {
  const options = settings as Record<string, unknown> | undefined;
  const order = options?.inputItemOrder || options?.inputImageOrder;
  if (!Array.isArray(order)) return refs;
  const positions = new Map(order.filter((url): url is string => typeof url === 'string').map((url, index) => [url, index]));
  return refs.sort((a, b) => (positions.get(urlOf(a) ?? '') ?? Infinity) - (positions.get(urlOf(b) ?? '') ?? Infinity));
}

type Reference = {nodeId:string;type:string};
type EditorReference = {nodeId:string;mediaType:string;position1Based:number|string};

/** Bind workflow roles to source nodes, then number them in the caller's actual order. */
export function studioStoryboardRoles(scene:StudioScene,targetId:string,refs:ReadonlyArray<EditorReference>) {
 const target=scene.nodes.find(n=>n.id===targetId);
 if(!target)return [];
 const settings=compilerSettings(target),sourceId=settings.beikeStoryboardSceneSourceId;
 if(typeof sourceId!=='string'||(target.type!=='text-node'||!settings.beikeTextResultRequired)&&(target.type!=='gen-image'||!settings.beikeOmniReferenceImage))return [];
 const prefix=sourceId.replace(/-source$/,'');
 const nodes=new Map(scene.nodes.map(n=>[n.id,n]));
 return refs.flatMap(({nodeId,mediaType,position1Based})=>{
  const source=nodes.get(nodeId);
  if(!source)return [];
  const s=compilerSettings(source);
  const label=mediaType==='image'?'图片':mediaType==='video'?'视频':mediaType==='text'?'文本':'音频';
  const token=`@${label}${String(position1Based).replace(/^text:/,'')}`;
  let role:string;
  if(nodeId===sourceId&&mediaType==='video')role='原片视频：观察动作、镜头、节奏与声音；不采用原人物身份或原服装';
  else if(mediaType==='image'&&nodeId===prefix+'-person')role='目标人物身份和脸，以及发型与体态；不采用原服装或背景';
  else if(mediaType==='image'&&nodeId===prefix+'-product')role='目标服装与商品外观，包括款式、颜色与材质；不采用模特身份或背景';
  else if(mediaType==='image'&&s.beikeStoryboardSourceId===sourceId&&s.beikeStoryboardFacesMasked===true&&s.beikeStoryboardActive!==false)
   role=`原片遮脸分镜第${Number(s.beikeStoryboardPageIndex||0)+1}页；${target.type==='gen-image'?'只用开场对应格的背景、道具与光线':'用于核对各镜的动作、机位、场景、道具与光线'}，不采用原脸或原服装`;
  else if(mediaType==='text'&&target.type==='gen-image'&&nodeId===prefix+'-analysis')role='05 分镜分析：读取全片一致性与参考图制作要求，定位开场对应格';
  else return [];
  return [{token,role,nodeId}];
 });
}

export function studioStoryboardRoleBlock(scene:StudioScene,targetId:string,media:ReadonlyArray<Reference>,textIds:ReadonlyArray<string>=[]) {
 const rows=studioStoryboardRoles(scene,targetId,[
  ...media.map((ref,index)=>({nodeId:ref.nodeId,mediaType:ref.type,position1Based:index+1})),
  ...textIds.map((nodeId,index)=>({nodeId:nodeId,mediaType:'text',position1Based:`text:${index+1}`})),
 ]);
 return rows.length?`【素材职责】\n${rows.map(({token,role})=>`${token}：${role}`).join('\n')}\n【素材职责结束】`:'';
}

type MediaReference = Reference & {url:string;assetId?:string};
type LoadedReference = Omit<MediaReference,'nodeId'> & {originalUrl?:string;sourceNodeId?:string};

/** Use the exact media order handed to the text transport; refuse ambiguous or missing sources. */
export function studioStoryboardAnalysisBlock(scene:StudioScene,targetId:string,expected:ReadonlyArray<MediaReference>,loaded:ReadonlyArray<LoadedReference>) {
 const refs=loaded.map(item=>{
  const matches=expected.filter(ref=>ref.type===item.type&&(
   ref.url===item.originalUrl||ref.url===item.url||ref.assetId&&ref.assetId===item.assetId));
  return matches.find(ref=>ref.nodeId===item.sourceNodeId)||(matches.length===1?matches[0]:undefined);
 });
 const bound=refs.filter((ref):ref is MediaReference=>Boolean(ref));
 if(bound.length!==loaded.length||bound.length!==expected.length||new Set(bound).size!==expected.length)
  throw new Error('分析素材与画布连线不一致，本次未发送；请检查参考素材后重试。');
 const block=studioStoryboardRoleBlock(scene,targetId,bound);
 return block+'\n输出分镜和参考图制作要求时，请使用素材用途名称，不沿用本节点的 @ 编号；下游会按自己的素材顺序重新绑定。';
}

export function studioCompilerSource(scene:StudioScene,nodeId:string) {
  const target=scene.nodes.find(n=>n.id===nodeId),declared=target&&compilerSettings(target).beikeCompilerSource;
  const edges=scene.connections.filter(e=>e.to===nodeId);
  const sources=edges.map(e=>scene.nodes.find(n=>n.id===e.from)).filter(n=>n&&compilerSettings(n).beikePromptCompiler===true);
  if(sources.length>1)throw new Error('08只能连接一个07提示词优化节点');
  if(declared && (!sources[0] || sources[0].id!==declared))throw new Error('07提示词优化节点已断开，请恢复连线并重新确认');
  if(sources[0]) {
    const images=new Set(scene.connections.filter(e=>e.to===sources[0]!.id).map(e=>e.from));
    if(edges.some(e=>e.from!==sources[0]!.id && (!images.has(e.from)||!scene.nodes.some(n=>n.id===e.from&&(n.type==='gen-image'||n.type==='input-image'&&!['video','audio'].includes(String(compilerSettings(n).mediaType)))))))throw new Error('08参考素材须与07一致，请先将素材连接到07并重新优化确认');
  }
  return sources[0];
}

export function studioCompilerKey(node:StudioScene['nodes'][number],inputs:unknown) {
 const s=compilerSettings(node);
 return JSON.stringify({storyboardContract:s.beikeScriptOnly===true?1:undefined,inputs:stableCompilerInputs(inputs),model:s.model,duration:s.duration,audio:s.beikeVideoAudio,ratio:s.ratio,resolution:s.resolution,mode:s.beikeVideoMode});
}

/** Only cache-backed media can change URL without changing its identity. */
function stableCompilerInputs(inputs:unknown):unknown {
 if(!inputs||typeof inputs!=='object'||!('refs' in inputs)||!Array.isArray(inputs.refs))return inputs;
 return {...inputs,refs:inputs.refs.map((ref:Record<string,unknown>)=>ref.assetId&&typeof ref.url==='string'&&/^(blob:|local-asset:)/.test(ref.url)?{...ref,url:`local-asset://${encodeURIComponent(String(ref.assetId))}`}:ref)};
}

export function studioCompilerKeyMatches(saved:unknown,node:StudioScene['nodes'][number],inputs:unknown):boolean {
 if(typeof saved!=='string')return false;
 try {
  const previous=JSON.parse(saved);
  return JSON.stringify({...previous,inputs:stableCompilerInputs(previous.inputs)})===studioCompilerKey(node,inputs);
 }catch{return false;}
}

/** Downstream generation has one configuration owner; local picker values cannot override it. */
export function inheritStudioCompiler(node:StudioScene['nodes'][number],scene:StudioScene) {
 const source=studioCompilerSource(scene,node.id);
 if(!source)return node;
 const s=compilerSettings(source);
 return {...node,prompt:'',settings:{...compilerSettings(node),model:s.model,duration:s.duration,ratio:s.ratio,resolution:s.resolution,beikeVideoAudio:s.beikeVideoAudio,beikeVideoMode:s.beikeVideoMode,beikeScriptOnly:false,beikeOptimizePrompt:false,inputItemOrder:s.inputItemOrder,inputImageOrder:s.inputImageOrder,beikeCompilerSource:source.id}};
}

const imageNode=(scene:StudioScene,id:string)=>{const n=scene.nodes.find(n=>n.id===id);return n&&(n.type==='gen-image'||n.type==='input-image'&&!['video','audio'].includes(String(compilerSettings(n).mediaType)));};

/** Both visible inputs are the same ordered image set; changes on either end update its pair. */
export function mirrorStudioCompilerConnections(scene:StudioScene,proposed=scene.connections) {
 let edges=[...proposed];
 for(const compiler of scene.nodes.filter(n=>compilerSettings(n).beikePromptCompiler)) {
  const videos=scene.nodes.filter(n=>compilerSettings(n).beikeCompilerSource===compiler.id);
  for(const video of videos) {
   const targets=new Set([compiler.id,video.id]);
   const old=scene.connections.filter(e=>targets.has(e.to)&&imageNode(scene,e.from));
   const current=edges.filter(e=>targets.has(e.to)&&imageNode(scene,e.from));
   const removed=new Set(old.filter(e=>!current.some(n=>n.from===e.from&&n.to===e.to)).map(e=>e.from));
   const added=current.filter(e=>!old.some(n=>n.from===e.from&&n.to===e.to)).map(e=>e.from);
   const ids=[...new Set([...current.filter(e=>e.to===compiler.id).map(e=>e.from),...added])].filter(id=>!removed.has(id)||added.includes(id));
   edges=edges.filter(e=>!targets.has(e.to)||!imageNode(scene,e.from));
   for(const to of [compiler.id,video.id])for(const from of ids)edges.push(current.find(e=>e.from===from&&e.to===to)||{id:`${from}-shared-${to}`,from,to});
  }
 }
 return edges;
}

const rolesPattern=/【素材职责】[\s\S]*?【素材职责结束】/g;
export const stripVideoPromptRoles=(prompt:string)=>prompt.replace(rolesPattern,'').trim();

export function studioVideoPromptRoles(scene:StudioScene,refs:ReadonlyArray<{nodeId:string;position1Based?:number}>,storyboardSceneSource:unknown) {
 const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
 const role=(node:Node)=>compilerSettings(node).beikeStoryboardFacesMasked===true?'原片逐秒分镜参考：保留动作顺序、镜头构图、机位、场景、道具与接触关系、光线和切点；遮挡区域不是目标外观，不生成黑块，不采用原人物身份、原脸或原服装。最终输出连续视频，不输出宫格、时间码或拼图':node.id.endsWith('-keyframe')&&storyboardSceneSource?'目标人物身份与服装商品外观参考；各镜场景、道具和光线以遮脸分镜对应画面为准，不锁定姿势或首尾帧':node.id.endsWith('-keyframe')?'整体外观与光色参考；已连接文字若限定更小范围则按其要求，不锁定姿势或首尾帧':node.id.endsWith('-product')?'仅提供商品或服装款式、结构、固有色与材质，不采用原背景':node.id.endsWith('-person')?'仅提供人物身份、面容、发型和体态，不采用原服装与背景':node.id.endsWith('-background')?'仅提供场景布局、地面、透视及现场光向':`参考用途以已连接文字中对「${typeof node.nodeName==='string'&&node.nodeName.trim()||node.type||node.id}」的要求为准，不猜测画面`;
 const rows=refs.flatMap((ref,index)=>{
  const node=nodes.get(ref.nodeId);
  return node?[`@图片${ref.position1Based??index+1}：${role(node)}`]:[];
 });
 return rows.length?`【素材职责】\n${rows.join('\n')}\n【素材职责结束】`:'';
}

function labelSource(value: string, index: number, names?: readonly string[]) {
  const name = names?.[index]?.replace(/[】\r\n]/g, ' ').trim();
  return names ? `【@文本${index+1} · ${name || '上游文字'}】\n${value}` : value;
}

/** Only the selected executable segment crosses into image/video generation. */
export function selectVideoCopyStoryboard(texts: string[], prompt: string, names?: readonly string[]) {
  const selected = Number(prompt.match(/【使用片段[：:]\s*(\d+)】/)?.[1] || 1);
  const scripts = texts.filter(value => value.includes('【全片一致性】') && value.includes('【视频片段 '));
  if (scripts.length !== 1) throw new Error('请先运行 05 分镜分析，并连接一份包含全片一致性和视频片段标记的分镜结果');
  const script = scripts[0];
  const consistency = script.match(/【全片一致性】([\s\S]*?)【全片一致性结束】/)?.[1].trim();
  const segments = [...script.matchAll(/【视频片段\s+(\d+)｜时长\s+(\d+)\s+秒】([\s\S]*?)【视频片段结束】/g)];
  const matches = segments.filter(segment => Number(segment[1]) === selected);
  if (!consistency || matches.length !== 1 || !matches[0][3].trim()) throw new Error(`分镜片段 ${selected} 缺失、重复或未完成，请检查 05 分镜结果和“使用片段”编号`);
  const segment = matches[0], duration = Number(segment[2]);
  if (duration < 4 || duration > 15) throw new Error('秘塔 H3 每个分镜片段需要 4–15 秒，请重新拆分脚本');
  const audioModes=[...consistency.matchAll(/【声音模式[：:](静音|生成声音)】/g)];
  if(audioModes.length!==1)throw new Error('请在全片一致性中明确【声音模式：静音】或【声音模式：生成声音】');
  const sourceIndex=texts.indexOf(script);
  const segmentText=`【全片一致性】\n${consistency}\n【本次生成片段 ${segment[1]}｜时长 ${duration} 秒】\n${segment[3].trim()}`;
  return { prompt: `${labelSource(segmentText,sourceIndex,names)}\n${prompt}`, duration, audio:audioModes[0][1]==='生成声音', sourceIndex };
}

/** Image generation needs the opening pose, not the executable motion timeline. */
export function selectVideoCopyKeyframe(texts: string[], prompt: string, names?: readonly string[]) {
  const selected=selectVideoCopyStoryboard(texts,prompt.match(/【使用片段[：:]\s*\d+】/)?.[0] || '【使用片段：01】');
  const consistency=selected.prompt.split('【本次生成片段')[0].trim();
  const opening=selected.prompt.match(/(?:^|\n)首帧[：:]([\s\S]*?)(?=\n(?:本地时间轴[：:]|结束状态[：:]|声音[：:]|【)|$)/)?.[1].trim();
  if(!opening)throw new Error('所选分镜缺少首帧描述，请先补充分镜首帧');
  const openingText=`${consistency}\n【只生成一张0秒首帧】\n${opening}`;
  const sources=names ? texts.map((value,index)=>labelSource(index===selected.sourceIndex ? openingText : value,index,names)).join('\n') : openingText;
  return {...selected,prompt:`${sources}\n${prompt}\n只画单张完整画面，不画分镜表、宫格、拼图、连续动作或多个时刻。`};
}

/** Keep observation reports and other segments outside the generation boundary. */
function section(value:string,name:string) {
 const start=`【${name}】`,end=`【${name}结束】`;
 if(value.split(start).length!==2||value.split(end).length!==2)throw new Error(`请重新运行05，确保只有一份完整的${name}`);
 if(value.indexOf(end)<value.indexOf(start))throw new Error(`05的${name}标记顺序错误`);
 const extracted=value.split(start)[1].split(end)[0].trim();
 if(!extracted)throw new Error(`05缺少${name}`);
 return extracted;
}
function scriptOf(texts:string[]) {
 const scripts=texts.filter(t=>t.includes('【全片一致性】'));
 if(scripts.length!==1)throw new Error('请连接一份已完成的05分镜结果');
 return scripts[0];
}
function appearanceText(value:string) {return value.replace(/(?:@(?:图片|视频|音频|文本|img)?|图片|图)\s*\d+(?:中的|所示)?/g,'');}
function sourceText(index:number,value:string) {
 return `【@文本${index+1} · 已连接文本（提取后）】\n${value}`;
}
export function omniCopyReferenceInputs(texts:string[],prompt:string) {
 const script=scriptOf(texts);
 const consistency=appearanceText(section(script,'全片一致性'));
 const reference=appearanceText(section(script,'参考图制作要求'));
 const appearance=`【全片一致性】\n${consistency}\n【全片一致性结束】\n【参考图制作要求】\n${reference}\n【参考图制作要求结束】`;
 const sources=texts.map((value,index)=>sourceText(index,value===script?appearance:value));
 return {prompt:[...sources,prompt].join('\n')};
}
function assertNoCompetingScript(value:string,source:string) {
 const ranges=[...value.matchAll(/(\d+(?:\.\d+)?)\s*(?:–|—|－|-|至|到|~|～)\s*\d+(?:\.\d+)?\s*(?:秒|s\b)/gi)];
 if(/【(?:全片一致性|视频片段|本次片段|使用片段|素材职责)|(?:开场画面|本地时间轴|结束状态|素材职责)[* \t]*(?:[：:]|[（(])|^\s*@图片\d+\s*[：:]/m.test(value)||ranges.length>1||ranges.some(m=>Number(m[1])===0))
  throw new Error(`${source}含第二套分镜脚本或素材职责。请移除冲突内容，只保留简短补充要求；时间轴和素材职责由05与当前连线确定。`);
}
export function omniCopyVideoInputs(texts:string[],prompt:string,{draft='',textNames=[],analysisIndex=-1}:{draft?:string;textNames?:string[];analysisIndex?:number}={}) {
 const sourceIndex=analysisIndex>=0?analysisIndex:texts.findIndex(value=>value.includes('【全片一致性】'));
 texts.forEach((value,index)=>{if(index!==sourceIndex)assertNoCompetingScript(value,`已连接文本「${textNames[index]||`文本${index+1}`}」`);});
 assertNoCompetingScript(prompt.replace(/【使用片段[：:]\s*\d+】/g,''),'07节点正文');
 assertNoCompetingScript(draft,'07草稿');
 const script=scriptOf(texts),consistency=section(script,'全片一致性');
 const selections=[...prompt.matchAll(/【使用片段[：:]\s*(\d+)】/g)];
 if(selections.length!==1)throw new Error('请在08明确且只填写一个【使用片段：01】编号');
 const selected=Number(selections[0][1]);
 const segments=[...script.matchAll(/【视频片段\s+(\d+)｜时长\s+(\d+)\s+秒】([\s\S]*?)【视频片段结束】/g)];
 const matches=segments.filter(m=>Number(m[1])===selected);
 if(matches.length!==1||!matches[0][3].trim())throw new Error('所选分镜片段缺失、重复或不完整，请检查05与08片段编号');
 const segment=matches[0],duration=Number(segment[2]);
 if(!Number.isSafeInteger(duration)||duration<=0)throw new Error('分镜时长必须为正整数秒');
 const modes=[...consistency.matchAll(/【声音模式[：:]\s*(静音|保留原声|生成声音)】/g)];
 if(modes.length!==1)throw new Error('请在05全片一致性中只填写一个声音模式标记：静音、保留原声或生成声音');
 const soundMode=modes[0][1],audio=soundMode==='生成声音';
 // Models may render the handoff fields as Markdown list items or bold labels.
 const body=segment[3].replace(/^[ \t]*(?:[-*+][ \t]+)?(?:\*\*)?(源片范围|源片取舍|目标时长|开场画面|本地时间轴|镜头风格与表演|结束状态|声音)(?:\*\*)?[ \t]*[：:](?:\*\*)?[ \t]*/gm,'$1：').trim();
 for(const label of ['开场画面','本地时间轴','结束状态'])if(!new RegExp(`(?:^|\\n)${label}[：:]`).test(body))throw new Error(`所选分镜缺少${label}`);
 const timelines=body.split(/(?:^|\n)本地时间轴[：:]/);
 if(timelines.length!==2)throw new Error('05所选片段必须只有一套本地时间轴');
 const timeline=timelines[1].split(/\n(?:镜头风格与表演|结束状态|声音)[：:]/)[0];
 const ranges=[...timeline.matchAll(/(\d+(?:\.\d+)?)\s*(?:–|—|-|至|到)\s*(\d+(?:\.\d+)?)\s*秒/g)];
 let end=0;
 for(const range of ranges){const start=Number(range[1]),next=Number(range[2]);if(start!==end||next<=start)throw new Error('分镜时间轴有空档、重叠或倒序，请修正05');end=next;}
 if(!ranges.length||end!==duration)throw new Error('分镜时间轴必须从0秒连续覆盖目标时长，请修正05');
 const cleanConsistency=consistency.replace(/【声音模式[：:]\s*(静音|保留原声|生成声音)】/g,'');
 const cleanBody=body.replace(/(?:^|\n)(?:源片范围|源片取舍)[：:][^\n]*/g,'').replace(audio?/$^/:/(?:^|\n)声音[：:][^\n]*/g,'').trim();
 const instruction=[prompt.replace(/【使用片段[：:]\s*\d+】/g,'').trim(),draft.trim()].filter(Boolean).join('\n');
 const selectedText=`【全片一致性】\n${cleanConsistency.trim()}\n【本次片段｜时长 ${duration} 秒】\n${cleanBody}`;
 const sources=texts.map((value,index)=>sourceText(index,value===script?selectedText:value));
 return {duration,audio,soundMode,prompt:`${sources.join('\n')}\n${instruction}\n声音：${audio?'仅按已确认的台词和声音要求生成。':'全程静音，无台词、音乐、环境声或音效。'}`};
}

export function omniCopyPreparationInputs(texts:string[],prompt:string,role:string) {
 const script=scriptOf(texts);
 const name=role==='identity'?'身份参考要求':role==='product'?'服装参考要求':'场景光线要求';
 const value=script.includes(`【${name}】`)?section(script,name):role==='scene'?section(script,'参考图制作要求'):section(script,'全片一致性');
 return {prompt:`【${name}】\n${appearanceText(value)}\n【${name}结束】\n${prompt}`};
}

/** Native thumbnail blob URLs belong to the old document; rebuild them from the retained media. */
export function restoreStudioReference(node:Node):Node {
  if(node.type!=='input-image')return node;
  const settings={...settingsOf(node)};
  if(!text(settings._canvasDisplayPreviewUrl).startsWith('blob:') && !text(settings._blobUrl).startsWith('blob:'))return node;
  for(const field of ['_canvasDisplayPreviewUrl','_blobUrl','_useCanvasPreviewDisplay','_dropPreviewPending'])delete settings[field];
  return {...node,settings};
}

export function studioNodeKind(node:Node): 'image'|'video'|'audio'|'text'|undefined {
  if (node.type==='text-node' || node.type==='video-analyze' || node.type==='script-parse') return 'text';
  if (node.type==='table-editor-node' && settingsOf(node).beikeNativeTool === true) return 'text';
  if (node.type==='rh-app' || node.type==='rh-comfy') {
    return node.videoUrl ? 'video' : settingsOf(node).audioUrl ? 'audio' : 'image';
  }
  if (node.type==='director-3d' || node.type==='global-perspective' || node.type==='jimeng-super-resolution') return 'image';
  if (node.type==='gen-image' || node.type==='image-tile' || (node.type==='video-input' && settingsOf(node).beikeNativeTool === true)) return 'image';
  if (node.type==='gen-video' || node.type==='video-input' || node.type==='motion-control') return 'video';
  if (node.type==='gen-speech' || node.type==='gen-music') return 'audio';
  if (node.type==='input-image' || node.type==='preview' || node.type==='canvas-node') {
    const kind=settingsOf(node).mediaType || node.previewType;
    return kind==='video'||kind==='audio'?kind:'image';
  }
}

export function studioEdgeSources(edge:Edge, scene:StudioScene):string[] {
  if (Array.isArray(edge.fromGroupNodeIds) && edge.fromGroupNodeIds.length) return edge.fromGroupNodeIds as string[];
  const group=scene.groups.find(item=>item && typeof item==='object' && (item as {id?:string}).id===edge.fromGroupId) as {nodeIds?:string[]} | undefined;
  return group?.nodeIds?.length?group.nodeIds:[edge.from];
}

export function canConnectStudioNodes(from:Node, to:Node, edges:Edge[] = [], inputType?:string):boolean|undefined {
  if (from.id===to.id) return false;
  if (edges.some(edge=>edge.from===from.id&&edge.to===to.id&&(edge.inputType||'default')===(inputType||'default'))) return false;
  const seen=new Set<string>();
  const visit=(id:string):boolean=>{
    if(id===from.id)return true;
    if(seen.has(id))return false;seen.add(id);
    return edges.some(edge=>(edge.from===id || Array.isArray(edge.fromGroupNodeIds)&&edge.fromGroupNodeIds.includes(id))&&visit(edge.to));
  };
  if(visit(to.id))return false;
  if(settingsOf(to).beikeCompilerSource && from.id!==settingsOf(to).beikeCompilerSource&&!['gen-image','input-image'].includes(from.type))return false;
  const kind=studioNodeKind(from);
  const targetSettings=settingsOf(to);
  if(kind==='video'&&targetSettings.beikeTextResultRequired===true&&typeof targetSettings.beikeStoryboardSceneSourceId==='string')
    return from.id===targetSettings.beikeStoryboardSceneSourceId;
  if(settingsOf(to).beikePromptCompiler===true&&settingsOf(to).beikeScriptOnly===false) return kind==='image'||kind==='text';
  if (!kind) return undefined;
  if (to.type==='gen-image') return kind==='image'||kind==='text';
  if (to.type==='gen-video' || to.type==='text-node' || to.type==='table-editor-node') return true;
  if (to.type==='script-parse') return kind==='text';
  if (to.type==='input-image') return kind==='image';
  if (to.type==='gen-3d') return kind==='image'||kind==='text';
  if (to.type==='gen-speech' || to.type==='gen-music') return kind==='text'||kind==='image'||kind==='audio';
  if (to.type==='local-save') return true;
  if (to.type==='preview' || to.type==='save') return kind!=='text';
}

export function changeStudioConnection(scene:StudioScene, change:StudioConnectionChange):StudioScene {
  if(change.kind==='remove') return {...scene,connections:mirrorStudioCompilerConnections(scene,scene.connections.filter(edge=>edge.id!==change.id))};
  const from=scene.nodes.find(node=>node.id===change.from),to=scene.nodes.find(node=>node.id===change.to);
  if(!from||!to)throw new Error('节点已不存在，请重新打开连线面板');
  const previous=change.kind==='reconnect'?scene.connections.find(edge=>edge.id===change.id):undefined;
  if(change.kind==='reconnect'&&!previous)throw new Error('连线已不存在，请重新选择');
  const remaining=scene.connections.filter(edge=>edge!==previous);
  if(remaining.some(edge=>edge.to===to.id && studioEdgeSources(edge,scene).includes(from.id))) throw new Error('这两个节点已连接');
  if(from.id===to.id)throw new Error('节点不能连接自身');
  if(canConnectStudioNodes(from,to,remaining,previous?.inputType as string|undefined)!==true) throw new Error('此连线会形成循环，或参考类型与目标不兼容');
  const edge:Edge={...previous,id:previous?.id || `conn-${crypto.randomUUID()}`,from:from.id,to:to.id};
  for(const field of ['fromGroupId','fromGroupNodeIds','toGroupId','toGroupNodeIds']) delete edge[field];
  return {...scene,connections:mirrorStudioCompilerConnections(scene,previous?scene.connections.map(item=>item===previous?edge:item):[...scene.connections,edge])};
}

/** Pointer and keyboard wiring use the same rules; retain untouched legacy edges. */
export function filterStudioConnections(scene:StudioScene, proposed:Edge[]):Edge[] {
  const previous=new Map(scene.connections.map(edge=>[edge.id,edge]));
  const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
  const accepted=proposed.filter(edge=>{
    const old=previous.get(edge.id);
    return old?.from===edge.from && old.to===edge.to;
  });
  const ids=new Set(accepted.map(edge=>edge.id));
  for(const edge of proposed) {
    if(ids.has(edge.id))continue;
    const from=nodes.get(edge.from),to=nodes.get(edge.to);
    if(from && to && canConnectStudioNodes(from,to,accepted,edge.inputType as string|undefined)!==false){accepted.push(edge);ids.add(edge.id);}
  }
  return mirrorStudioCompilerConnections(scene,proposed.filter(edge=>ids.has(edge.id)));
}

export function studioNodeMedia(node:Node):{url:string;assetId?:string} {
  const settings=settingsOf(node);
  if (settings.beikeNativeTool === true || node.type==='director-3d' || node.type==='global-perspective' || node.type==='jimeng-super-resolution') return { url: text(node.imageUrl) };
  if (node.type==='rh-app' || node.type==='rh-comfy') {
    const generated = settings.generatedImages as Array<{fullUrl?:string}> | undefined;
    return { url: text(node.videoUrl) || text(settings.audioUrl) || text(node.imageUrl) || text(generated?.[0]?.fullUrl) || text(node.content) };
  }
  const images=settings.generatedImages as Array<{fullUrl?:string}> | undefined;
  const versions=settings.generationVersions as Array<{content?:string;originalUrl?:string}> | undefined;
  const version=versions?.[Number(settings.activeGenerationVersionIndex)||0];
  const previewItems=(node.previewType==='video'?node.previewMjVideos:node.previewMjImages) as unknown[]|undefined;
  const preview=node.type==='preview' ? text(node.previewType==='video'?node.selectedPreviewVideo:node.selectedPreviewImage)
    ||text(previewItems?.[0]) : '';
  const url=preview||text(node.content)||text((node.type==='gen-video'||node.type==='motion-control')?node.videoUrl:node.imageUrl)||text(settings._blobUrl)
    ||text(settings.audioUrl)||text(settings.imageUrl)||text(images?.[Number(settings.selectedImageIndex)||0]?.fullUrl)
    ||text(version?.originalUrl)||text(version?.content);
  const assetId=(preview?text(node._selectedImageAssetId):'')||text(node._contentAssetId)||text(settings._localCacheAssetId)||text(settings._contentAssetId)||text(settings._assetId)||text(node.assetId);
  return {url:url || (assetId?`local-asset://${encodeURIComponent(assetId)}`:''),assetId:assetId||undefined};
}

/** Every visible upstream input must be ready; never silently downgrade an incomplete graph to text-only. */
export function resolveStudioInputs(scene:StudioScene,targetId:string):{
  prompt:string; refs:Array<{nodeId:string;type:'image'|'video'|'audio';url:string;assetId?:string}>; duration?:number; audio?:boolean; soundMode?:string;
} {
  const target=scene.nodes.find(node=>node.id===targetId);
  if(!target)throw new Error('生成节点已不存在');
  const compiler=studioCompilerSource(scene,targetId);
  if(compiler && target.type==='gen-video') {
    const inputs=resolveStudioInputs(scene,compiler.id),s=compilerSettings(compiler);
    if(compiler.isGenerating || !s.beikeCompilerApproved || !studioCompilerKeyMatches(s.beikeCompilerInputKey,compiler,inputs))throw new Error('07提示词尚未确认或上游已修改，请先重新优化并确认');
    const output=text(s.text);
    if(!output || output!==s.beikeCompilerApproved)throw new Error('07确认稿已修改，请重新确认提示词');
    const roles=s.beikeStoryboardSceneSourceId&&inputs.prompt.match(/【素材职责】[\s\S]*?【素材职责结束】/)?.[0];
    return {...inputs,prompt:roles?roles+'\n\n'+stripVideoPromptRoles(output):output};
  }
  const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
  const ids=[...new Set(scene.connections.filter(edge=>edge.to===targetId && (!edge.inputType||edge.inputType==='default'))
    .flatMap(edge=>studioEdgeSources(edge,scene)))];
  const texts:string[]=[],textIds:string[]=[];
  const targetSettings=settingsOf(target);
  const storyboardSceneSource=targetSettings.beikeStoryboardSceneSourceId;
  if(typeof storyboardSceneSource==='string') {
    if(target.id.endsWith('-analysis')||targetSettings.beikeOmniReferenceImage===true)for(const role of ['product','person'])if(!ids.includes(storyboardSceneSource.replace(/-source$/, '-'+role)))throw new Error('请连接02商品图和03目标人物图');
    if(targetSettings.beikeTextResultRequired&&!ids.includes(storyboardSceneSource))throw new Error('请连接01原片视频');
    if(targetSettings.beikeOmniReferenceImage===true&&!ids.includes(storyboardSceneSource.replace(/-source$/, '-analysis')))throw new Error('请连接05分镜分析结果');
    const source=nodes.get(storyboardSceneSource),media=source&&studioNodeMedia(source);
    const key=media?.assetId?`asset:${media.assetId}`:media?.url;
    if(!ids.some(id=>{const node=nodes.get(id);if(!node)return false;const s=settingsOf(node);return s.beikeStoryboardSourceId===storyboardSceneSource&&s.beikeStoryboardFacesMasked===true&&s.beikeStoryboardActive!==false&&(!s.beikeStoryboardSourceKey||s.beikeStoryboardSourceKey===key);}))throw new Error('请等待01原片的遮脸分镜图生成，或从原视频菜单重新抽帧');
  }
  const storyboardVideo=targetSettings.beikeVideoWorkflow==='w3-copy';
  const scriptOnly=targetSettings.beikeScriptOnly===true;
  const storyboardFirstFrame=storyboardVideo && (!targetSettings.beikeVideoMode || targetSettings.beikeVideoMode==='first_frame');
  const refs:Array<{nodeId:string;type:'image'|'video'|'audio';url:string;assetId?:string}>=[];
  for(const id of ids) {
    const source=nodes.get(id);
    if(!source)throw new Error('连线中的上游节点已不存在，请断开或重连');
    const name=studioNodeLabel(source),settings=settingsOf(source);
    if(settings.beikeStoryboardActive===false)continue;
    if(storyboardSceneSource&&settings.beikeStoryboardSourceId&&(settings.beikeStoryboardSourceId!==storyboardSceneSource||settings.beikeStoryboardFacesMasked!==true))continue;
    if(typeof settings.beikeStoryboardSourceKey==='string'){const original=nodes.get(String(settings.beikeStoryboardSourceId)),media=original&&studioNodeMedia(original),key=media?.assetId?`asset:${media.assetId}`:media?.url;if(key!==settings.beikeStoryboardSourceKey)throw new Error('原视频已更换，请等待新分镜图完成后重新分析并确认07');}
    if(source.isGenerating || settings.isGenerating || settings.textNodeIsAnalyzing)throw new Error(`请先完成上游节点：${name}`);
    if(source.errorMsg && !text(source.content))throw new Error(`上游节点生成失败，请先重试或切换已有版本：${name}`);
    const type=studioNodeKind(source);
    if(type==='text') {
      if(Number(settings.beikeSourceVideoChangedAt)>Number(settings._chatCompletedAt||0))throw new Error('原视频已更换，请先重新运行05分析，再生成06并确认07');
      if(Number(settings.beikeStoryboardEditedAt)>Number(settings._chatCompletedAt||0))throw new Error('分镜图已更新，请先重新运行05分析，再生成06并确认07');
      const value=(settings.beikeTextResultRequired ? text(settings.textNodeDisplayText) : '')||text(settings.text)||text(source.content)||(settings.beikeTextResultRequired ? '' : text(source.prompt));
      if(!value && settings.beikeTextResultRequired)throw new Error(`请先运行分镜分析并检查结果：${name}`);
      if(!value)throw new Error(`请先填写上游文字节点：${name}`);
      texts.push(value);textIds.push(id);continue;
    }
    if(targetSettings.beikeReferencePreparationRole==='scene'&&typeof targetSettings.beikeSceneFrameUrl==='string'&&type==='image')continue;
    if(!type)throw new Error(`此参考节点尚未接入生成：${name}`);
    if(type==='video'&&storyboardSceneSource&&targetSettings.beikeTextResultRequired===true&&id!==storyboardSceneSource)
      throw new Error('05逐镜分析只接受01原片，请断开额外的视频参考');
    if(targetSettings.beikePromptCompiler===true&&!scriptOnly&&type!=='image')throw new Error('提示词优化支持文本和图片参考，请断开视频或音频连线');
    if((scriptOnly||storyboardFirstFrame) && type!=='image')throw new Error('分镜复刻生成不接收视频或音频，请断开原片连线，只连接分析分镜和目标参考图');
    const media=studioNodeMedia(source);
    if(!media.url || source.missingMedia)throw new Error(`上游素材未就绪，请生成或替换素材：${name}`);
    if(target.type==='gen-image'&&type!=='image')throw new Error('图片生成只支持图片和文字参考，请断开视频或音频参考');
    refs.push({nodeId:id,type,...media});
  }
  // A locally processed sheet follows its original video's downstream analysis into 07.
  // 08 inherits these exact references through the approved compiler input key.
  if(targetSettings.beikePromptCompiler===true&&!storyboardSceneSource) {
    const ancestors=new Set<string>(),pending=[targetId];
    while(pending.length) {
      const id=pending.pop()!;
      for(const edge of scene.connections.filter(edge=>edge.to===id))for(const sourceId of studioEdgeSources(edge,scene)) {
        if(!ancestors.has(sourceId)){ancestors.add(sourceId);pending.push(sourceId);}
      }
    }
    const pages=scene.nodes.filter(n=>ancestors.has(String(settingsOf(n).beikeStoryboardSourceId)));
    if(pages.length&&!pages.some(n=>settingsOf(n).beikeStoryboardActive!==false))throw new Error('新视频分镜图尚未完成，请等待抽帧完成后重新分析并确认07');
    for(const sheet of scene.nodes) {
      const settings=settingsOf(sheet),sourceId=settings.beikeStoryboardSourceId;
      if(settings.beikeStoryboardActive===false||typeof sourceId!=='string'||!ancestors.has(sourceId)||settings.beikeStoryboardFacesMasked!==true||refs.some(ref=>ref.nodeId===sheet.id))continue;
      const media=studioNodeMedia(sheet);
      if(!media.url||sheet.missingMedia)throw new Error('打码分镜图未就绪，请重新抽帧');
      refs.push({nodeId:sheet.id,type:'image',...media});
    }
  }
  const frame=target.id.endsWith('-analysis')?nodes.get(target.id.replace(/-analysis$/,'-keyframe')):ids.map(id=>nodes.get(id)).find(n=>n?.id.endsWith('-keyframe'));
  const selectedScene=frame&&settingsOf(frame).beikeSceneFrameUrl;
  if(!storyboardSceneSource&&typeof selectedScene==='string')for(const ref of refs)if(ref.nodeId.endsWith('-background'))ref.url=selectedScene;
  sortStudioMediaReferences(refs, targetSettings, ref => ref.url);
  if(targetSettings.beikePromptCompiler===true&&!scriptOnly) {
    const prompt=[...texts,text(targetSettings.textNodeDraftPrompt)||text(target.prompt)].filter(Boolean).join('\n\n');
    if(!prompt)throw new Error('请输入视频提示词，或连接一个文本节点');
    const value=String(targetSettings.duration??'5s').trim();
    const duration=/^\d+(?:s|秒)?$/.test(value)?parseInt(value,10):NaN;
    if(!Number.isSafeInteger(duration)||duration<=0)throw new Error('视频时长必须为正整数秒');
    const audio=typeof targetSettings.beikeVideoAudio==='boolean'?targetSettings.beikeVideoAudio:undefined;
    return {prompt,refs,duration,audio};
  }
  if(scriptOnly) {
    if(!refs.length)throw new Error('全能参考复刻需要连接06参考图与05分镜');
    if(targetSettings.beikePromptCompiler!==true&&refs.length!==1)throw new Error('全能参考复刻只连接一张06参考图与05分镜');
    const extra=targetSettings.beikePromptCompiler===true?text(targetSettings.textNodeDraftPrompt):'';
    const inputs=omniCopyVideoInputs(texts,text(target.prompt),{draft:extra,textNames:textIds.map(id=>studioNodeLabel(nodes.get(id)!)),analysisIndex:textIds.findIndex(id=>id.endsWith('-analysis')&&settingsOf(nodes.get(id)!).beikeTextResultRequired===true)});
    if(targetSettings.beikePromptCompiler===true) {
      const value=String(targetSettings.duration??inputs.duration).trim();
      const duration=/^\d+(?:s|秒)?$/.test(value)?Number(value.replace(/(?:s|秒)$/,'')):NaN;
      if(duration!==inputs.duration)throw new Error(`07时长必须与所选分镜片段一致：05所选片段为${inputs.duration}秒，07填写为${value}。若要生成完整15秒，请重新运行05输出一个15秒片段，再到07确认；仅修改07时长不能延长旧分镜。`);
      const audio=typeof targetSettings.beikeVideoAudio==='boolean'?targetSettings.beikeVideoAudio:inputs.audio;
      if(audio && inputs.soundMode!=='生成声音')throw new Error('05尚未确认生成声音的台词，请先在分镜中确认声音要求');
      if(!audio)inputs.prompt=inputs.prompt.replace(/(?:^|\n)声音[：:][^\n]*/g,'')+'\n声音：全程静音，无台词、音乐、环境声或音效。';
      for(const [label,suffix] of [['人物','person'],['服装','product'],['场景','background']]){
        const index=refs.findIndex(ref=>ref.nodeId.endsWith('-'+suffix));
        inputs.prompt=inputs.prompt.replace(new RegExp(`(目标${label}[：:]\\s*)(?:@?图片|图)\\d+(?:中的|所示)?`,'g'),`$1${index<0?'':`@图片${index+1}中的`}`);
      }
      const roles=studioVideoPromptRoles(scene,refs,storyboardSceneSource);
      if(roles)inputs.prompt+='\n'+roles;

      return {...inputs,audio,soundMode:typeof targetSettings.beikeVideoAudio==='boolean'?(audio?'生成声音':'静音'):inputs.soundMode,prompt:inputs.prompt,refs};
    }
    return {...inputs,refs};
  }
  if(targetSettings.beikeReferencePreparationRole==='scene'&&typeof targetSettings.beikeSceneFrameUrl==='string')return {prompt:text(target.prompt),refs:[{nodeId:target.id,type:'image' as const,url:targetSettings.beikeSceneFrameUrl}]};
  if(typeof targetSettings.beikeReferencePreparationRole==='string')return {...omniCopyPreparationInputs(texts,text(target.prompt),targetSettings.beikeReferencePreparationRole),refs};
  if(targetSettings.beikeOmniReferenceImage===true){
    if(!storyboardSceneSource&&typeof targetSettings.beikeSceneFrameUrl==='string') {
      const ids=targetSettings.beikeReferenceInputIds;
      const sceneId=Array.isArray(ids)?ids[2]:undefined;
      const index=refs.findIndex(ref=>ref.nodeId===sceneId||ref.nodeId.endsWith('-background')||settingsOf(nodes.get(ref.nodeId)!).beikeReferencePreparationRole==='scene');
      if(index<0)throw new Error('请连接场景参考后再使用所选抽帧');
      refs[index]={...refs[index],url:targetSettings.beikeSceneFrameUrl};
    }
    const inputs=omniCopyReferenceInputs(texts,text(target.prompt));
    const roles=studioStoryboardRoleBlock(scene,targetId,refs,textIds);
    return {...inputs,prompt:(roles?roles+'\n':'')+inputs.prompt+(!storyboardSceneSource&&targetSettings.beikeSceneFrameUrl?'\n场景参考来自原片抽帧：只保留空间布局、透视和光影，替换原人物与服装，补全遮挡区域，不复制遮脸块、字幕或水印。':''),refs};
  }
  if(storyboardVideo || targetSettings.beikeStoryboardKeyframe) {
    const names=textIds.map(id=>studioNodeLabel(nodes.get(id)!));
    const selected=storyboardVideo ? selectVideoCopyStoryboard(texts,text(target.prompt),names) : selectVideoCopyKeyframe(texts,text(target.prompt),names);
    if(storyboardFirstFrame && !refs.length)throw new Error('请先生成并连接本片段的目标关键帧');
    return {...selected,refs};
  }
  const labeledTexts=texts.map((value,index)=>`【@文本${index+1}】\n${value}`);
  const draft = target.type === 'text-node' && targetSettings.beikeTextResultRequired === true
    ? text(targetSettings.textNodeDraftPrompt) : '';
  const instruction = draft || text(target.prompt);
  const prompt = targetSettings.beikeTextResultRequired === true && storyboardSceneSource
    ? instruction.replace(new RegExp(PROMPT_MENTION_REGEX.source, 'gi'), token => {
        const mention = parseSubjectMention(token);
        if (!mention) return token;
        const nodeIdentity = mention.id.startsWith('canvas-node:');
        const url = nodeIdentity ? undefined : resolveRefMediaIdentity(mention.id);
        const oldSlot = !nodeIdentity && !url ? /^(图片|视频)(\d+)$/.exec(mention.name) : null;
        const match = nodeIdentity ? refs.find(ref => ref.nodeId === mention.id.slice('canvas-node:'.length))
          : url ? refs.find(ref => ref.url === url)
          : oldSlot ? refs.filter(ref => ref.type === (oldSlot[1] === '视频' ? 'video' : 'image'))[Number(oldSlot[2]) - 1]
          : undefined;
        if (!match) throw new Error(`提示词引用的${mention.name}已失效，请重新选择素材`);
        return `@${match.type === 'video' ? '视频' : '图片'}${refs.indexOf(match) + 1}`;
      })
    : instruction;
  return {prompt:[...labeledTexts,prompt].filter(Boolean).join('\n'),refs};
}

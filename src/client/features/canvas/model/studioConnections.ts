import type { StudioScene } from './types';
import { selectVideoCopyStoryboard, selectVideoCopyKeyframe } from './videoCopyStoryboard';

type Node = StudioScene['nodes'][number];
type Edge = StudioScene['connections'][number];
export type StudioConnectionChange = { kind:'add'|'reconnect'; from:string; to:string; id?:string } | {kind:'remove';id:string};
const settingsOf = (node:Node) => node.settings as Record<string,unknown> || {};
const text = (value:unknown) => typeof value==='string'?value.trim():'';
export const studioNodeLabel = (node:Node) => text(node.nodeName) || node.type || node.id;

/** Native thumbnail blob URLs belong to the old document; rebuild them from the retained media. */
export function restoreStudioReference(node:Node):Node {
  if(node.type!=='input-image')return node;
  const settings={...settingsOf(node)};
  if(!text(settings._canvasDisplayPreviewUrl).startsWith('blob:') && !text(settings._blobUrl).startsWith('blob:'))return node;
  for(const field of ['_canvasDisplayPreviewUrl','_blobUrl','_useCanvasPreviewDisplay','_dropPreviewPending'])delete settings[field];
  return {...node,settings};
}

export function studioNodeKind(node:Node): 'image'|'video'|'audio'|'text'|undefined {
  if (node.type==='text-node' || node.type==='custom-agent') return 'text';
  if (node.type==='gen-image') return 'image';
  if (node.type==='gen-video' || node.type==='video-input') return 'video';
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
  const kind=studioNodeKind(from);
  if (!kind) return undefined;
  if (to.type==='gen-image') return kind==='image'||kind==='text';
  if (to.type==='gen-video' || to.type==='text-node') return true;
  if (to.type==='input-image' || to.type==='gen-3d') return kind==='image';
  if (to.type==='gen-speech') return kind==='text';
  if (to.type==='local-save') return true;
  if (to.type==='preview' || to.type==='save') return kind!=='text';
}

export function changeStudioConnection(scene:StudioScene, change:StudioConnectionChange):StudioScene {
  if(change.kind==='remove') return {...scene,connections:scene.connections.filter(edge=>edge.id!==change.id)};
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
  return {...scene,connections:previous?scene.connections.map(item=>item===previous?edge:item):[...scene.connections,edge]};
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
  return proposed.filter(edge=>ids.has(edge.id));
}

export function studioNodeMedia(node:Node):{url:string;assetId?:string} {
  const settings=settingsOf(node);
  const images=settings.generatedImages as Array<{fullUrl?:string}> | undefined;
  const versions=settings.generationVersions as Array<{content?:string;originalUrl?:string}> | undefined;
  const version=versions?.[Number(settings.activeGenerationVersionIndex)||0];
  const previewItems=(node.previewType==='video'?node.previewMjVideos:node.previewMjImages) as unknown[]|undefined;
  const preview=node.type==='preview' ? text(node.previewType==='video'?node.selectedPreviewVideo:node.selectedPreviewImage)
    ||text(previewItems?.[0]) : '';
  const url=preview||text(node.content)||text(node.type==='gen-video'?node.videoUrl:node.imageUrl)||text(settings._blobUrl)
    ||text(settings.audioUrl)||text(settings.imageUrl)||text(images?.[Number(settings.selectedImageIndex)||0]?.fullUrl)
    ||text(version?.originalUrl)||text(version?.content);
  const assetId=(preview?text(node._selectedImageAssetId):'')||text(node._contentAssetId)||text(settings._localCacheAssetId)||text(settings._contentAssetId)||text(settings._assetId)||text(node.assetId);
  return {url:url || (assetId?`local-asset://${encodeURIComponent(assetId)}`:''),assetId:assetId||undefined};
}

/** Every visible upstream input must be ready; never silently downgrade an incomplete graph to text-only. */
export function resolveStudioInputs(scene:StudioScene,targetId:string):{
  prompt:string; refs:Array<{nodeId:string;type:'image'|'video'|'audio';url:string;assetId?:string}>; duration?:number; audio?:boolean;
} {
  const target=scene.nodes.find(node=>node.id===targetId);
  if(!target)throw new Error('生成节点已不存在');
  const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
  const ids=[...new Set(scene.connections.filter(edge=>edge.to===targetId && (!edge.inputType||edge.inputType==='default'))
    .flatMap(edge=>studioEdgeSources(edge,scene)))];
  const texts:string[]=[];
  const textNames:string[]=[];
  const targetSettings=settingsOf(target);
  const storyboardVideo=targetSettings.beikeVideoWorkflow==='w3-copy';
  const storyboardFirstFrame=storyboardVideo && (!targetSettings.beikeVideoMode || targetSettings.beikeVideoMode==='first_frame');
  const refs:Array<{nodeId:string;type:'image'|'video'|'audio';url:string;assetId?:string}>=[];
  for(const id of ids) {
    const source=nodes.get(id);
    if(!source)throw new Error('连线中的上游节点已不存在，请断开或重连');
    const name=studioNodeLabel(source),settings=settingsOf(source);
    if(source.isGenerating || settings.isGenerating)throw new Error(`请先完成上游节点：${name}`);
    if(source.errorMsg && !text(source.content))throw new Error(`上游节点生成失败，请先重试或切换已有版本：${name}`);
    const type=studioNodeKind(source);
    if(type==='text') {
      const value=(settings.beikeTextResultRequired ? text(settings.textNodeDisplayText) : '')||text(settings.text)||text(source.content)||(settings.beikeTextResultRequired ? '' : text(source.prompt));
      if(!value && settings.beikeTextResultRequired)throw new Error(`请先运行分镜分析并检查结果：${name}`);
      if(!value)throw new Error(`请先填写上游文字节点：${name}`);
      texts.push(value);textNames.push(name);continue;
    }
    if(!type)throw new Error(`此参考节点尚未接入生成：${name}`);
    if(storyboardFirstFrame && type!=='image')throw new Error('分镜复刻生成不接收视频或音频，请断开原片连线，只连接分析分镜和目标关键帧');
    const media=studioNodeMedia(source);
    if(!media.url || source.missingMedia)throw new Error(`上游素材未就绪，请生成或替换素材：${name}`);
    if(target.type==='gen-image'&&type!=='image')throw new Error('图片生成只支持图片和文字参考，请断开视频或音频参考');
    if(target.type==='gen-video'&&type==='audio')throw new Error('此视频生成入口尚不支持音频参考，请断开音频连线');
    refs.push({nodeId:id,type,...media});
  }
  const order=targetSettings.inputItemOrder || targetSettings.inputImageOrder;
  if(Array.isArray(order)) {
    const positions=new Map(order.filter((url):url is string=>typeof url==='string').map((url,index)=>[url,index]));
    refs.sort((a,b)=>(positions.get(a.url)??Infinity)-(positions.get(b.url)??Infinity));
  }
  if(storyboardVideo || targetSettings.beikeStoryboardKeyframe) {
    const selected=storyboardVideo ? selectVideoCopyStoryboard(texts,text(target.prompt),textNames) : selectVideoCopyKeyframe(texts,text(target.prompt),textNames);
    if(storyboardFirstFrame && !refs.length)throw new Error('请先生成并连接本片段的目标关键帧');
    return {...selected,refs};
  }
  const labeledTexts=texts.map((value,index)=>`【@文本${index+1}】\n${value}`);
  return {prompt:[...labeledTexts,text(target.prompt)].filter(Boolean).join('\n'),refs};
}

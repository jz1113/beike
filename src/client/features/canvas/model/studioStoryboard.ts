import { extractVideoFrame } from './canvasVideoFrame';
import { compilerSettings } from './studioCompilerState';
import { studioNodeMedia } from './studioConnections';
import type { CanvasNode, StudioScene } from './types';

export type StoryboardNode = CanvasNode & { shotDuration?: number };

export function isStoryboardShot(node: CanvasNode) {
  return !node.layerHidden && Boolean(node.imageUrl || node.videoUrl);
}

const mediaAddress = /^(?:https?:\/\/|blob:|data:(?:image|video)\/|\/storage\/)/i;

export function studioStoryboardNodes(scene?: StudioScene): StoryboardNode[] {
  return (scene?.nodes ?? []).flatMap(node => {
    if(node.missingMedia)return [];
    const settings = node.settings as Record<string, unknown> | undefined;
    const kind = node.previewType || settings?.mediaType;
    if (kind === 'audio' || settings?.audioUrl || ['text-node', 'gen-speech', 'gen-music'].includes(node.type)) return [];
    const images = settings?.generatedImages ?? node.generatedImages;
    const index = Number(settings?.selectedImageIndex);
    const image = Array.isArray(images) ? images[index] ?? images[0] : undefined;
    const preview=node.type==='preview' ? (kind==='video'?node.selectedPreviewVideo:node.selectedPreviewImage) : undefined;
    const media = [preview,node.videoUrl, image?.fullUrl, image?.url, node.content, node.imageUrl, image?.thumbUrl]
      .find((url): url is string => typeof url === 'string' && mediaAddress.test(url));
    if (!media || /\.(?:mp3|wav|m4a|aac|flac|oga|opus|ogg)(?:[?#]|$)/i.test(media)) return [];
    const video = Boolean(node.videoUrl) || kind === 'video' || node.type.includes('video') ||
      /^(?:data:video\/)|\.(?:mp4|webm|m4v|mov|mkv)(?:[?#]|$)/i.test(media);
    const duration = parseFloat(String(settings?.duration ?? settings?.videoDuration));
    return [{
      id: node.id, title: String(node.nodeName || (video ? '视频' : '图片')), type: video ? 'video' : 'image',
      x: Number(node.x) || 0, y: Number(node.y) || 0, width: Number(node.width) || 250,
      height: Number(node.height) || 250, createdAt: 0, layerHidden: node.layerHidden === true,
      textPrompt: typeof node.prompt === 'string' ? node.prompt : undefined,
      ...(video && Number.isFinite(duration) && duration > 0 ? {shotDuration: duration} : {}),
      ...(video ? {videoUrl: media} : {imageUrl: media}),
    }];
  });
}

/** More detail for short fast-cut clips, bounded to 60 frames for local extraction. */
export function storyboardSampleTimes(duration:number):number[] {
 if(!Number.isFinite(duration)||duration<=0||duration>60)throw new Error('免费分镜图支持60秒以内视频，请先选取片段');
 const interval=duration<=30?.5:1;
 return Array.from({length:Math.ceil(duration/interval)},(_,index)=>index*interval);
}

export function storyboardTimecode(time:number):string {
 const milliseconds=Math.round(time*1000);
 return `00:${String(Math.floor(milliseconds/60000)).padStart(2,'0')}:${String(Math.floor(milliseconds/1000)%60).padStart(2,'0')}.${String(milliseconds%1000).padStart(3,'0')}`;
}

export interface StudioStoryboardFrame {time:number;dataUrl:string}

export async function extractStudioStoryboard(url:string,onProgress:(current:number,total:number)=>void,signal:AbortSignal) {
 signal.throwIfAborted();
 const first=await extractVideoFrame(url,0);
 const times=storyboardSampleTimes(first.duration),total=times.length,frames:StudioStoryboardFrame[]=[];
 for(let index=0;index<total;index++) {
  signal.throwIfAborted();
  const second=times[index],frame=index===0?first:await extractVideoFrame(url,second);
  frames.push({time:second,dataUrl:await maskStoryboardFaces(frame.dataUrl,signal)});onProgress(index+1,total);
 }
 return frames;
}

export async function studioStoryboardSheet(frames:StudioStoryboardFrame[]) {
 if(!frames.length)throw new Error('没有可用分镜帧');
 const images=await Promise.all(frames.map(frame=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('分镜帧读取失败'));image.src=frame.dataUrl;})));
 const width=240,height=320,columns=4,gap=5;
 const canvas=document.createElement('canvas');canvas.width=columns*(width+gap)+gap;canvas.height=Math.ceil(frames.length/columns)*(height+gap)+gap;
 const context=canvas.getContext('2d');if(!context)throw new Error('无法绘制分镜图');
 context.fillStyle='#171719';context.fillRect(0,0,canvas.width,canvas.height);
 images.forEach((image,index)=>{
  const x=gap+index%columns*(width+gap),y=gap+Math.floor(index/columns)*(height+gap),scale=Math.min(width/image.width,height/image.height);
  const w=image.width*scale,h=image.height*scale;
  context.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);
  context.fillStyle='#0009';context.fillRect(x,y,128,23);context.fillStyle='white';context.font='15px monospace';
  context.fillText(storyboardTimecode(frames[index].time),x+3,y+17);
 });
 return canvas.toDataURL('image/jpeg',0.9);
}

/** Only a processed copy leaves the extractor; detector errors abort instead of sending the original. */
async function maskStoryboardFaces(dataUrl:string,signal:AbortSignal) {
 const image=new Image();image.src=dataUrl;await image.decode();signal.throwIfAborted();
 const {detectImageFaces}=await import('@client/shared/media/faceDetector');
 const regions=await detectImageFaces(image);signal.throwIfAborted();
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const context=canvas.getContext('2d');if(!context)throw new Error('无法生成人脸打码副本');
 context.drawImage(image,0,0);context.fillStyle='#252525';
 for(const face of regions) {
  context.beginPath();
  context.ellipse((face.x+face.width/2)*canvas.width,(face.y+face.height/2)*canvas.height,face.width*canvas.width/2,face.height*canvas.height/2,0,0,Math.PI*2);
  context.fill();
 }
 return canvas.toDataURL('image/jpeg',.92);
}

/** A normal image node keeps full sheet resolution while occupying a small canvas card. */
export function studioStoryboardNode(source:StudioScene['nodes'][number],url:string,count:number,id:string,page=0,interval=.5):StudioScene['nodes'][number] {
 return {id,type:'input-image',nodeName:`${source.nodeName||'视频'} · 分镜图${page+1}（人脸已处理）`,content:url,x:Number(source.x||0)+Number(source.width||340)+64,y:Number(source.y||0)+page*400,width:300,height:360,
 settings:{mediaType:'image',beikeStoryboardSourceId:source.id,beikeStoryboardFrameCount:count,beikeStoryboardPageIndex:page,beikeStoryboardActive:true,beikeStoryboardInterval:interval,beikeStoryboardFacesMasked:true}};
}

export function storyboardSourceKey(node:StudioScene['nodes'][number]):string {
 const media=studioNodeMedia(node);
 return media.url?(media.assetId?`asset:${media.assetId}`:media.url):'';
}

/** An absent legacy key or a retired sheet is not evidence of a replaced video. */
export function storyboardSourceChanged(pages:StudioScene['nodes'],current:string,previous?:string):boolean {
 if(!current)return false;
 if(previous)return previous!==current;
 const keys=pages.map(compilerSettings).filter(s=>s.beikeStoryboardActive!==false)
  .map(s=>s.beikeStoryboardSourceKey).filter(key=>typeof key==='string'&&key.length>0);
 return keys.length>0&&!keys.includes(current);
}

/** Only custom recreation source nodes auto-extract; other videos retain their manual tool. */
export function pendingStudioStoryboards(scene:StudioScene,seen:Map<string,string>) {
 const result:string[]=[];
 for(const video of scene.nodes.filter(n=>compilerSettings(n).beikeVideoWorkflow==='depth-copy'&&n.id.endsWith('-video'))) {
  const source=scene.nodes.find(n=>n.id===video.id.slice(0,-6)+'-source');
  if(!source)continue;
  const key=storyboardSourceKey(source),previous=seen.get(source.id);
  if(!key||source.missingMedia||source.isGenerating)continue;
  const pages=scene.nodes.filter(n=>compilerSettings(n).beikeStoryboardSourceId===source.id&&compilerSettings(n).beikeStoryboardActive!==false);
  const matches=pages.length&&pages.every(n=>{const value=compilerSettings(n).beikeStoryboardSourceKey;return value===key||!value&&previous===undefined;});
  if(previous!==key&&!matches)result.push(source.id);
  seen.set(source.id,key);
 }
 return result;
}

/** Repair visible wiring only inside the source video's custom recreation workflow. */
export function wireStudioStoryboards(scene:StudioScene):StudioScene {
 const byId=new Map(scene.nodes.map(node=>[node.id,node]));
 const connections=scene.connections.filter(edge=>{
  const from=byId.get(edge.from),target=byId.get(edge.to);
  if(!from||!target)return true;
  const sheet=compilerSettings(from),owner=compilerSettings(target);
  const compiler=byId.get(String(owner.beikeCompilerSource||''));
  const source=owner.beikeStoryboardSceneSourceId||(compiler&&compilerSettings(compiler).beikeStoryboardSceneSourceId);
  return !source||!sheet.beikeStoryboardSourceId||sheet.beikeStoryboardSourceId===source&&sheet.beikeStoryboardActive!==false&&sheet.beikeStoryboardFacesMasked===true;
 });
 const before=connections.length;
 for(const sheet of scene.nodes) {
  const s=compilerSettings(sheet),source=s.beikeStoryboardSourceId;
  if(typeof source!=='string'||s.beikeStoryboardFacesMasked!==true||s.beikeStoryboardActive===false)continue;
  const reachable=new Set([source]),pending=[source];
  while(pending.length){const id=pending.shift()!;for(const edge of scene.connections.filter(e=>e.from===id)) {
   if(!reachable.has(edge.to)){reachable.add(edge.to);pending.push(edge.to);}
  }}
  const targets=scene.nodes.filter(n=>reachable.has(n.id)&&compilerSettings(n).beikePromptCompiler===true);
  if(!targets.length)continue;
  const compilerIds=new Set(targets.map(n=>n.id));
  const ids=[...targets.map(n=>n.id),...scene.nodes.filter(n=>reachable.has(n.id)&&(compilerSettings(n).beikeStoryboardSceneSourceId===source||n.id.endsWith('-analysis')||compilerSettings(n).beikeTextResultRequired===true)||compilerIds.has(String(compilerSettings(n).beikeCompilerSource))).map(n=>n.id)];
  for(const [from,to] of [[source,sheet.id],...ids.map(id=>[sheet.id,id])])if(from!==to&&!connections.some(e=>e.from===from&&e.to===to))connections.push({id:`${from}-storyboard-${to}`,from,to});
 }
 return connections.length===before&&before===scene.connections.length?scene:{...scene,connections};
}

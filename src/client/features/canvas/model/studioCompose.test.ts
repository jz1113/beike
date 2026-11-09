import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {composeStudioVideo} from './studioCompose';
import {
  connectedStudioPreview,
  normalizeStudioPreview,
  recordStudioResultVersion,
  studioMediaKind,
  studioOriginalVideo,
  syncStudioPreviews,
} from './studioPreview';
import type {StudioScene} from './types';

const mocks=vi.hoisted(()=>({fetch:vi.fn(),upload:vi.fn(),decode:vi.fn(),audioStarts:vi.fn()}));
vi.mock('@client/shared/media/downloadMedia',()=>({fetchMediaBlob:mocks.fetch}));
vi.mock('@client/shared/api/uploadStudioFile',()=>({uploadStudioFile:mocks.upload}));

class Video {
  private address=''; duration=1; videoWidth=640; videoHeight=360; muted=false; ended=false;
  get src(){return this.address;}
  set src(value:string){this.address=value;if(value)queueMicrotask(()=>this.onloadedmetadata?.());}
  onloadedmetadata?:()=>void; onerror?:()=>void; onended?:()=>void;
  play=vi.fn(async()=>{if(this.muted)setTimeout(()=>this.onended?.(),0);});
  pause=vi.fn();
  load(){if(this.src)queueMicrotask(()=>this.onloadedmetadata?.());}
  removeAttribute(){this.src='';}
}
class Recorder {
  static isTypeSupported=()=>true;
  static current:Recorder;
  constructor(){Recorder.current=this;}
  state='inactive';ondataavailable?:(event:{data:Blob})=>void;onstop?:()=>void;onerror?:()=>void;
  start(){this.state='recording';}
  pause(){this.state='paused';}
  resume(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['recording'])});this.onstop?.();}
}
const videos:Video[]=[];
beforeEach(()=>{
  vi.clearAllMocks();videos.length=0;
  const stream={addTrack:vi.fn(),getTracks:()=>[{stop:vi.fn()}],getAudioTracks:()=>[]};
  vi.stubGlobal('MediaRecorder',Recorder);
  vi.stubGlobal('AudioContext',class {
    resume=vi.fn();close=vi.fn();sampleRate=48_000;decodeAudioData=mocks.decode;
    createMediaStreamDestination=()=>({stream});createBuffer=()=>({duration:0.1});
    createBufferSource=()=>{
      const source={buffer:undefined,onended:undefined as (()=>void)|undefined,connect:vi.fn(),disconnect:vi.fn(),stop:vi.fn(),
        start:(...args:number[])=>{mocks.audioStarts(...args);queueMicrotask(()=>source.onended?.());}};
      return source;
    };
  });
  vi.stubGlobal('document',{createElement:(tag:string)=>{
    if(tag==='video'){const video=new Video();videos.push(video);return video;}
    return {width:0,height:0,captureStream:()=>stream,getContext:()=>({fillRect:vi.fn(),drawImage:vi.fn()})};
  }});
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:${videos.length}`);
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  mocks.fetch.mockResolvedValue(new Blob(['video'],{type:'video/mp4'}));
  mocks.upload.mockResolvedValue('/storage/composed.webm');
  mocks.decode.mockResolvedValue({duration:3});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('releases the current clip before fetching the next, pausing the recorder during loading',async()=>{
  let activeAtNextFetch=0;
  mocks.fetch.mockImplementation(async(url:string)=>{
    if(url==='clip-2'){
      activeAtNextFetch=videos.filter(video=>video.src).length;
      expect(Recorder.current.state).toBe('paused');
      expect(videos[0].pause).toHaveBeenCalled();
    }
    return new Blob(['video'],{type:'video/mp4'});
  });
  expect(await composeStudioVideo(['original','clip-1','clip-2'])).toBe('/storage/composed.webm');
  expect(activeAtNextFetch).toBe(0);
  expect(videos.every(video=>!video.src)).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  expect(mocks.upload).toHaveBeenCalledWith(expect.any(File),'videos');
});

it('releases already-loaded media when a later clip fails, without uploading a partial result',async()=>{
  mocks.fetch.mockImplementation(async(url:string)=>{
    if(url==='clip-2')throw new Error('clip unavailable');
    return new Blob(['video'],{type:'video/mp4'});
  });
  await expect(composeStudioVideo(['original','clip-1','clip-2'])).rejects.toThrow('clip unavailable');
  expect(videos.every(video=>!video.src)).toBe(true);
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('does not restart an original soundtrack that already ended before the next clip',async()=>{
  mocks.decode.mockResolvedValue({duration:0.5});
  await composeStudioVideo(['original','clip-1','clip-2']);
  expect(mocks.audioStarts.mock.calls).toEqual([[],[0,0,0.5]]);
});

it('schedules successive audio slices at accumulated clip offsets, independent of loading time',async()=>{
  await composeStudioVideo(['original','clip-1','clip-2']);
  expect(mocks.audioStarts.mock.calls).toEqual([[],[0,0,1],[0,1,1]]);
});

it('explains an undecodable or missing original soundtrack without uploading a silent replacement',async()=>{
  mocks.decode.mockRejectedValue(new Error('no audio'));
  await expect(composeStudioVideo(['original','clip-1'])).rejects.toThrow('参考视频音轨无法解码');
  expect(mocks.upload).not.toHaveBeenCalled();
});

const scene:StudioScene={nodes:[{id:'video',type:'input-image',content:'blob:original-video',settings:{mediaType:'video'},nodeName:'原片'},
  {id:'photo',type:'input-image',content:'blob:photo',settings:{mediaType:'image'}},
  {id:'generated',type:'gen-video',content:'blob:new-version'}],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:.37}};

it('hydrates an empty connected composition preview and follows later results without replacing a manual selection',()=>{
  const value={...scene,nodes:[...scene.nodes,{id:'preview',type:'preview'}],connections:[{id:'e',from:'generated',to:'preview'}]};
  const updated=syncStudioPreviews(value);
  expect(connectedStudioPreview(value,'preview')).toEqual({url:'blob:new-version',type:'video'});
  expect(updated.nodes.at(-1)).toMatchObject({content:'blob:new-version',selectedPreviewVideo:'blob:new-version',previewType:'video'});
  expect(syncStudioPreviews(updated)).toBe(updated);
  const next={...updated,nodes:updated.nodes.map(node=>node.id==='generated'?{...node,content:'blob:next'}:node)};
  expect(syncStudioPreviews(next).nodes.at(-1)?.content).toBe('blob:next');
  const manual={...value,nodes:[...scene.nodes,{id:'preview',type:'preview',content:'blob:selected'}]};
  expect(syncStudioPreviews(manual)).toBe(manual);
});

it('opens the original video when the small display shell supplies an image or poster payload',()=>{
  for(const id of ['video','video_lightbox'])expect(normalizeStudioPreview(scene,{id,type:'image',url:'blob:poster'}))
    .toMatchObject({id,type:'video',url:'blob:original-video',originalUrl:'blob:original-video',title:'原片'});
});

it('does not replace ordinary images, unrelated previews or a selected historical generated version',()=>{
  for(const id of ['photo','unrelated','generated']){
    const item={id,type:'image',url:'blob:selected'};expect(normalizeStudioPreview(scene,item)).toBe(item);
  }
  expect(normalizeStudioPreview(scene,null)).toBeNull();
});

it('keeps cached audio input identity and metadata when normalizing its preview',()=>{
  const value={...scene,nodes:[{id:'audio',type:'input-image',content:'blob:audio',settings:{mediaType:'audio',_localCacheAssetId:'audio-file'}}]};
  expect(normalizeStudioPreview(value,{id:'audio',type:'image',url:'blob:display',prompt:'原文'}))
    .toMatchObject({type:'audio',url:'blob:audio',_assetId:'audio-file',prompt:'原文'});
});

it('keeps imported video and audio typed when hydration replaces data with extensionless blob URLs',()=>{
  expect(studioMediaKind({id:'v',type:'input-image',settings:{mediaType:'video'}},'blob:http://localhost/123')).toBe('video');
  expect(studioMediaKind({id:'a',type:'input-image',settings:{mediaType:'audio'}},'blob:http://localhost/456','image')).toBe('audio');
  expect(studioMediaKind({id:'v',type:'gen-video'},'/storage/opaque-result')).toBe('video');
  expect(studioMediaKind({id:'v',type:'preview',previewType:'video'},'local-asset://preview')).toBe('video');
});

it('uses the actual image poster type while keeping opaque media metadata and typed external items',()=>{
  const video={id:'v',type:'input-image',settings:{mediaType:'video'}};
  expect(studioMediaKind(video,'data:image/png;base64,poster')).toBe('image');
  expect(studioMediaKind(video,'/storage/preview.jpg')).toBe('image');
  expect(studioMediaKind(undefined,'blob:123','video')).toBe('video');
  expect(studioMediaKind(undefined,'unknown')).toBeUndefined();
});

const rawVideoScene=():StudioScene=>({nodes:[{id:'compose',type:'gen-video',settings:{beikeOriginalNodeId:'old'}},{id:'old',type:'input-image',content:'/storage/original.mp4',settings:{mediaType:'video'}},{id:'clip',type:'gen-video',content:'/storage/clip.mp4'}],connections:[{id:'e',from:'clip',to:'compose'}],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}});

it('reads the configured original and never mistakes a generated clip for the original',()=>{
  const value=rawVideoScene();expect(studioOriginalVideo(value,'compose').url).toBe('/storage/original.mp4');
  value.nodes=value.nodes.filter(node=>node.id!=='old');expect(()=>studioOriginalVideo(value,'compose')).toThrow('原始参考视频');
});

it('allows an explicitly connected replacement raw video after the template source was removed',()=>{
  const value=rawVideoScene();value.nodes=value.nodes.filter(node=>node.id!=='old');
  value.nodes.push({id:'replacement',type:'input-image',content:'blob:current',settings:{mediaType:'video',_localCacheAssetId:'file'}});
  value.connections.push({id:'source',from:'replacement',to:'compose'});
  expect(studioOriginalVideo(value,'compose')).toEqual({nodeId:'replacement',type:'video',url:'blob:current',assetId:'file'});
  value.nodes.push({id:'other',type:'video-input',content:'/storage/other.mp4'});value.connections.push({id:'ambiguous',from:'other',to:'compose'});
  expect(()=>studioOriginalVideo(value,'compose')).toThrow('原始参考视频');
});

it('adds video results independently from the old cached asset and keeps prior versions intact', () => {
  const previous={id:'result',type:'gen-video',beikeTaskId:'new-task'};
  const old=[{id:'old-version',assetId:'old-file',content:'/storage/old.mp4'}];
  const next={id:'result',type:'gen-video',content:'/storage/new.mp4',videoUrl:'/storage/new.mp4',assetId:'old-file',
    settings:{model:'chosen-route',_contentAssetId:'old-file',_ossRemoteUrl:'/storage/old.mp4',_preGenerateSnapshot:true,generationVersions:old}};
  const result=recordStudioResultVersion(previous,next,old);
  const settings=result.settings as Record<string,unknown>;
  expect(settings.generationVersions).toEqual([old[0],expect.objectContaining({id:'new-task',originalUrl:'/storage/new.mp4',mediaType:'video'})]);
  expect(settings.activeGenerationVersionIndex).toBe(1);
  expect(settings._contentAssetId).toBeUndefined();
  expect(settings._ossRemoteUrl).toBeUndefined();
  expect(result.assetId).toBeUndefined();
  expect(old).toEqual([{id:'old-version',assetId:'old-file',content:'/storage/old.mp4'}]);
});

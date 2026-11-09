import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildCanvasArchive, completeCanvasArchive, readCanvasArchive } from './canvasArchive';
import type { CanvasProject } from './types';

const project = (): CanvasProject => ({id:'source',title:'带素材的画布',nodes:[],createdAt:1,updatedAt:2,
  studioScene:{nodes:[{id:'input',type:'input-image',content:'local-asset://photo',assetId:'photo'},
    {id:'result',type:'gen-video',content:'/storage/current.mp4',videoUrl:'/storage/current.mp4',beikeTaskId:'active-task',isGenerating:true,
      settings:{activeGenerationVersionIndex:1,generationVersions:[
        {id:'old',content:'/storage/old.mp4',mediaType:'video'},
        {id:'new',content:'/storage/current.mp4',mediaType:'video',recipe:{prompt:'move',settings:{referenceImageUrl:'local-asset://photo'}}},
      ]}}],connections:[{id:'edge',from:'input',to:'result'}],groups:[],textBoxes:[{id:'note',text:'批注'}],strokes:[],view:{x:10,y:20,zoom:0.5}}});
const image = new Blob(['image bytes'],{type:'image/png'});
const video = (url:string) => new Blob([url],{type:'video/mp4'});

it('round-trips files and every generated version with independent archive entries and stable graph IDs', async () => {
  const original = project();
  const calls:string[]=[];
  const blob = await buildCanvasArchive(original,async id=>id==='photo'?image:undefined,async url=>{calls.push(url);return video(url);});
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  expect(new Set(Object.values(manifest.assets).map(item=>(item as {fileName:string}).fileName)).size).toBe(3);
  expect(calls.sort()).toEqual(['/storage/current.mp4','/storage/old.mp4']);
  const restored = await readCanvasArchive(blob);
  expect(restored.project.id).not.toBe('source');
  expect(restored.project.title).toBe(original.title);
  expect(restored.project.studioScene?.connections).toEqual(original.studioScene?.connections);
  expect(restored.project.studioScene?.view).toEqual(original.studioScene?.view);
  const node = restored.project.studioScene!.nodes[1];
  expect(node.isGenerating).toBe(false);
  expect(node.beikeTaskId).toBeUndefined();
  const settings = node.settings as {generationVersions:unknown[];activeGenerationVersionIndex:number};
  expect(settings.generationVersions).toHaveLength(2);
  expect(settings.activeGenerationVersionIndex).toBe(1);
  expect((await Promise.all(restored.assets.map(asset=>asset.blob.text()))).sort()).toEqual(['image bytes','/storage/current.mp4','/storage/old.mp4'].sort());
  expect(original.studioScene!.nodes[1].content).toBe('/storage/current.mp4');
});

it('fails export when a version cannot be fetched instead of producing a partial successful backup', async () => {
  await expect(buildCanvasArchive(project(),async()=>image,async url=>{if(url.includes('old'))throw new Error('视频下载失败');return video(url);})).rejects.toThrow('视频下载失败');
  await expect(buildCanvasArchive(project(),async()=>undefined,async url=>video(url))).rejects.toThrow('找不到');
});

it('rejects incomplete assets and dangling connections before a restored project can be published', async () => {
  const blob = await buildCanvasArchive(project(),async()=>image,async url=>video(url));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  zip.remove('assets/0.bin');
  await expect(readCanvasArchive(await zip.generateAsync({type:'blob'}))).rejects.toThrow('素材缺失');
  const invalid=project(); invalid.studioScene!.connections[0].to='missing';
  await expect(readCanvasArchive(new Blob([JSON.stringify(invalid)]))).rejects.toThrow('不存在的节点');
});

it('supports an existing native workflow JSON and refuses temporary blob URLs that cannot survive refresh', async () => {
  const native={projectName:'旧工作流',nodes:[{id:'a',type:'text-node',content:'提示词'}],connections:[],groups:[],canvasTextBoxes:[],canvasDoodleStrokes:[]};
  expect((await readCanvasArchive(new Blob([JSON.stringify(native)]))).project.title).toBe('旧工作流');
  native.nodes[0].type='input-image';native.nodes[0].content='blob:expired';
  await expect(readCanvasArchive(new Blob([JSON.stringify(native)]))).rejects.toThrow('临时素材');
});

it('keeps URL text in prompt nodes and does not fetch it as media', async () => {
  const source=project();source.studioScene!.nodes.push({id:'url-text',type:'text-node',content:'https://example.test/product'});
  const calls:string[]=[];
  const blob=await buildCanvasArchive(source,async()=>image,async url=>{calls.push(url);return video(url);});
  expect(calls).not.toContain('https://example.test/product');
  expect((await readCanvasArchive(blob)).project.studioScene!.nodes.find(node=>node.id==='url-text')?.content).toBe('https://example.test/product');
});

it('materializes external media in older JSON before recovery succeeds, without changing a failed input', async () => {
  const original={project:project(),assets:[{id:'photo',blob:image}]};
  await expect(completeCanvasArchive(original,async()=>{throw new Error('远端不可读');})).rejects.toThrow('远端不可读');
  expect(original.project.studioScene!.nodes[1].content).toBe('/storage/current.mp4');
  const completed=await completeCanvasArchive(original,async url=>video(url));
  expect(completed.assets).toHaveLength(3);
  expect(completed.project.studioScene!.nodes[1].content).toMatch(/^local-asset:\/\//);
});

it('restores native ZIP cache-only content as durable references before the first render', async()=>{
  const zip=new JSZip();
  zip.file('project.json',JSON.stringify({projectName:'旧 ZIP',nodes:[{id:'photo',type:'input-image',content:'',settings:{_assetId:'file'}}],connections:[]}));
  zip.file('manifest.json',JSON.stringify({assets:{file:{fileName:'images/photo.png',mimeType:'image/png',size:image.size}}}));
  zip.file('images/photo.png',await image.arrayBuffer());
  const restored=await readCanvasArchive(await zip.generateAsync({type:'blob'}));
  expect(restored.project.studioScene!.nodes[0].content).toBe('local-asset://file');
  expect(restored.assets[0].blob.size).toBe(image.size);
});

const nativeProject = (): CanvasProject => ({id:'native',title:'旧画布',createdAt:1,updatedAt:2,
  viewport:{x:-123,y:456,zoom:1.4},nodes:[
    {id:'input',type:'image',imageUrl:'/storage/photo.png',x:1,y:2,width:300,height:200,createdAt:1,layerLocked:true,groupId:'group-a'},
    {id:'result',type:'drawing',generationKind:'video',videoUrl:'/storage/current.mp4',audioUrl:'/storage/sound.wav',x:400,y:2,width:300,height:200,createdAt:1,
      taskId:'old-task',status:'generating',referenceNodeIds:['input'],drawing:{model:'model',quality:'high',aspect:'3:4',count:1,references:['/storage/reference.png']},
      runs:[{id:'old',videoUrl:'/storage/old.mp4',status:'success',createdAt:1}],activeRunIndex:0},
    {id:'note',type:'note',content:'https://example.test/a-text-only-link',x:1,y:400,width:300,height:100,createdAt:1},
  ],edges:[{id:'edge',sourceNodeId:'input',targetNodeId:'result'}]});
const nativeMedia = async (url:string) => url.endsWith('.png')?image:url.endsWith('.wav')?new Blob(['sound'],{type:'audio/wav'}):video(url);

it('round-trips a complete native canvas including viewport, references, audio and every saved run', async()=>{
  const source=nativeProject(),original=structuredClone(source),calls:string[]=[];
  const blob=await buildCanvasArchive(source,async()=>undefined,async url=>{calls.push(url);return nativeMedia(url);});
  expect(calls.sort()).toEqual(['/storage/photo.png','/storage/current.mp4','/storage/sound.wav','/storage/reference.png','/storage/old.mp4'].sort());
  const restored=await readCanvasArchive(blob);
  expect(restored.project.studioScene).toBeUndefined();
  expect(restored.project.id).not.toBe(source.id);
  expect(restored.project.viewport).toEqual(source.viewport);
  expect(restored.project.edges).toEqual(source.edges);
  expect(restored.project.nodes[0]).toMatchObject({groupId:'group-a',layerLocked:true});
  expect(restored.project.nodes[1]).toMatchObject({referenceNodeIds:['input'],drawing:{model:'model',quality:'high'},activeRunIndex:0,status:'success'});
  expect(restored.project.nodes[1].taskId).toBeUndefined();
  expect(restored.assets).toHaveLength(5);
  expect(source).toEqual(original);
});

it('materializes native archive media as durable inline URLs usable by the native editor after refresh', async()=>{
  const packed=await readCanvasArchive(await buildCanvasArchive(nativeProject(),async()=>undefined,nativeMedia));
  const completed=await completeCanvasArchive(packed,async()=>{throw new Error('ZIP must be self-contained');});
  expect(completed.project.nodes[0].imageUrl).toMatch(/^data:image\/png;base64,/);
  expect(completed.project.nodes[1].videoUrl).toMatch(/^data:video\/mp4;base64,/);
  expect(completed.project.nodes[1].audioUrl).toMatch(/^data:audio\/wav;base64,/);
  expect(completed.project.nodes[1].drawing?.references[0]).toMatch(/^data:image\//);
  expect(completed.project.nodes[1].runs?.[0].videoUrl).toMatch(/^data:video\//);
  expect(completed.project.nodes[2].content).toBe(nativeProject().nodes[2].content);
  expect(completed.assets).toEqual([]);
});

it('accepts native JSON without a historical viewport and rejects broken native graph/geometry before publication', async()=>{
  const source=nativeProject();delete source.viewport;
  expect((await readCanvasArchive(new Blob([JSON.stringify(source)]))).project.viewport).toBeUndefined();
  const invalid=nativeProject();invalid.edges![0].targetNodeId='missing';
  await expect(readCanvasArchive(new Blob([JSON.stringify(invalid)]))).rejects.toThrow('不存在的节点');
  const bad=nativeProject();bad.nodes[0].width=-1;
  await expect(readCanvasArchive(new Blob([JSON.stringify(bad)]))).rejects.toThrow('节点');
});

it('refuses a native backup when only a drawing reference or historical result is unavailable', async()=>{
  for(const missing of ['/storage/reference.png','/storage/old.mp4']){
    await expect(buildCanvasArchive(nativeProject(),async()=>undefined,async url=>{
      if(url===missing)throw new Error('素材缺失');return nativeMedia(url);
    })).rejects.toThrow('素材缺失');
  }
});


it('keeps empty native archives in the native editor with a default viewport', async()=>{
  const source=nativeProject();source.nodes=[];source.edges=[];delete source.viewport;
  const restored=await readCanvasArchive(new Blob([JSON.stringify(source)]));
  expect(restored.project.studioScene).toBeUndefined();
  expect(restored.project.viewport).toEqual({x:0,y:0,zoom:1});
});

it('rejects native ZIPs with missing media and invalid references without mutating their source', async()=>{
  const source=nativeProject(),original=structuredClone(source);
  const zip=await JSZip.loadAsync(await (await buildCanvasArchive(source,async()=>undefined,nativeMedia)).arrayBuffer());
  zip.remove('assets/0.bin');
  await expect(readCanvasArchive(await zip.generateAsync({type:'blob'}))).rejects.toThrow('素材缺失');
  const duplicate=nativeProject();duplicate.nodes[1].id=duplicate.nodes[0].id;
  await expect(readCanvasArchive(new Blob([JSON.stringify(duplicate)]))).rejects.toThrow('重复');
  const dangling=nativeProject();dangling.nodes[1].referenceNodeIds=['missing'];
  await expect(readCanvasArchive(new Blob([JSON.stringify(dangling)]))).rejects.toThrow('不存在的节点');
  expect(source).toEqual(original);
});

it('encodes native media across base64 chunk boundaries without losing any bytes', async()=>{
  const bytes=Uint8Array.from({length:70001},(_,index)=>index%256);
  const source=nativeProject();source.nodes=[source.nodes[0]];source.edges=[];
  const packed=await readCanvasArchive(await buildCanvasArchive(source,async()=>undefined,async()=>new Blob([bytes],{type:'image/png'})));
  const complete=await completeCanvasArchive(packed,async()=>{throw new Error('unexpected download');});
  const response=await fetch(complete.project.nodes[0].imageUrl!);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});

it('preserves archived business scenes when restoring native commerce projects',async()=>{
 const original=project();
 original.nativeCommerce={kind:'poster',version:1,legacyScene:{nodes:[{id:'legacy-note',type:'text-node',content:'保留旧稿'}],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}}};
 const archive=await buildCanvasArchive(original,async()=>image,async url=>video(url));
 const restored=await readCanvasArchive(archive);
 expect(restored.project.nativeCommerce?.legacyScene?.nodes[0].content).toBe('保留旧稿');
});

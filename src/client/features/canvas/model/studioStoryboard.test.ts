import { expect, it } from 'vitest';
import { compilerSettings, studioCompilerKey } from './studioCompilerState';
import { resolveStudioInputs } from './studioConnections';
import {
  pendingStudioStoryboards,
  storyboardSampleTimes,
  storyboardSourceChanged,
  storyboardTimecode,
  studioStoryboardNode,
  studioStoryboardNodes,
  wireStudioStoryboards,
} from './studioStoryboard';
import type { StudioScene } from './types';
import { createVideoWorkflowProject, upgradeVideoWorkflowProject } from './videoWorkflowProjects';

it('识别导入的音视频和当前选中的出图，保留镜头描述与时长', () => {
  const scene: StudioScene = {connections: [], groups: [], strokes: [], textBoxes: [], view: {x: 0, y: 0, zoom: 1}, nodes: [
    {id:'voice', type:'input-image', previewType:'audio', content:'/storage/speech'},
    {id:'audio', type:'preview', content:'/storage/sound.mp3'},
    {id:'clip', type:'preview', previewType:'video', content:'/storage/clip', prompt:'向右摇镜', settings:{duration:'8s'}},
    {id:'photo', type:'gen-image', settings:{selectedImageIndex:1,generatedImages:[{fullUrl:'/storage/old.png'},{fullUrl:'/storage/new.png'}]}},
  ]};
  expect(studioStoryboardNodes(scene)).toMatchObject([
    {id:'clip', type:'video', videoUrl:'/storage/clip', textPrompt:'向右摇镜', shotDuration:8},
    {id:'photo', type:'image', imageUrl:'/storage/new.png'},
  ]);
});

it('uses the preview selection instead of stale content and skips unavailable media',()=>{
  const scene:StudioScene={connections:[],groups:[],strokes:[],textBoxes:[],view:{x:0,y:0,zoom:1},nodes:[
    {id:'video',type:'preview',previewType:'video',content:'/storage/old.mp4',selectedPreviewVideo:'/storage/selected.mp4'},
    {id:'image',type:'preview',content:'/storage/old.png',selectedPreviewImage:'/storage/selected.png'},
    {id:'missing',type:'input-image',content:'/storage/missing.mp4',missingMedia:true},
  ]};
  expect(studioStoryboardNodes(scene)).toMatchObject([
    {id:'video',type:'video',videoUrl:'/storage/selected.mp4'},
    {id:'image',type:'image',imageUrl:'/storage/selected.png'},
  ]);
});

it('covers short clips every half second without seeking past the end',()=>{
 expect(storyboardSampleTimes(15)).toHaveLength(30);
 const times=storyboardSampleTimes(15.732);
 expect(times).toHaveLength(32);expect(times.slice(-2)).toEqual([15,15.5]);
 expect(storyboardTimecode(.5)).toBe('00:00:00.500');
 expect(storyboardTimecode(15.5)).toBe('00:00:15.500');
 expect(storyboardSampleTimes(60)).toHaveLength(60);
 for(const invalid of [0,NaN,Infinity,61])expect(()=>storyboardSampleTimes(invalid)).toThrow();
});

it('extracts a newly uploaded video once and updates again after replacement',()=>{
 const scene=createVideoWorkflowProject('depth-copy','auto',1).studioScene!,seen=new Map<string,string>(),source=scene.nodes.find(n=>n.id==='auto-source')!;
 expect(pendingStudioStoryboards(scene,seen)).toEqual([]);
 source.content='/new.mp4';expect(pendingStudioStoryboards(scene,seen)).toEqual([source.id]);
 expect(pendingStudioStoryboards(scene,seen)).toEqual([]);
 source.content='/replacement.mp4';expect(pendingStudioStoryboards(scene,seen)).toEqual([source.id]);
});

it('keeps existing legacy sheets on initial load, but replaces them when the source changes',()=>{
 const scene=createVideoWorkflowProject('depth-copy','auto',1).studioScene!,source=scene.nodes.find(n=>n.id==='auto-source')!,seen=new Map<string,string>();
 source.content='/original.mp4';scene.nodes.push(studioStoryboardNode(source,'/sheet.jpg',16,'sheet'));
 expect(pendingStudioStoryboards(scene,seen)).toEqual([]);
 source.content='/replacement.mp4';expect(pendingStudioStoryboards(scene,seen)).toEqual([source.id]);
});

it('uses stable asset identifiers instead of temporary Blob addresses',()=>{
 const scene=createVideoWorkflowProject('depth-copy','auto',1).studioScene!,source=scene.nodes.find(n=>n.id==='auto-source')!,seen=new Map<string,string>();
 source.content='blob:first';source._contentAssetId='video-1';
 expect(pendingStudioStoryboards(scene,seen)).toEqual([source.id]);
 source.content='blob:refreshed';expect(pendingStudioStoryboards(scene,seen)).toEqual([]);
 source._contentAssetId='video-2';expect(pendingStudioStoryboards(scene,seen)).toEqual([source.id]);
});

it('blocks old analysis after a source change until 05 has completed again',()=>{
 const scene=createVideoWorkflowProject('depth-copy','auto',1).studioScene!;
 for(const key of ['product','person'])scene.nodes.find(n=>n.id==='auto-'+key)!.content='/'+key+'.jpg';
 const source=scene.nodes.find(n=>n.id==='auto-source')!;source.content='/source.mp4';
 scene.nodes.push(studioStoryboardNode(source,'/masked.jpg',16,'sheet'));
 scene.connections=wireStudioStoryboards(scene).connections;
 const analysis=scene.nodes.find(n=>n.id==='auto-analysis')!;
 analysis.settings={...compilerSettings(analysis),text:'旧片分析',_chatCompletedAt:10,beikeSourceVideoChangedAt:20};
 expect(()=>resolveStudioInputs(scene,'auto-keyframe')).toThrow('重新运行05');
});

it('only invalidates analysis when extraction has evidence of a different source',()=>{
 const scene=createVideoWorkflowProject('depth-copy','auto',1).studioScene!;
 const source=scene.nodes.find(n=>n.id==='auto-source')!;
 source.content='blob:refreshed';source._contentAssetId='video-1';
 const legacy=studioStoryboardNode(source,'/legacy.jpg',16,'legacy');
 const current=studioStoryboardNode(source,'/current.jpg',16,'current');
 current.settings={...compilerSettings(current),beikeStoryboardSourceKey:'asset:video-1'};
 const retired=studioStoryboardNode(source,'/retired.jpg',16,'retired');
 retired.settings={...compilerSettings(retired),beikeStoryboardSourceKey:'asset:video-0',beikeStoryboardActive:false};
 expect(storyboardSourceChanged([legacy,retired],'asset:video-1')).toBe(false);
 expect(storyboardSourceChanged([current,retired],'asset:video-1')).toBe(false);
 expect(storyboardSourceChanged([],'asset:video-1')).toBe(false);
 expect(storyboardSourceChanged([legacy],'asset:video-2','asset:video-1')).toBe(true);
 expect(storyboardSourceChanged([current],'asset:video-2')).toBe(true);
});

it('visibly connects every page in the current custom flow and repairs existing canvases idempotently',()=>{
 const project=createVideoWorkflowProject('depth-copy','custom',1),scene=project.studioScene!;
 const source=scene.nodes.find(n=>n.id==='custom-source')!;
 scene.nodes.push(studioStoryboardNode(source,'/page1.jpg',16,'sheet-1'),studioStoryboardNode(source,'/page2.jpg',16,'sheet-2',1));
 scene.nodes.push({id:'unrelated',type:'text-node',settings:{beikePromptCompiler:true}});
 const next=upgradeVideoWorkflowProject(project).studioScene!;
 for(const id of ['sheet-1','sheet-2']){
  expect(next.connections.some(e=>e.from===source.id&&e.to===id)).toBe(true);
  expect(next.connections.filter(e=>e.from===id).map(e=>e.to).sort()).toEqual(['custom-analysis','custom-keyframe','custom-prompt','custom-video']);
 }
 expect(next.connections.some(e=>e.to==='unrelated')).toBe(false);
 expect(wireStudioStoryboards(next)).toBe(next);
});

it('does not attach unmasked, retired, or unrelated sheets',()=>{
 const scene=createVideoWorkflowProject('depth-copy','custom',1).studioScene!,source=scene.nodes[0];
 const sheet=studioStoryboardNode(source,'/sheet.jpg',16,'sheet');
 scene.nodes.push({...sheet,settings:{...sheet.settings as object,beikeStoryboardFacesMasked:false}});
 expect(wireStudioStoryboards(scene)).toBe(scene);
});

it('includes only processed sheets from the compiler source lineage and invalidates 08 after sheet changes',()=>{
 const scene:StudioScene={nodes:[
  {id:'source',type:'input-image',content:'/original.mp4',settings:{mediaType:'video'}},
  {id:'analysis',type:'text-node',content:'完整15秒分析'},
  {id:'compiler',type:'text-node',prompt:'完整15秒',settings:{beikePromptCompiler:true,duration:15}},
  {id:'sheet',type:'input-image',content:'/masked.jpg',settings:{beikeStoryboardSourceId:'source',beikeStoryboardFacesMasked:true}},
  {id:'other',type:'input-image',content:'/unrelated.jpg',settings:{beikeStoryboardSourceId:'other-source',beikeStoryboardFacesMasked:true}},
  {id:'legacy',type:'input-image',content:'/unmasked.jpg',settings:{beikeStoryboardSourceId:'source'}},
  {id:'video',type:'gen-video'}
 ],connections:[{id:'a',from:'source',to:'analysis'},{id:'b',from:'analysis',to:'compiler'},{id:'c',from:'compiler',to:'video'}],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
 const inputs=resolveStudioInputs(scene,'compiler');
 expect(inputs.refs.map(ref=>ref.url)).toEqual(['/masked.jpg']);
 const compiler=scene.nodes[2];compiler.settings={...compilerSettings(compiler),beikeCompilerApproved:'正式15秒稿',text:'正式15秒稿',beikeCompilerInputKey:studioCompilerKey(compiler,inputs)};
 expect(resolveStudioInputs(scene,'video').refs).toEqual(inputs.refs);
 scene.nodes[3].content='/new-masked.jpg';
 expect(()=>resolveStudioInputs(scene,'video')).toThrow('重新优化');
});

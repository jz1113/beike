import { expect, it } from 'vitest';
import { canConnectStudioNodes, changeStudioConnection, filterStudioConnections, resolveStudioInputs, restoreStudioReference, selectVideoCopyKeyframe, selectVideoCopyStoryboard } from './studioConnections';
import type { StudioScene } from './types';

const scene=():StudioScene=>({nodes:[{id:'text',type:'text-node',content:'上游文字'},{id:'ref',type:'input-image',content:'local-asset://image'},
  {id:'image',type:'gen-image',prompt:'图片'},{id:'video',type:'gen-video',prompt:'视频'}],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}});

it('submits references in the displayed strip order while retaining each source identity',()=>{
  const value=scene();
  value.nodes.push({id:'second',type:'input-image',content:'/storage/second.png'});
  value.nodes[2].settings={inputImageOrder:['/storage/second.png','local-asset://image']};
  value.connections=[{id:'first',from:'ref',to:'image'},{id:'second',from:'second',to:'image'}];
  expect(resolveStudioInputs(value,'image').refs.map(ref=>ref.nodeId)).toEqual(['second','ref']);
  value.nodes[2].settings={inputItemOrder:['/storage/second.png']};
  expect(resolveStudioInputs(value,'image').refs.map(ref=>ref.nodeId)).toEqual(['second','ref']);
  expect(value.connections[0].from).toBe('ref');
});

it('allows planning an image/video chain before results exist, while blocking self, duplicates, cycles and incompatible types',()=>{
  let value=scene();
  value=changeStudioConnection(value,{kind:'add',from:'ref',to:'image'});
  value=changeStudioConnection(value,{kind:'add',from:'image',to:'video'});
  expect(value.connections).toHaveLength(2);
  expect(()=>changeStudioConnection(value,{kind:'add',from:'ref',to:'image'})).toThrow('已连接');
  expect(()=>changeStudioConnection(value,{kind:'add',from:'image',to:'image'})).toThrow('自身');
  expect(canConnectStudioNodes(value.nodes[3],value.nodes[2],value.connections)).toBe(false);
  expect(()=>changeStudioConnection(value,{kind:'add',from:'video',to:'image'})).toThrow('循环');
});
it('reconnects in place and removes stale group metadata without losing the original graph',()=>{
  const value=scene();value.connections=[{id:'edge',from:'text',to:'video',fromGroupId:'group',fromGroupNodeIds:['text','ref']}];
  const updated=changeStudioConnection(value,{kind:'reconnect',id:'edge',from:'image',to:'video'});
  expect(updated.connections).toEqual([{id:'edge',from:'image',to:'video'}]);
  expect(changeStudioConnection(updated,{kind:'remove',id:'edge'}).connections).toEqual([]);
  expect(value.connections[0].fromGroupId).toBe('group');
});
it('applies the same cycle and duplicate checks to pointer additions without removing legacy edges',()=>{
  const value=scene();value.connections=[{id:'old',from:'text',to:'image'}];
  expect(filterStudioConnections(value,[...value.connections,{id:'next',from:'image',to:'video'},
    {id:'cycle',from:'video',to:'text'},{id:'duplicate',from:'text',to:'image'},{id:'self',from:'video',to:'video'}]))
    .toEqual([...value.connections,{id:'next',from:'image',to:'video'}]);
});
it('rejects empty, pending and failed upstream results instead of sending missing or old references',()=>{
  const value=scene();value.connections=[{id:'edge',from:'image',to:'video'}];
  expect(()=>resolveStudioInputs(value,'video')).toThrow('未就绪');
  value.nodes[2].imageUrl='/storage/old.png';value.nodes[2].isGenerating=true;
  expect(()=>resolveStudioInputs(value,'video')).toThrow('先完成');
  value.nodes[2].isGenerating=false;value.nodes[2].errorMsg='失败';
  expect(()=>resolveStudioInputs(value,'video')).toThrow('生成失败');
  value.nodes[2].content='/storage/new.png';delete value.nodes[2].errorMsg;
  expect(resolveStudioInputs(value,'video').refs[0].url).toBe('/storage/new.png');
});
it('includes all group text/media once, and follows the selected result rather than old workflow IDs',()=>{
  const value=scene();value.nodes[2].settings={beikeRequiredInputs:['deleted']};
  value.connections=[{id:'group-edge',from:'ref',to:'image',fromGroupNodeIds:['ref','text']},{id:'duplicate-text',from:'text',to:'image'}];
  expect(resolveStudioInputs(value,'image')).toEqual({prompt:'【@文本1】\n上游文字\n图片',refs:[{nodeId:'ref',type:'image',url:'local-asset://image',assetId:undefined}]});
  value.connections=[];
  expect(resolveStudioInputs(value,'image').refs).toEqual([]);
});
it('keeps the selected media of a preview node usable as a reference',()=>{
  const value=scene();value.nodes.push({id:'preview',type:'preview',content:'/storage/old.png',selectedPreviewImage:'/storage/selected.png'});
  value.connections=[{id:'preview-image',from:'preview',to:'image'}];
  expect(resolveStudioInputs(value,'image').refs[0].url).toBe('/storage/selected.png');
});
it('uses the reviewed storyboard body after editing an analysis with an upstream brief',()=>{
  const value=scene();
  value.nodes[0].settings={beikeTextResultRequired:true,text:'旧的5秒分镜',textNodeDisplayText:'已审核的15秒室外分镜'};
  value.connections=[{id:'reviewed',from:'text',to:'image'}];
  expect(resolveStudioInputs(value,'image').prompt).toBe('【@文本1】\n已审核的15秒室外分镜\n图片');
  value.nodes[0].settings={beikeTextResultRequired:false,text:'旧的5秒分镜',textNodeDisplayText:'已审核的15秒室外分镜'};
  expect(resolveStudioInputs(value,'image').prompt).toBe('【@文本1】\n旧的5秒分镜\n图片');
});
it('rebuilds expired input preview state on reopen without replacing the saved source or its cache identity',()=>{
  const node={id:'ref',type:'input-image',content:'data:image/png;base64,original',settings:{mediaType:'image',
    _localCacheAssetId:'ref-file',_canvasDisplayPreviewUrl:'blob:previous-document',_useCanvasPreviewDisplay:true,_dropPreviewPending:true}};
  expect(restoreStudioReference(node)).toEqual({...node,settings:{mediaType:'image',_localCacheAssetId:'ref-file'}});
  expect(node.settings._useCanvasPreviewDisplay).toBe(true);
  const remote={...node,settings:{_canvasDisplayPreviewUrl:'/storage/preview.png'}};
  expect(restoreStudioReference(remote)).toBe(remote);
});
it('uses the selected original scene frame instead of a stale uploaded background',()=>{
 const value=scene();
 value.nodes[1].content='';value.nodes[1].missingMedia=true;
 value.nodes[2].settings={beikeReferencePreparationRole:'scene',beikeSceneFrameUrl:'/storage/original-frame.jpg'};
 value.nodes[2].prompt='从原片重建无人场景';
 value.connections=[{id:'old-background',from:'ref',to:'image'}];
 expect(resolveStudioInputs(value,'image')).toEqual({prompt:'从原片重建无人场景',refs:[{nodeId:'image',type:'image',url:'/storage/original-frame.jpg'}]});
});

const shared='【全片一致性】同一人物、自然光。【声音模式：静音】【全片一致性结束】';
const segment=(id=1,duration=8)=>`【视频片段 ${String(id).padStart(2,'0')}｜时长 ${duration} 秒】抬手后停稳。【视频片段结束】`;

it('sends only the opening pose to keyframe generation, leaving all motion for the video model',()=>{
  const script=shared+'【视频片段 01｜时长 15 秒】\n首帧：红门前俯身近景。\n本地时间轴：\n0–3秒：后退两步。\n3–15秒：转身再走近。\n结束状态：面部特写。\n【视频片段结束】';
  const image=selectVideoCopyKeyframe([script],'【使用片段：01】单张写实画面。');
  expect(image).toMatchObject({duration:15,audio:false});
  expect(image.prompt).toContain('红门前俯身近景');
  expect(image.prompt).not.toMatch(/后退两步|转身再走近|面部特写|本地时间轴/);
  expect(selectVideoCopyStoryboard([script],'').prompt).toContain('转身再走近');
  expect(()=>selectVideoCopyKeyframe([shared+segment()],'' )).toThrow('缺少首帧');
});

it('selects one complete segment and keeps unrelated analysis and notes out of the submitted script',()=>{
  const result=selectVideoCopyStoryboard(['观察报告。'+shared+segment()+segment(2),'额外操作教程'],'【使用片段：02】按时间轴执行。');
  expect(result).toMatchObject({duration:8,audio:false});
  expect(result.prompt).toContain('本次生成片段 02');
  expect(result.prompt).not.toMatch(/观察报告|操作教程|视频片段 01/);
  expect(selectVideoCopyStoryboard([shared.replace('静音','生成声音')+segment()],'').audio).toBe(true);
});
it('rejects unfinished, missing, ambiguous or out-of-range scripts rather than submitting the analysis instructions',()=>{
  for(const value of ['',shared,shared+segment().replace('【视频片段结束】',''),shared+segment()+segment(),shared+segment(1,3),shared+segment(1,16),shared.replace('【声音模式：静音】','')+segment()]) {
    expect(()=>selectVideoCopyStoryboard([value],'【使用片段：01】')).toThrow();
  }
  expect(()=>selectVideoCopyStoryboard([shared+segment()],'【使用片段：02】')).toThrow('片段 2');
  expect(()=>selectVideoCopyStoryboard([shared+segment(),shared+segment()],'')).toThrow('一份');
});

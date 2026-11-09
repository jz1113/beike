import {previousDurationAnalysisPrompt,videoCopyAnalysisPrompt,videoCopyKeyframePrompt,legacyVideoCopyAnalysisPrompt,legacyVideoCopyKeyframePrompt,unstyledVideoCopyAnalysisPrompt,unstyledVideoCopyKeyframePrompt,unstyledDepthCopyVideoPrompt} from './videoWorkflowPrompts';
import {assert,expect,it} from 'vitest';
import {restoreVideoWorkflowPrompts as upgradeVideoWorkflowProject,buildVideoWorkflowProject as createVideoWorkflowProject} from './videoWorkflowProjects';
import {legacyDepthProject} from './videoWorkflow.test-support';
it('restores missing delivered depth prompts and enables running without changing media, models or wiring',()=>{
 const id='canvas-proj-4d8c2240-3ae8-4a81-bfda-bf73851516f6';
 const p=legacyDepthProject(id,1),scene=p.studioScene!;
 for(const key of ['analysis','keyframe','video']) {const n=scene.nodes.find(n=>n.id===`${id}-${key}`)!;n.prompt='';n.settings={...n.settings as object,textNodeDraftPrompt:'',model:'chosen-model'};}
 scene.nodes.find(n=>n.id===`${id}-person`)!.content='/storage/person.png';
 const next=upgradeVideoWorkflowProject(p).studioScene!;
 for(const key of ['analysis','keyframe','prompt'])expect(next.nodes.find(n=>n.id===`${id}-${key}`)?.prompt).toBeTruthy();
 expect(next.nodes.find(n=>n.id===`${id}-analysis`)?.settings).toMatchObject({textNodeDraftPrompt:expect.any(String),beikeTextResultRequired:true,model:'chosen-model'});
 expect(next.nodes.find(n=>n.id===`${id}-prompt`)?.settings).toMatchObject({model:'chosen-model'});
 expect(next.nodes.find(n=>n.id===`${id}-person`)?.content).toBe('/storage/person.png');
 expect(next.connections.filter(e=>e.to===`${id}-video`).map(e=>e.from)).toEqual(['prompt','keyframe','product','person','background'].map(key=>`${id}-${key}`));
});
it('repairs legacy depth reference wiring once and preserves imported media and custom instructions',()=>{
 const p=legacyDepthProject('legacy',1),s=p.studioScene!;
 const video=s.nodes.find(n=>n.id==='legacy-video')!;video.settings={...video.settings as object,beikeReferenceVersion:1};
 s.connections=s.connections.filter(e=>!['legacy-person','legacy-background'].includes(e.from));
 for(const key of ['person','background'])s.nodes.find(n=>n.id===`legacy-${key}`)!.content=`/storage/${key}.png`;
 const analysis=s.nodes.find(n=>n.id==='legacy-analysis')!;
 analysis.prompt='我的分镜要求';analysis.settings={...analysis.settings as object,textNodeDraftPrompt:'我的分镜要求'};
 const next=upgradeVideoWorkflowProject(p),scene=next.studioScene!;
 for(const key of ['person','background'])expect(scene.connections.some(e=>e.from===`legacy-${key}`&&e.to==='legacy-analysis')).toBe(true);
 for(const role of ['person','background'])expect(scene.connections.some(e=>e.from===`legacy-${role}`&&e.to==='legacy-keyframe')).toBe(true);
 expect(scene.nodes.filter(n=>(n.settings as Record<string,unknown>)?.beikeReferencePreparationRole)).toHaveLength(0);
 expect(scene.nodes.find(n=>n.id==='legacy-analysis')!.prompt).toBe('我的分镜要求');
 for(const key of ['person','background'])expect(scene.nodes.find(n=>n.id===`legacy-${key}`)!.content).toBe(`/storage/${key}.png`);
 expect(scene.nodes.find(n=>n.id==='legacy-analysis')!.settings).toMatchObject({beikeTextImageCount:3});
 expect(upgradeVideoWorkflowProject(next)).toBe(next);
});

it('removes duplicated old keyframe defaults while retaining genuine custom additions',()=>{
 const legacy=videoCopyKeyframePrompt.split('\n').filter((_,i)=>i!==0&&i!==2).join('\n');
 for(const custom of ['', '\n保留红色鞋子']) {
  const p=legacyDepthProject('dedupe',1);
  const frame=p.studioScene!.nodes.find(n=>n.id==='dedupe-keyframe')!;
  frame.prompt=`${videoCopyKeyframePrompt}\n用户补充要求：\n${legacy}${custom}`;
  const next=upgradeVideoWorkflowProject(p).studioScene!.nodes.find(n=>n.id===frame.id)!;
  expect(next.prompt).toBe(videoCopyKeyframePrompt+(custom?'\n用户补充要求：\n保留红色鞋子':''));
 }
});

it('upgrades previous default prompts while keeping appended requirements and outputs',()=>{
 const p=legacyDepthProject('refresh',1);
 for(const key of ['analysis','keyframe','video']) {
  const n=p.studioScene!.nodes.find(n=>n.id===`refresh-${key}`)!;
  assert(typeof n.prompt==='string',`${key} node must have a default prompt`);
  n.prompt=n.prompt.split('\n【节点交接规范】')[0]+'\n用户补充要求：\n保留红色鞋子';
  n.content='/storage/existing-result.png';
  if(key==='analysis')n.settings={...n.settings as object,textNodeDraftPrompt:n.prompt};
 }
 const next=upgradeVideoWorkflowProject(p);
 for(const key of ['analysis','keyframe','video']) {
  const n=next.studioScene!.nodes.find(n=>n.id===`refresh-${key==='video'?'prompt':key}`)!;
  expect(n.prompt).toContain(key==='video'?'【使用片段：01】':'【节点交接规范】');
  expect(n.prompt).toMatch(/用户补充要求：\n保留红色鞋子$/);
  expect(next.studioScene!.nodes.find(n=>n.id===`refresh-${key}`)!.content).toBe('/storage/existing-result.png');
  if(key==='analysis')expect(n.settings).toMatchObject({textNodeDraftPrompt:n.prompt});
 }
 expect(upgradeVideoWorkflowProject(next)).toBe(next);
});

it('keeps optional depth media outside the compiler and rejects bypassing 07',()=>{
 const p=createVideoWorkflowProject('depth-copy','script',1),scene=p.studioScene!;
 const video=scene.nodes.find(n=>n.id==='script-video')!;
 scene.nodes.push({id:'script-depth',type:'gen-video',content:'/storage/depth.mp4',settings:{beikeOperation:'depth-video'}});
 const next=upgradeVideoWorkflowProject(p).studioScene!;
 expect(next.nodes.find(n=>n.id==='script-depth')!.content).toBe('/storage/depth.mp4');
 expect(next.connections.filter(e=>e.to===video.id).map(e=>e.from)).toEqual(['script-prompt','script-keyframe','script-product','script-person','script-background']);
 expect(next.nodes.find(n=>n.id===video.id)!.settings).toMatchObject({beikeScriptOnly:false,beikeOptimizePrompt:false,beikeCompilerSource:'script-prompt'});
});

it('upgrades first-frame defaults to omni appearance references without losing user additions',()=>{
 const p=legacyDepthProject('omni',1);
 for(const [key,legacy] of [['analysis',legacyVideoCopyAnalysisPrompt],['keyframe',legacyVideoCopyKeyframePrompt]]) {
  const n=p.studioScene!.nodes.find(n=>n.id===`omni-${key}`)!;
  n.prompt=legacy+'\n用户补充要求：\n保留红色鞋子';
  n.content='/storage/result.png';
 }
 const next=upgradeVideoWorkflowProject(p);
 const analysis=next.studioScene!.nodes.find(n=>n.id==='omni-analysis')!;
 const frame=next.studioScene!.nodes.find(n=>n.id==='omni-keyframe')!;
 expect(analysis.prompt).toContain('【参考图制作要求】');
 expect(frame.prompt).toContain('不是首帧或尾帧');
 expect(frame.nodeName).toBe('06 人物、服装与场景整合图 · 默认1张');
 for(const n of [analysis,frame]) {
  expect(n.prompt).toMatch(/用户补充要求：\n保留红色鞋子$/);
  expect(n.content).toBe('/storage/result.png');
 }
 expect(analysis.settings).toMatchObject({textNodeDraftPrompt:analysis.prompt});
 expect(upgradeVideoWorkflowProject(next)).toBe(next);
});

it('carries style instructions into all three nodes while preserving existing results',()=>{
 const p=legacyDepthProject('style',1);
 for(const [key,prompt] of [['analysis',unstyledVideoCopyAnalysisPrompt],['keyframe',unstyledVideoCopyKeyframePrompt],['video',unstyledDepthCopyVideoPrompt]]) {
  const n=p.studioScene!.nodes.find(n=>n.id===`style-${key}`)!;
  n.prompt=prompt+'\n用户补充要求：\n保留商品蓝色';n.content='/storage/retained.png';
 }
 const next=upgradeVideoWorkflowProject(p);
 for(const key of ['analysis','keyframe','video']) {
  const n=next.studioScene!.nodes.find(n=>n.id===`style-${key==='video'?'prompt':key}`)!;
  expect(n.prompt).toContain(key==='analysis'?'【原片风格分析】':key==='keyframe'?'静态摄影质感':'表演节奏');
  expect(n.prompt).toMatch(/用户补充要求：\n保留商品蓝色$/);
  expect(next.studioScene!.nodes.find(n=>n.id===`style-${key}`)!.content).toBe('/storage/retained.png');
 }
 expect(upgradeVideoWorkflowProject(next)).toBe(next);
});
it('repairs analysis handoff after the optional depth node was removed',()=>{
 const p=legacyDepthProject('handoff',1),s=p.studioScene!;
 s.nodes=s.nodes.filter(n=>n.id!=='handoff-depth');
 s.connections=s.connections.filter(e=>!(e.from==='handoff-analysis'&&e.to==='handoff-keyframe'));
 const analysis=s.nodes.find(n=>n.id==='handoff-analysis')!;
 analysis.settings={...analysis.settings as object,text:'真实分析结果'};
 const next=upgradeVideoWorkflowProject(p).studioScene!;
 expect(next.connections.some(e=>e.from==='handoff-analysis'&&e.to==='handoff-keyframe')).toBe(true);
 expect(next.nodes.find(n=>n.id==='handoff-analysis')?.settings).toMatchObject({text:'真实分析结果'});
 expect(next.nodes.some(n=>n.id==='handoff-depth')).toBe(false);
 const disconnected = {
   ...next,
   connections: next.connections.filter(e => !(e.from === 'handoff-analysis' && e.to === 'handoff-keyframe')),
 };
 const reopened = upgradeVideoWorkflowProject({ ...p, studioScene: disconnected }).studioScene!;
 expect(reopened.connections.some(e => e.from === 'handoff-analysis' && e.to === 'handoff-keyframe')).toBe(false);
});

it('upgrades shipped duration instructions in existing compiler canvases without replacing results or custom additions',()=>{
 const project=createVideoWorkflowProject('depth-copy','duration-upgrade',1),scene=project.studioScene!;
 const analysis=scene.nodes.find(n=>n.id.endsWith('-analysis'))!;
 analysis.prompt=previousDurationAnalysisPrompt+'\n用户补充要求：\n保持红色鞋子';
 analysis.settings={...analysis.settings as object,textNodeDraftPrompt:analysis.prompt,text:'保留已有分镜'};
 scene.nodes.find(n=>n.id.endsWith('-video'))!.content='/storage/old-video.mp4';
 const next=upgradeVideoWorkflowProject(project);
 const updated=next.studioScene!.nodes.find(n=>n.id===analysis.id)!;
 expect(updated.prompt).toBe(videoCopyAnalysisPrompt+'\n用户补充要求：\n保持红色鞋子');
 expect(updated.settings).toMatchObject({text:'保留已有分镜',textNodeDraftPrompt:updated.prompt});
 expect(next.studioScene!.nodes.find(n=>n.id.endsWith('-video'))!.content).toBe('/storage/old-video.mp4');
 expect(upgradeVideoWorkflowProject(next)).toBe(next);
});

it('upgrades the saved analysis draft even when node prompt contains the previous generated report',()=>{
 const project=createVideoWorkflowProject('depth-copy','draft-duration',1);
 const node=project.studioScene!.nodes.find(n=>n.id.endsWith('-analysis'))!;
 node.prompt='【原片观察】已有15秒原片观察';
 node.settings={...node.settings as object,textNodeDraftPrompt:previousDurationAnalysisPrompt.replace('@图片2','@图片3'),text:'已有分镜结果'};
 const next=upgradeVideoWorkflowProject(project).studioScene!.nodes.find(n=>n.id===node.id)!;
 expect(next.settings).toMatchObject({text:'已有分镜结果',textNodeDraftPrompt:expect.stringContaining('必须输出一个【视频片段 01｜时长 15 秒】')});
});

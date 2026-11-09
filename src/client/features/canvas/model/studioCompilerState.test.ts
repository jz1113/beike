import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { selectedStoryboardPrompt } from '@client/shared/agent/videoPromptOutput';
import { videoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { StudioPromptCompilerDialog, type VideoPromptReview } from '../components/video/StudioStoryboardDialog';
import {
  compilerSettings,
  inheritStudioCompiler,
  restoreStudioCompilerDraft,
  saveStudioCompilerApproval,
  saveStudioCompilerDraft,
  studioCompilerKey,
  studioCompilerSelectionDuration,
  studioCompilerSelectionPrompt,
  upgradeStudioCompiler,
} from './studioCompilerState';
import { resolveStudioInputs } from './studioConnections';
import type { StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';
import { legacyDepthProject } from './videoWorkflow.test-support';
import { buildVideoWorkflowProject as createVideoWorkflowProject } from './videoWorkflowProjects';

const mocks=vi.hoisted(()=>({review:undefined as VideoPromptReview|undefined,optimize:vi.fn()}));
vi.mock('@client/shared/agent/videoPromptOptimizer',()=>({recoverVideoPromptOptimization:vi.fn(async()=>undefined),optimizeVideoPrompt:mocks.optimize}));
vi.mock('react-dom',()=>({createPortal:(child:unknown)=>child}));
vi.mock('@client/shared/hooks/useModalDialog',()=>({useModalDialog:()=>null}));
vi.mock('./studioGeneration',()=>({studioChannels:()=>[{id:'route',kind:'video',modelId:'doubao-seedance-2.5'}]}));
afterEach(()=>{mocks.review=undefined;vi.clearAllMocks();vi.unstubAllGlobals();});

const script='【全片一致性】蓝衣人物【声音模式：保留原声】【全片一致性结束】\n【视频片段 01｜时长 5 秒】\n开场画面：站立\n本地时间轴：0–2秒抬头，2–5秒微笑\n结束状态：停稳\n【视频片段结束】';
function fixture(){
 const project=createVideoWorkflowProject('depth-copy','compile',1),scene=project.studioScene!;
 const compiler=scene.nodes.find(n=>n.id==='compile-prompt')!,video=scene.nodes.find(n=>n.id==='compile-video')!;
 scene.nodes.find(n=>n.id==='compile-keyframe')!.content='/storage/ref.png';
 for(const key of ['product','person','background'])scene.nodes.find(n=>n.id==='compile-'+key)!.content='/storage/'+key+'.png';
 scene.nodes.find(n=>n.id==='compile-analysis')!.settings={textNodeDisplayText:script,beikeTextResultRequired:true};
 compiler.settings={...compilerSettings(compiler),model:'video-route',duration:'5s',beikeVideoAudio:false};
 return {project,scene,compiler,video};
}

it('creates a single text compiler and routes existing upstreams through it without losing media',()=>{
 const f=fixture();expect(f.compiler.type).toBe('text-node');
 expect(f.scene.connections.filter(e=>e.to===f.video.id).map(e=>e.from)).toEqual([f.compiler.id,'compile-keyframe','compile-product','compile-person','compile-background']);
 expect(upgradeStudioCompiler(f.project)).toBe(f.project);
 expect(resolveStudioInputs(f.scene,f.compiler.id)).toMatchObject({duration:5,audio:false,refs:expect.arrayContaining([{nodeId:'compile-keyframe',type:'image',url:'/storage/ref.png',assetId:undefined}])});
});

it('inherits the confirmed text and all settings once, then invalidates it when upstream or owner changes',()=>{
 const f=fixture(),inputs=resolveStudioInputs(f.scene,f.compiler.id);
 expect(()=>resolveStudioInputs(f.scene,f.video.id)).toThrow('尚未确认');
 f.compiler.settings={...compilerSettings(f.compiler),text:'确认稿',beikeCompilerApproved:'确认稿',beikeCompilerInputKey:studioCompilerKey(f.compiler,inputs)};
 expect(resolveStudioInputs(f.scene,f.video.id)).toMatchObject({prompt:'确认稿',duration:5,audio:false,refs:inputs.refs});
 expect(inheritStudioCompiler(f.video,f.scene).settings).toMatchObject({model:'video-route',duration:'5s',beikeOptimizePrompt:false,beikeScriptOnly:false,beikeVideoAudio:false});
 f.scene.nodes.find(n=>n.id==='compile-keyframe')!.content='/storage/new.png';
 expect(()=>resolveStudioInputs(f.scene,f.video.id)).toThrow('上游已修改');
});

it('refuses a duration that disagrees with the selected storyboard instead of silently retiming it',()=>{
 const f=fixture();f.compiler.settings={...compilerSettings(f.compiler),duration:'10s'};
 expect(()=>resolveStudioInputs(f.scene,f.compiler.id)).toThrow('时长必须');
});

it('rejects a detached compiler and extra video inputs instead of silently changing the approved request',()=>{
 const f=fixture();
 f.scene.connections=f.scene.connections.filter(e=>e.to!==f.video.id);
 expect(()=>resolveStudioInputs(f.scene,f.video.id)).toThrow('07');
 expect(()=>inheritStudioCompiler(f.video,f.scene)).toThrow('07');
 f.scene.connections.push({id:'compiler',from:f.compiler.id,to:f.video.id},{id:'bypass',from:'compile-source',to:f.video.id});
 expect(()=>resolveStudioInputs(f.scene,f.video.id)).toThrow('07');
});

it('rejects malformed durations instead of accepting a numeric prefix',()=>{
 for(const duration of ['5invalid','5s extra','5.5s','0s']) {
  const f=fixture();f.compiler.settings={...compilerSettings(f.compiler),duration};
  expect(()=>resolveStudioInputs(f.scene,f.compiler.id)).toThrow('时长');
 }
});

it('recovers a confirmed compiler after reload and still invalidates later storyboard edits',()=>{
 const f=fixture(),inputs=resolveStudioInputs(f.scene,f.compiler.id);
 f.compiler.settings={...compilerSettings(f.compiler),text:'刷新前确认稿',beikeCompilerApproved:'刷新前确认稿',beikeCompilerInputKey:studioCompilerKey(f.compiler,inputs)};
 f.video.content='/storage/previous-result.mp4';
 const restored=JSON.parse(JSON.stringify(f.project)) as typeof f.project;
 expect(upgradeStudioCompiler(restored)).toBe(restored);
 const scene=restored.studioScene!;
 expect(resolveStudioInputs(scene,f.video.id)).toMatchObject({prompt:'刷新前确认稿',duration:5,refs:inputs.refs});
 expect(scene.nodes.find(n=>n.id===f.video.id)?.content).toBe('/storage/previous-result.mp4');
 const analysis=scene.nodes.find(n=>n.id==='compile-analysis')!;
 analysis.settings={...compilerSettings(analysis),textNodeDisplayText:script.replace('微笑','抬手')};
 expect(()=>resolveStudioInputs(scene,f.video.id)).toThrow('上游已修改');
 expect(scene.nodes.find(n=>n.id===f.video.id)?.content).toBe('/storage/previous-result.mp4');
});

it.each([false,true])('keeps current approvals across refresh and invalidates pre-validation approvals (legacy=%s)',legacy=>{
 const f=fixture(),ref=f.scene.nodes.find(n=>n.id==='compile-keyframe')!;
 ref.content='blob:https://local/before';ref._contentAssetId='stable-asset';
 const inputs=resolveStudioInputs(f.scene,f.compiler.id),s=compilerSettings(f.compiler);
 // Simulate the legacy key format already stored by earlier versions.
 f.compiler.settings={...s,text:'确认稿',beikeCompilerApproved:'确认稿',beikeCompilerInputKey:legacy?JSON.stringify({inputs,model:s.model,duration:s.duration,audio:s.beikeVideoAudio,ratio:s.ratio,resolution:s.resolution,mode:s.beikeVideoMode}):studioCompilerKey(f.compiler,inputs)};
 ref.content='blob:https://local/after';
 if(legacy)expect(()=>resolveStudioInputs(f.scene,f.video.id)).toThrow('上游已修改');
 else expect(resolveStudioInputs(f.scene,f.video.id).prompt).toBe('确认稿');
 ref._contentAssetId='replacement';
 expect(()=>resolveStudioInputs(f.scene,f.video.id)).toThrow('上游已修改');
});

it('includes the standard text composer instructions and invalidates approval when they change',()=>{
 const f=fixture();
 f.compiler.settings={...compilerSettings(f.compiler),textNodeDraftPrompt:'强调袖口纹理'};
 const inputs=resolveStudioInputs(f.scene,f.compiler.id);
 expect(inputs.prompt).toContain('强调袖口纹理');
 f.compiler.settings={...compilerSettings(f.compiler),text:'确认稿',beikeCompilerApproved:'确认稿',beikeCompilerInputKey:studioCompilerKey(f.compiler,inputs)};
 expect(resolveStudioInputs(f.scene,f.video.id).prompt).toBe('确认稿');
 f.compiler.settings={...compilerSettings(f.compiler),textNodeDraftPrompt:'突出衣领细节'};
 expect(()=>resolveStudioInputs(f.scene,f.video.id)).toThrow('上游已修改');
});

const approvalScript='【全片一致性】蓝衣人物【声音模式：静音】【全片一致性结束】\n【视频片段 01｜时长 5 秒】\n开场画面：站立\n本地时间轴：0至5秒抬手\n结束状态：停稳\n【视频片段结束】';
function approvalFixture(){
 const project=createVideoWorkflowProject('depth-copy','approval',1),scene=project.studioScene!;
 scene.nodes.find(n=>n.id==='approval-prompt')!.settings={...compilerSettings(scene.nodes.find(n=>n.id==='approval-prompt')!),duration:'5s'};
 for(const suffix of ['keyframe','product','person','background'])scene.nodes.find(n=>n.id===`approval-${suffix}`)!.content=`/storage/${suffix}.png`;
 scene.nodes.find(n=>n.id==='approval-analysis')!.settings={textNodeDisplayText:approvalScript,beikeTextResultRequired:true};
 scene.nodes.find(n=>n.id==='approval-video')!.content='/storage/previous-video.mp4';
 const nodeId='approval-prompt',node=()=>scene.nodes.find(n=>n.id===nodeId)!;
 node().settings={...compilerSettings(node()),duration:'5s'};
 const raw=resolveStudioInputs(scene,nodeId),key=studioCompilerKey(node(),raw);
 const optimization:VideoPromptOptimization={original:raw.prompt,optimized:'原优化稿',skillId:'test',revision:'1',sourceUrl:'',textModel:'text-model'};
 const commands:StudioTaskCommands={read:()=>scene,run:vi.fn(),stop:vi.fn(),update:(id,_expected,patch)=>{const n=scene.nodes.find(n=>n.id===id)!;Object.assign(n,{...patch,settings:{...compilerSettings(n),...patch.settings as object}});}};
 const input={model:'video-model',mode:'omni' as const,prompt:raw.prompt,scriptOnly:true,duration:5,audio:false,images:raw.refs.length,videos:0};
 const args={commands,nodeId,key,optimization,edited:selectedStoryboardPrompt(input)!,input};
 return {project,scene,node,args};
}

it('awaits durable save before reporting confirmation, and restores the same approval after reload',async()=>{
 const f=approvalFixture();let resolveSave!:()=>void;
 const save=vi.fn(()=>new Promise<void>(resolve=>{resolveSave=resolve;}));
 let finished=false;const result=saveStudioCompilerApproval({...f.args,save}).then(()=>{finished=true;});
 await Promise.resolve();expect(finished).toBe(false);expect(save).toHaveBeenCalledTimes(1);
 resolveSave();await result;
 const restored=JSON.parse(JSON.stringify(f.project)) as typeof f.project;
 expect(resolveStudioInputs(restored.studioScene!,'approval-video').prompt).toContain(f.args.edited);
 expect(restored.studioScene!.nodes.find(n=>n.id==='approval-keyframe')!.content).toBe('/storage/keyframe.png');
});

it('keeps an editable draft on save failure, blocks generation, and retries saving without another optimization',async()=>{
 const f=approvalFixture(),save=vi.fn().mockRejectedValueOnce(new Error('存储已满')).mockResolvedValueOnce(undefined);
 await expect(saveStudioCompilerApproval({...f.args,save})).rejects.toThrow('存储已满');
 expect(f.node().beikePromptOptimization).toMatchObject({draft:f.args.edited});
 expect(()=>resolveStudioInputs(f.scene,'approval-video')).toThrow('尚未确认');
 const failedReload=JSON.parse(JSON.stringify(f.project)) as typeof f.project;
 expect(()=>resolveStudioInputs(failedReload.studioScene!,'approval-video')).toThrow('尚未确认');
 await saveStudioCompilerApproval({...f.args,save});
 expect(save).toHaveBeenCalledTimes(2);
 expect(f.scene.nodes.find(n=>n.id==='approval-video')!.content).toBe('/storage/previous-video.mp4');
 expect(resolveStudioInputs(f.scene,'approval-video').prompt).toContain(f.args.edited);
});

it('refuses a changed upstream before saving confirmation and leaves existing media intact',async()=>{
 const f=approvalFixture(),save=vi.fn();f.scene.nodes.find(n=>n.id==='approval-keyframe')!.content='/storage/new.png';
 await expect(saveStudioCompilerApproval({...f.args,save})).rejects.toThrow('已修改');
 expect(save).not.toHaveBeenCalled();expect(f.scene.nodes.find(n=>n.id==='approval-keyframe')!.content).toBe('/storage/new.png');
});

it('blocks saving an edited wood table script before it can reach 08',async()=>{
 const f=approvalFixture(),save=vi.fn();
 await expect(saveStudioCompilerApproval({...f.args,edited:f.args.edited+'\n开场画面：趴在木桌上，百叶窗硬光。',save})).rejects.toThrow('缺失或冲突');
 expect(save).not.toHaveBeenCalled();
 expect(()=>resolveStudioInputs(f.scene,'approval-video')).toThrow('尚未确认');
});

function draftFixture(){
 let scene=createVideoWorkflowProject('depth-copy','draft',1).studioScene!;
 scene.nodes.find(n=>n.id==='draft-prompt')!.settings={...compilerSettings(scene.nodes.find(n=>n.id==='draft-prompt')!),duration:'5s'};
 for(const suffix of ['keyframe','product','person','background'])scene.nodes.find(n=>n.id===`draft-${suffix}`)!.content=`/storage/${suffix}.png`;
 scene.nodes.find(n=>n.id==='draft-analysis')!.settings={textNodeDisplayText:approvalScript,beikeTextResultRequired:true};
 const nodeId='draft-prompt',node=()=>scene.nodes.find(n=>n.id===nodeId)!;
 node().settings={...compilerSettings(node()),model:'route',duration:'5s'};
 const input={model:'doubao-seedance-2.5',mode:'omni' as const,prompt:resolveStudioInputs(scene,nodeId).prompt,scriptOnly:true,duration:5,audio:false,images:4,videos:0};
 const skill=videoPromptSkill(input.model,input.mode)!;
 const preview={key:studioCompilerKey(node(),resolveStudioInputs(scene,nodeId)),input,value:{compiler:true,videoModel:input.model,videoMode:input.mode,original:input.prompt,optimized:'优化原稿',skillId:skill.id,revision:skill.source!.revision,sourceUrl:'',textModel:'text-model'}};
 const commands:StudioTaskCommands={read:()=>scene,run:vi.fn(),stop:vi.fn(),update:(id,_expected,patch)=>{const n=scene.nodes.find(n=>n.id===id)!;Object.assign(n,{...patch,settings:{...compilerSettings(n),...patch.settings as object}});}};
 return {node,nodeId,commands,preview,reload:()=>{scene=JSON.parse(JSON.stringify(scene));}};
}

it('reopens the persisted 07 draft after refresh and saves further edits without another model call',async()=>{
 const f=draftFixture();await saveStudioCompilerDraft(f.commands,f.nodeId,f.preview,'刷新前的手动修改',async()=>{});f.reload();
 vi.stubGlobal('document',{body:{}});
 renderToStaticMarkup(createElement(StudioPromptCompilerDialog,{projectId:'draft',nodeId:f.nodeId,commands:f.commands,onSave:async()=>{},onClose:vi.fn(),onReview:review=>{mocks.review=review;}}));
 expect(mocks.review?.optimization.draft).toBe('刷新前的手动修改');expect(mocks.review?.onDraft).toBeTypeOf('function');
 await mocks.review!.onDraft!('刷新后的继续修改');f.reload();
 expect(restoreStudioCompilerDraft(f.commands.read(),f.nodeId)?.value.draft).toBe('刷新后的继续修改');
 expect(mocks.optimize).not.toHaveBeenCalled();expect(()=>resolveStudioInputs(f.commands.read(),'draft-video')).toThrow('尚未确认');
});

it('rejects drafts after upstream, configuration or Skill revision changes without deleting the old text',async()=>{
 const f=draftFixture();await saveStudioCompilerDraft(f.commands,f.nodeId,f.preview,'保留草稿',async()=>{});
 f.node().settings={...compilerSettings(f.node()),duration:'10s'};
 expect(restoreStudioCompilerDraft(f.commands.read(),f.nodeId)).toBeUndefined();
 f.node().settings={...compilerSettings(f.node()),duration:'5s'};
 f.node().beikePromptOptimization={...f.preview.value,revision:'obsolete',draft:'保留草稿'};
 expect(restoreStudioCompilerDraft(f.commands.read(),f.nodeId)).toBeUndefined();
 expect(f.node().beikePromptOptimization).toMatchObject({draft:'保留草稿'});
});

it('keeps a failed-save draft retryable after reload and confirms it without another optimization',async()=>{
 const f=draftFixture(),edited=selectedStoryboardPrompt(f.preview.input)!;await saveStudioCompilerDraft(f.commands,f.nodeId,f.preview,edited,async()=>{});
 await expect(saveStudioCompilerApproval({commands:f.commands,nodeId:f.nodeId,key:f.preview.key,input:f.preview.input,optimization:f.preview.value,edited,save:async()=>{throw Error('存储已满');}})).rejects.toThrow('存储已满');
 f.reload();const recovered=restoreStudioCompilerDraft(f.commands.read(),f.nodeId)!;
 expect(recovered.value.draft).toBe(edited);
 await saveStudioCompilerApproval({commands:f.commands,nodeId:f.nodeId,key:recovered.key,input:recovered.input,optimization:recovered.value,edited:recovered.value.draft!,save:async()=>{}});
 expect(resolveStudioInputs(f.commands.read(),'draft-video').prompt).toContain(edited);expect(mocks.optimize).not.toHaveBeenCalled();
});

it('restores a draft when the same cached asset receives a new Blob URL on refresh',async()=>{
 const f=draftFixture(),keyframe=f.commands.read().nodes.find(n=>n.id==='draft-keyframe')!;
 keyframe.content='blob:before-refresh';keyframe._contentAssetId='cached-frame';
 f.preview.key=studioCompilerKey(f.node(),resolveStudioInputs(f.commands.read(),f.nodeId));
 await saveStudioCompilerDraft(f.commands,f.nodeId,f.preview,'本地素材草稿',async()=>{});f.reload();
 f.commands.read().nodes.find(n=>n.id==='draft-keyframe')!.content='blob:after-refresh';
 const recovered=restoreStudioCompilerDraft(f.commands.read(),f.nodeId)!;
 expect(recovered.value.draft).toBe('本地素材草稿');
 expect(recovered.key).toBe(studioCompilerKey(f.node(),resolveStudioInputs(f.commands.read(),f.nodeId)));
 f.commands.read().nodes.find(n=>n.id==='draft-keyframe')!._contentAssetId='another-frame';
 expect(restoreStudioCompilerDraft(f.commands.read(),f.nodeId)).toBeUndefined();
});

it('preserves explicit audio choices, previous optimization records and generated output when inserting 07',()=>{
 for(const audio of [true,false]) {
  const project=legacyDepthProject('legacy-audio',1),scene=project.studioScene!;
  const video=scene.nodes.find(n=>n.id==='legacy-audio-video')!;
  const record={optimized:'旧优化稿',submitted:'实际生成稿'};
  video.settings={...compilerSettings(video),beikeVideoAudio:audio};
  video.beikePromptOptimization=record;video.content='/storage/retained.mp4';
  const next=upgradeStudioCompiler(project),nodes=next.studioScene!.nodes;
  expect(nodes.find(n=>compilerSettings(n).beikePromptCompiler)?.settings).toMatchObject({beikeVideoAudio:audio});
  expect(nodes.find(n=>n.id===video.id)).toMatchObject({content:video.content,beikePromptOptimization:record});
  expect(compilerSettings(video).beikeCompilerSource).toBeUndefined();
  expect(upgradeStudioCompiler(next)).toBe(next);
 }
});

it('never reuses the id of an existing user note for the compiler',()=>{
 const project=legacyDepthProject('collision',1),scene=project.studioScene!;
 const note={id:'collision-prompt',type:'text-node',content:'保留我的备注'};
 scene.nodes.push(note);
 const next=upgradeStudioCompiler(project).studioScene!;
 expect(new Set(next.nodes.map(n=>n.id)).size).toBe(next.nodes.length);
 expect(next.nodes.find(n=>n.id===note.id)).toBe(note);
 const compiler=next.nodes.find(n=>compilerSettings(n).beikePromptCompiler)!;
 expect(next.connections.filter(e=>e.to==='collision-video').map(e=>e.from)).toEqual([compiler.id,'collision-keyframe','collision-product','collision-person','collision-background']);
});

it('inserts missing selection and replaces duplicate old markers',()=>{
 expect(studioCompilerSelectionPrompt('按分镜执行','01')).toBe('【使用片段：01】\n按分镜执行');
 expect(studioCompilerSelectionPrompt('【使用片段：01】正文【使用片段：02】','2')).toBe('【使用片段：02】\n正文');
 expect(()=>studioCompilerSelectionPrompt('正文','')).toThrow('编号');
});

it('uses 15 second storyboard instead of stale 5 second compiler default',()=>{
 const longScript='【全片一致性】【声音模式：静音】同一人物【全片一致性结束】\n【视频片段 01｜时长 15 秒】\n开场画面：站立\n本地时间轴：0至15秒 保持展示\n结束状态：停稳\n【视频片段结束】';
 const scene={nodes:[{id:'script',type:'text-node',content:longScript},{id:'image',type:'input-image',content:'/image.png'},{id:'compiler',type:'text-node',prompt:'按分镜执行',settings:{beikeScriptOnly:true,beikePromptCompiler:true,duration:'5s'}}],connections:[{id:'a',from:'script',to:'compiler'},{id:'b',from:'image',to:'compiler'}],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}} as StudioScene;
 expect(studioCompilerSelectionDuration(scene,'compiler','01')).toBe('15s');
 expect(studioCompilerSelectionDuration(scene,'compiler','02')).toBeUndefined();
 expect(scene.nodes[2].settings).toMatchObject({duration:'5s'});
});

it('resolves a manually added compiler from its own prompt or connected text, without template inputs',()=>{
 const compiler={id:'compiler',type:'text-node',settings:{beikePromptCompiler:true,beikeScriptOnly:false,duration:'5s',beikeVideoAudio:false}};
 const scene={nodes:[compiler],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}} as StudioScene;
 expect(()=>resolveStudioInputs(scene,'compiler')).toThrow('请输入视频提示词');
 compiler.settings={...compiler.settings,...{textNodeDraftPrompt:'让镜头缓慢推近'}};
 expect(resolveStudioInputs(scene,'compiler')).toEqual({prompt:'让镜头缓慢推近',duration:5,audio:false,refs:[]});
 scene.nodes.push({id:'text',type:'text-node',content:'人物走向窗边'},{id:'image',type:'input-image',content:'/image.png'});
 scene.connections.push({id:'a',from:'text',to:'compiler'},{id:'b',from:'image',to:'compiler'});
 expect(resolveStudioInputs(scene,'compiler')).toMatchObject({prompt:'人物走向窗边\n\n让镜头缓慢推近',refs:[{type:'image',url:'/image.png'}]});
});

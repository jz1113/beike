import { describe, expect, it } from 'vitest';
import { compilerSettings, studioCompilerKey, studioVideoPromptPreview } from './studioCompilerState';
import { omniCopyPreparationInputs, resolveStudioInputs, studioStoryboardAnalysisBlock, studioStoryboardRoles } from './studioConnections';
import { assertStudioReferenceNumbers, assertStudioTextReferences } from './studioGeneration';
import { studioStoryboardNode, wireStudioStoryboards } from './studioStoryboard';
import { buildVideoWorkflowProject, createVideoWorkflowProject, restoreVideoWorkflowPrompts, upgradeVideoReferencePreparation, upgradeVideoWorkflowNodes, upgradeVideoWorkflowProject } from './videoWorkflowProjects';

describe('复刻节点工作流',()=>{
  it('保存空白W3模板，四项素材分工固定，默认H3、768P、15秒、静音',()=>{
    const p=createVideoWorkflowProject('w3-copy','template',1),s=p.studioScene!;
    expect(p.title).toBe('W3复刻模板');
    expect(s.nodes.filter(n=>n.type==='input-image').map(n=>n.id)).toEqual(['source','product','person','background'].map(k=>`template-${k}`));
    const video=s.nodes.find(n=>n.id==='template-video')!;
    expect(video.settings).toMatchObject({model:'MiniMax-H3',resolution:'768P',duration:'15s',beikeVideoMode:'first_frame',beikeVideoAudio:false,beikeOptimizePrompt:false});
    expect(s.connections.filter(e=>e.to===video.id).map(e=>e.from)).toEqual(['template-keyframe','template-analysis']);
    expect(s.connections.filter(e=>e.to==='template-keyframe').map(e=>e.from)).toEqual(['product','person','brief','analysis','background'].map(k=>`template-${k}`));
    expect(s.connections.filter(e=>e.from==='template-source').map(e=>e.to)).toEqual(['template-analysis','template-frames']);
    expect(s.nodes.some(n=>(n.settings as Record<string,unknown>)?.beikeOperation==='compose-original')).toBe(false);
    expect(s.nodes.find(n=>n.id==='template-analysis')?.settings).toMatchObject({beikeTextImageCount:3});
    expect(s.nodes.every(n=>!n.content&&!n.imageUrl&&!n.videoUrl&&!n.beikeTaskId&&!n.beikeLastTaskId)).toBe(true);
    const other=createVideoWorkflowProject('w3-copy','other',2);
    s.nodes.find(n=>n.id==='template-source')!.content='/storage/one.mp4';
    expect(other.studioScene!.nodes.every(n=>!n.content)).toBe(true);
  });
  it('W3 生成只接收已分析脚本和图片，不提交原片，按选中片段设置时长',()=>{
    const scene=createVideoWorkflowProject('w3-copy','test',1).studioScene!;
    const video=scene.nodes.find(n=>n.id==='test-video')!;
    expect(video.settings).toMatchObject({beikeVideoWorkflow:'w3-copy',resolution:'768P',model:'MiniMax-H3'});
    expect(scene.connections.some(e=>e.from==='test-source'&&e.to==='test-video')).toBe(false);
    const analysis=scene.nodes.find(n=>n.id==='test-analysis')!;
    const frame=scene.nodes.find(n=>n.id==='test-keyframe')!;
    frame.content='/storage/keyframe.png';
    expect(()=>resolveStudioInputs(scene,video.id)).toThrow('分镜');
    analysis.settings={...analysis.settings as object,text:'原片观察报告，不应提交。\n【全片一致性】人物和服装由关键帧确定；自然日光；【声音模式：静音】。【全片一致性结束】\n【视频片段 01｜时长 8 秒】0–3秒抬手，3–8秒转身停稳。【视频片段结束】\n【视频片段 02｜时长 6 秒】0–6秒向镜头走两步。【视频片段结束】'};
    const result=resolveStudioInputs(scene,video.id);
    expect(result.refs.map(ref=>ref.type)).toEqual(['image']);
    expect(result).toMatchObject({duration:8,audio:false});
    expect(result.prompt).toContain('抬手');
    expect(result.prompt).not.toContain('不应提交');
    expect(result.prompt).not.toContain('走两步');
    video.prompt=String(video.prompt).replace('【使用片段：01】','【使用片段：02】');
    expect(resolveStudioInputs(scene,video.id)).toMatchObject({duration:6,prompt:expect.stringContaining('走两步')});
    scene.connections.push({id:'accidental-video',from:'test-source',to:video.id});
    scene.nodes.find(n=>n.id==='test-source')!.content='/storage/source.mp4';
    expect(()=>resolveStudioInputs(scene,video.id)).toThrow('不接收视频');
  });
  it('升级已交付 W3 项目但保留素材、生成结果、用户要求和布局，重复打开不再次修改',()=>{
    const id='canvas-proj-827c82ad-c7bc-4b5e-a8ef-d6c29022096d';
    const project=createVideoWorkflowProject('w3-copy',id,1),scene=project.studioScene!;
    const video=scene.nodes.find(n=>n.id===`${id}-video`)!;
    video.content='/storage/previous-result.mp4';video.x=999;
    video.settings={model:'wan3.0-video',resolution:'720P',duration:'5s'};
    scene.nodes.find(n=>n.id===`${id}-brief`)!.settings={text:'无，不要声音'};
    scene.connections.push({id:'old-video-input',from:`${id}-source`,to:video.id});
    scene.connections=scene.connections.filter(edge=>edge.to!==`${id}-analysis`).map(edge=>edge.to===`${id}-save`||edge.to===`${id}-preview`?{...edge,from:`${id}-compose`}:edge);
    const next=upgradeVideoWorkflowProject(project),updated=next.studioScene!;
    expect(updated.nodes.find(n=>n.id===video.id)).toMatchObject({content:video.content,x:999,settings:{beikeVideoWorkflow:'w3-copy',resolution:'768P'}});
    expect(updated.nodes.find(n=>n.id===`${id}-brief`)!.settings).toEqual({text:'无，不要声音'});
    expect(updated.connections.some(e=>e.from===`${id}-source`&&e.to===video.id)).toBe(false);
    expect(updated.connections.filter(e=>e.to===`${id}-save`||e.to===`${id}-preview`).every(e=>e.from===video.id)).toBe(true);
    expect(updated.connections.filter(e=>e.to===`${id}-analysis`).map(e=>e.from)).toEqual(['source','product','person','brief','background'].map(key=>`${id}-${key}`));
    expect(updated.view).toBe(scene.view);
    expect(upgradeVideoWorkflowProject(next)).toBe(next);
  });
  for(const kind of ['depth-copy','w3-copy'] as const) it(`${kind} 的素材连接和处理依赖有效`,()=>{
    const p=createVideoWorkflowProject(kind,'test',1);const s=p.studioScene!;
    const ids=new Set(s.nodes.map(n=>n.id));
    for(const edge of s.connections) expect(ids.has(edge.from)&&ids.has(edge.to)).toBe(true);
    const uploads=s.nodes.filter(n=>n.type==='input-image').map(n=>[n.id,(n.settings as {mediaType?:string}).mediaType]);
    expect(uploads).toEqual([
      ['test-source','video'],['test-product','image'],['test-person','image'],
      ...(kind==='w3-copy'?[['test-background','image']]:[]),
    ]);
    if(kind==='depth-copy')for(const stage of ['analysis','keyframe']) {
      expect(s.nodes.find(n=>n.id===`test-${stage}`)?.settings).toMatchObject({beikeStoryboardSceneSourceId:'test-source'});
    }
    expect(s.nodes.some(n=>n.type==='gen-image')).toBe(true);
    expect(s.nodes.some(n=>n.type==='gen-video')).toBe(true);
    for (const from of ['source','product','person','brief']) expect(s.connections.some(e=>e.from===`test-${from}`&&e.to==='test-analysis')).toBe(true);
    expect(s.connections.some(e=>e.from==='test-analysis'&&e.to==='test-keyframe')).toBe(true);
    const analysis=s.nodes.find(n=>n.id==='test-analysis')!;
    expect((analysis.settings as {textNodeDraftPrompt?:string}).textNodeDraftPrompt).toBe(analysis.prompt);
    expect(s.connections.some(e=>e.to==='test-save'&&e.from==='test-video')).toBe(true);
    expect(s.connections.some(e=>e.to==='test-timeline')).toBe(false);
    for(const n of s.nodes) for(const required of (n.settings as {beikeRequiredInputs?:string[]}).beikeRequiredInputs||[]) expect(ids.has(required)).toBe(true);
    expect(s.nodes.every(n=>!n.isGenerating&&!n.beikeTaskId)).toBe(true);
  });
  it('仅升级交付的旧文字项目，重复读取不恢复旧说明',()=>{
    const id='canvas-proj-4d8c2240-3ae8-4a81-bfda-bf73851516f6';
    const old=createVideoWorkflowProject('depth-copy',id,1);
    old.studioScene!.nodes=[{id:`${id}-step-0`,type:'text-node',content:'用户备注',settings:{text:'用户备注'}}];
    const next=upgradeVideoWorkflowProject(old);
    expect(next.studioScene!.nodes.map(n=>n.id)).toEqual(createVideoWorkflowProject('depth-copy',id,1).studioScene!.nodes.map(n=>n.id));
    expect(next.studioScene!.nodes.some(n=>n.id===`${id}-step-0`)).toBe(false);
    expect(upgradeVideoWorkflowProject(next)).toBe(next);
    const cleared={...old,studioScene:{...old.studioScene!,nodes:[]}};
    expect(upgradeVideoWorkflowProject(cleared)).toBe(cleared);
    expect(upgradeVideoWorkflowProject({...old,id:'other'}).studioScene).toBe(old.studioScene);
  });
  for(const [id,kind] of [
    ['canvas-proj-4d8c2240-3ae8-4a81-bfda-bf73851516f6','depth-copy'],
    ['canvas-proj-827c82ad-c7bc-4b5e-a8ef-d6c29022096d','w3-copy'],
  ] as const) it(`${kind} 清理旧说明及关联连线，保留当前流程、用户备注和布局`,()=>{
    const project=createVideoWorkflowProject(kind,id,1), scene=project.studioScene!;
    const working=[...scene.nodes];
    scene.nodes.push(...Array.from({length:8},(_,i)=>({id:`${id}-step-${i}`,type:'text-node',nodeName:'原说明'})));
    const note={id:'user-note',type:'text-node',nodeName:'原说明 · 我的备注',content:'保留'};
    scene.nodes.push(note);
    scene.connections.push({id:'old-edge',from:`${id}-step-0`,to:`${id}-analysis`});
    const next=upgradeVideoWorkflowProject(project);
    expect(next.studioScene!.nodes).toEqual([...working,note]);
    expect(next.studioScene!.connections.some(e=>e.id==='old-edge')).toBe(false);
    expect(next.studioScene!.connections).toHaveLength(scene.connections.length-1);
    expect(next.studioScene!.view).toBe(scene.view);
    expect(upgradeVideoWorkflowProject(next)).toBe(next);
  });
});

it('旧深度复刻项目改用遮脸分镜，保留已上传背景、生成结果和自定义要求',()=>{
 const project=buildVideoWorkflowProject('depth-copy','existing',1),scene=project.studioScene!;
 const background=scene.nodes.find(n=>n.id==='existing-background')!;
 background.content='/storage/old-background.png';
 const frame=scene.nodes.find(n=>n.id==='existing-keyframe')!;
 frame.prompt='保留红色鞋子';frame.content='/storage/retained.png';
 const upgraded=upgradeVideoWorkflowProject(project),next=upgraded.studioScene!;
 expect(next.nodes.find(n=>n.id===background.id)).toMatchObject({content:background.content});
 expect(next.nodes.find(n=>n.id===frame.id)).toMatchObject({content:frame.content,prompt:expect.stringContaining('保留红色鞋子')});
 expect(next.nodes.find(n=>n.id===frame.id)?.settings).toMatchObject({beikeStoryboardSceneSourceId:'existing-source'});
 expect(next.connections.some(e=>e.from===background.id)).toBe(false);
 expect(upgradeVideoWorkflowProject(upgraded)).toBe(upgraded);
});

it('uses original references without additional image generation and keeps free original materials available to official video compilation',()=>{
 const project=buildVideoWorkflowProject('depth-copy','prep',1),scene=project.studioScene!;
 const preparations=scene.nodes.filter(n=>compilerSettings(n).beikeReferencePreparationRole);
 expect(preparations).toHaveLength(0);
 expect(scene.connections.filter(e=>e.to==='prep-keyframe'&&e.from.includes('-reference-'))).toHaveLength(0);
 expect(scene.connections.filter(e=>e.to==='prep-prompt').map(e=>e.from).sort()).toEqual(['prep-analysis','prep-background','prep-keyframe','prep-person','prep-product']);
 expect(scene.nodes.find(n=>n.id==='prep-person')).toBeDefined();
 expect(upgradeVideoReferencePreparation(project)).toBe(project);
});
it('upgrades an existing canvas without losing user instructions, media or completed versions',()=>{
 const project=buildVideoWorkflowProject('depth-copy','saved-prep',1),scene=project.studioScene!;
 const frame=scene.nodes.find(n=>n.id==='saved-prep-keyframe')!;
 frame.content='/storage/retained.png';frame.beikePromptOptimization={submitted:'原稿'};
 const compiler=scene.nodes.find(n=>n.id==='saved-prep-prompt')!;
 compiler.settings={...compilerSettings(compiler),text:'已保存确认稿'};
 const updated=restoreVideoWorkflowPrompts(project);
 expect(updated.studioScene!.nodes.find(n=>n.id===frame.id)).toMatchObject({content:'/storage/retained.png',beikePromptOptimization:{submitted:'原稿'}});
 expect(updated.studioScene!.nodes.find(n=>n.id===compiler.id)?.settings).toMatchObject({text:'已保存确认稿'});
});
it('keeps identity preparation separate from product and action instructions',()=>{
 const script='【全片一致性】同一人物【全片一致性结束】\n【身份参考要求】黑发刘海【身份参考要求结束】\n【服装参考要求】灰色开衫【服装参考要求结束】\n【本地时间轴】0-15秒下蹲';
 const result=omniCopyPreparationInputs([script],'只提取身份','identity');
 expect(result.prompt).toContain('黑发刘海');
 expect(result.prompt).not.toContain('灰色开衫');expect(result.prompt).not.toContain('下蹲');
});

it('reuses completed legacy references without deleting their media or requesting new preparation',()=>{
 const project=buildVideoWorkflowProject('depth-copy','legacy',1),scene=project.studioScene!;
 const frame=scene.nodes.find(n=>n.id==='legacy-keyframe')!;
 frame.settings={...compilerSettings(frame),beikeReferencePreparationVersion:1};
 scene.nodes.push({id:'legacy-reference-scene',type:'gen-image',content:'/approved-scene.jpg',settings:{beikeReferencePreparationRole:'scene',beikeSceneFrameUrl:'/selected.jpg'}});
 const result=upgradeVideoReferencePreparation(project).studioScene!;
 expect(result.nodes.find(n=>n.id==='legacy-reference-scene')?.content).toBe('/approved-scene.jpg');
 expect(compilerSettings(result.nodes.find(n=>n.id===frame.id)!)).toMatchObject({beikeReferenceInputIds:['legacy-product','legacy-person','legacy-reference-scene']});
 expect(result.connections.some(e=>e.from==='legacy-reference-scene'&&e.to===frame.id)).toBe(true);
});

it('uses the selected source scene in 06 and official 07 without submitting a conflicting background',()=>{
 const scene=buildVideoWorkflowProject('depth-copy','selected',1).studioScene!;
 for(const suffix of ['product','person','background','keyframe'])scene.nodes.find(n=>n.id==='selected-'+suffix)!.content='/'+suffix+'.jpg';
 const frame=scene.nodes.find(n=>n.id==='selected-keyframe')!;
 frame.settings={...compilerSettings(frame),beikeSceneFrameUrl:'/chosen-masked-frame.jpg'};
 const analysis=scene.nodes.find(n=>n.id==='selected-analysis')!;
 analysis.settings={...compilerSettings(analysis),text:'【全片一致性】目标人物【声音模式：静音】【全片一致性结束】\n【参考图制作要求】站立【参考图制作要求结束】\n【视频片段 01｜时长 15 秒】\n开场画面：站立\n本地时间轴：0至15秒转身\n结束状态：停稳\n【视频片段结束】'};
 for(const target of ['selected-keyframe','selected-prompt']) {
  const refs=resolveStudioInputs(scene,target).refs;
  expect(refs.find(ref=>ref.nodeId==='selected-background')?.url).toBe('/chosen-masked-frame.jpg');
  expect(refs.some(ref=>ref.url==='/background.jpg')).toBe(false);
 }
});

const script='【全片一致性】目标人物和目标服装；【声音模式：静音】【全片一致性结束】\n【参考图制作要求】0秒窗边、桌面有书。【参考图制作要求结束】\n【视频片段 01｜时长 15 秒】\n开场画面：窗边翻书\n本地时间轴：0至15秒翻书\n结束状态：合上书\n【视频片段结束】';

it('uses source sheets for 06 and 08 without a background upload, and keeps image roles after 07 confirmation',()=>{
 const scene=createVideoWorkflowProject('depth-copy','copy',1).studioScene!;
 const node=(key:string)=>scene.nodes.find(n=>n.id==='copy-'+key)!;
 for(const key of ['source','person','product','keyframe'])node(key).content='/storage/'+key+(key==='source'?'.mp4':'.jpg');
 node('analysis').settings={...compilerSettings(node('analysis')),textNodeDisplayText:script};
 expect(node('background')).toBeUndefined();
 expect(()=>resolveStudioInputs(scene,node('analysis').id)).toThrow('遮脸分镜图');
 expect(()=>resolveStudioInputs(scene,node('keyframe').id)).toThrow('遮脸分镜图');
 const source=node('source'),first=studioStoryboardNode(source,'/storage/page1.jpg',16,'page-1');
 const second=studioStoryboardNode(source,'/storage/page2.jpg',14,'page-2',1);
 first.settings={...compilerSettings(first),beikeStoryboardSourceKey:source.content};
 scene.nodes.push(first,second,{...first,id:'unmasked',settings:{...compilerSettings(first),beikeStoryboardFacesMasked:false}});
 scene.connections=wireStudioStoryboards(scene).connections;
 const analysis=resolveStudioInputs(scene,node('analysis').id);
 expect(analysis.refs.map(ref=>ref.nodeId)).toEqual(['copy-source','copy-product','copy-person','page-1','page-2']);
 const analysisNode=node('analysis');
 const originalAnalysisSettings=analysisNode.settings;
 analysisNode.settings={...compilerSettings(analysisNode),inputItemOrder:['/storage/person.jpg'],textNodeDraftPrompt:'观察 @["canvas-node:copy-person","图片3"] 中的目标人物'};
 const orderedAnalysis=resolveStudioInputs(scene,analysisNode.id);
 expect(orderedAnalysis.refs.map(ref=>ref.nodeId)).toEqual(['copy-person','copy-source','copy-product','page-1','page-2']);
 expect(orderedAnalysis.prompt).toContain('观察 @图片1 中的目标人物');
 analysisNode.settings=originalAnalysisSettings;

 const loaded=[analysis.refs[2],analysis.refs[0],analysis.refs[1],analysis.refs[4],analysis.refs[3]];
 const analysisBlock=studioStoryboardAnalysisBlock(scene,node('analysis').id,analysis.refs,loaded);
 expect(analysisBlock).toContain('@图片1：目标人物身份和脸');
 expect(analysisBlock).toContain('@视频2：原片视频');
 expect(analysisBlock).toContain('@图片4：原片遮脸分镜第2页');
 expect(()=>studioStoryboardAnalysisBlock(scene,node('analysis').id,analysis.refs,[...loaded.slice(0,4),loaded[3]])).toThrow('本次未发送');
 const image=resolveStudioInputs(scene,node('keyframe').id);
 expect(image.refs.map(ref=>ref.nodeId)).toEqual(['copy-product','copy-person','page-1','page-2']);
 expect(image.prompt).toContain('@图片2：目标人物身份和脸');
 expect(image.prompt).toContain('@图片3：原片遮脸分镜第1页');
 expect(image.prompt).toContain('只取05指定的开场时间码对应格');
 expect(image.prompt).toContain('@文本2：05 分镜分析');
 assertStudioReferenceNumbers(image.prompt,image.refs.filter((ref):ref is typeof ref & {type:'image'|'video'}=>ref.type!=='audio'));
 assertStudioTextReferences(image.prompt);
 node('keyframe').settings={...compilerSettings(node('keyframe')),inputImageOrder:['/storage/page2.jpg','/storage/person.jpg']};
 const reordered=resolveStudioInputs(scene,node('keyframe').id);
 const editorRoles=studioStoryboardRoles(scene,node('keyframe').id,reordered.refs.map((ref,index)=>({nodeId:ref.nodeId,mediaType:ref.type,position1Based:index+1})));
 expect(editorRoles.slice(0,2).map(({nodeId,token})=>[nodeId,token])).toEqual([['page-2','@图片1'],['copy-person','@图片2']]);
 for(const {token,role} of editorRoles)expect(reordered.prompt).toContain(`${token}：${role}`);
 const compiler=node('prompt'),inputs=resolveStudioInputs(scene,compiler.id);
 compiler.settings={...compilerSettings(compiler),text:'已确认稿',beikeCompilerApproved:'已确认稿',beikeCompilerInputKey:studioCompilerKey(compiler,inputs)};
 const video=resolveStudioInputs(scene,node('video').id);
 expect(video.refs).toEqual(inputs.refs);
 expect(video.refs.map(ref=>ref.nodeId)).toEqual(['copy-keyframe','copy-product','copy-person','page-1','page-2']);
 expect(video.prompt).toContain('场景、道具与接触关系、光线和切点');
 expect(video.prompt).toContain('不采用原人物身份');
 const preview=()=>studioVideoPromptPreview(scene,node('video').id)!;
 expect(preview()).toMatchObject({ready:true,prompt:video.prompt});
 compiler.settings={...compilerSettings(compiler),text:'更新稿：使用 @图片2 展示商品',inputImageOrder:['/storage/person.jpg','/storage/product.jpg']};
 expect(preview().ready).toBe(false);
 expect(preview().prompt).toContain('更新稿：使用 @图片2 展示商品');
 expect(preview().prompt).toContain('@图片1：仅提供人物');
 compiler.settings={...compilerSettings(compiler),inputImageOrder:['/storage/product.jpg','/storage/person.jpg']};
 expect(preview().prompt).toContain('更新稿：使用 @图片1 展示商品');
 expect(()=>resolveStudioInputs(scene,node('video').id)).toThrow('上游已修改');
 node('product').content='/storage/new-product.jpg';
 expect(preview().ready).toBe(false);
 expect(preview().prompt).toContain('@图片1：仅提供人物');
 expect(preview().prompt).toContain('更新稿：使用 @图片3 展示商品');
 source.content='/storage/replaced.mp4';
 expect(()=>resolveStudioInputs(scene,node('video').id)).toThrow('原视频已更换');
});

it('keeps old backgrounds and outputs as records, but invalidates old analysis and disconnects background inputs',()=>{
 const old=buildVideoWorkflowProject('depth-copy','old',1);
 const node=(key:string)=>old.studioScene!.nodes.find(n=>n.id==='old-'+key)!;
 node('background').content='/storage/old-background.jpg';
 node('keyframe').content='/storage/old-result.jpg';
 node('keyframe').settings={...compilerSettings(node('keyframe')),beikeSceneFrameUrl:'/storage/old-scene-frame.jpg'};
 node('analysis').settings={...compilerSettings(node('analysis')),textNodeDisplayText:script,_chatCompletedAt:100};
 const next=upgradeVideoWorkflowProject(old),scene=next.studioScene!;
 expect(scene.nodes.find(n=>n.id==='old-background')?.content).toBe('/storage/old-background.jpg');
 expect(scene.nodes.find(n=>n.id==='old-keyframe')?.content).toBe('/storage/old-result.jpg');
 expect(scene.connections.some(e=>e.from==='old-background')).toBe(false);
 expect(Number(compilerSettings(scene.nodes.find(n=>n.id==='old-analysis')!).beikeSourceVideoChangedAt)).toBeGreaterThan(100);
 expect(upgradeVideoWorkflowProject(next)).toBe(next);
});

it('updates the full workflow and keeps its direct preview usable without optional composition',()=>{
 const project=createVideoWorkflowProject('depth-copy','latest',1),scene=project.studioScene!;
 expect(scene.nodes.find(n=>n.id==='latest-timeline')).toBeUndefined();
 expect(scene.nodes.find(n=>n.id==='latest-compose')?.nodeName).toContain('可选');
 expect(compilerSettings(scene.nodes.find(n=>n.id==='latest-prompt')!)).toMatchObject({model:'doubao-seedance-2.0-mini',resolution:'480P',duration:'15s'});
 for(const to of ['preview','save'])expect(scene.connections.some(e=>e.from==='latest-video'&&e.to==='latest-'+to)).toBe(true);
 expect(upgradeVideoWorkflowProject(project)).toBe(project);
});
it('preserves custom titles, media, selected settings, and existing composed outputs',()=>{
 const project=createVideoWorkflowProject('depth-copy','saved',1),scene=project.studioScene!;
 const video=scene.nodes.find(n=>n.id==='saved-video')!,frame=scene.nodes.find(n=>n.id==='saved-keyframe')!,compose=scene.nodes.find(n=>n.id==='saved-compose')!;
 video.settings={...compilerSettings(video),beikeWorkflowNodesVersion:undefined,model:'selected-model',duration:'10s'};
 frame.nodeName='我的定制外观参考';frame.content='/saved-image.jpg';compose.content='/saved-composed.webm';
 scene.connections=scene.connections.map(e=>e.to==='saved-preview'?{...e,from:compose.id}:e);
 const next=upgradeVideoWorkflowNodes(project).studioScene!;
 expect(next.nodes.find(n=>n.id===frame.id)).toMatchObject({nodeName:'我的定制外观参考',content:'/saved-image.jpg'});
 expect(compilerSettings(next.nodes.find(n=>n.id===video.id)!)).toMatchObject({model:'selected-model',duration:'10s'});
 expect(next.connections.some(e=>e.from===compose.id&&e.to==='saved-preview')).toBe(true);
});

it('removes obsolete prep cards and reconnects originals while preserving the paid scene reference',()=>{
 const p=buildVideoWorkflowProject('depth-copy','prune',1),scene=p.studioScene!;
 for(const role of ['identity','product','scene']){
  const id='prune-reference-'+role;
  scene.nodes.push({id,type:'gen-image',content:'/'+role+'.jpg',settings:{beikeReferencePreparationRole:role}});
  scene.connections.push({id,from:id,to:'prune-keyframe'});
 }
 const next=restoreVideoWorkflowPrompts(p),s=next.studioScene!,frame=s.nodes.find(n=>n.id==='prune-keyframe')!;
 expect(s.nodes.some(n=>n.id.startsWith('prune-reference-'))).toBe(false);
 expect(s.connections.some(e=>e.from.startsWith('prune-reference-'))).toBe(false);
 expect(compilerSettings(frame)).toMatchObject({beikeReferenceInputIds:['prune-product','prune-person','prune-background'],beikeSceneFrameUrl:'/scene.jpg'});
 expect(compilerSettings(frame).beikeRetiredReferenceNodes).toHaveLength(3);
 for(const key of ['product','person','background'])expect(s.connections.some(e=>e.from==='prune-'+key&&e.to===frame.id)).toBe(true);
 expect(restoreVideoWorkflowPrompts(next)).toBe(next);
});
it('retains a populated timeline and references still used outside the integrated image',()=>{
 const p=buildVideoWorkflowProject('depth-copy','keep',1),s=p.studioScene!;
 s.nodes.push({id:'keep-timeline',type:'video-timeline',settings:{videoTimelineClips:[{id:'clip'}]}},{id:'keep-reference-scene',type:'gen-image',content:'/scene.jpg',settings:{beikeReferencePreparationRole:'scene'}});
 s.connections.push({id:'custom',from:'keep-reference-scene',to:'keep-preview'});
 const next=restoreVideoWorkflowPrompts(p).studioScene!;
 expect(next.nodes.some(n=>n.id==='keep-timeline')).toBe(true);
 expect(next.nodes.some(n=>n.id==='keep-reference-scene')).toBe(true);
});

it('binds analysis roles to actual connections when the scene precedes product and person',()=>{
 const p=buildVideoWorkflowProject('depth-copy','roles',1),scene=p.studioScene!;
 const analysis=scene.nodes.find(n=>n.id==='roles-analysis')!;
 const edges=scene.connections.filter(e=>e.to===analysis.id);
 scene.connections=[...scene.connections.filter(e=>e.to!==analysis.id),...['source','background','product','person','brief'].map(role=>edges.find(e=>e.from===`roles-${role}`)!)];
 const next=restoreVideoWorkflowPrompts(p),prompt=next.studioScene!.nodes.find(n=>n.id===analysis.id)!.prompt;
 expect(prompt).toContain('@视频1 原片，@图片3 商品 / 服装，@图片4 目标人物，@图片2 场景');
 expect(restoreVideoWorkflowPrompts(next)).toBe(next);
});

it('binds template references to the reference strip order without changing user media ordering',()=>{
 const p=buildVideoWorkflowProject('depth-copy','order',1),scene=p.studioScene!;
 for(const role of ['source','product','person','background'])scene.nodes.find(n=>n.id===`order-${role}`)!.content=`/storage/${role}.png`;
 const analysis=scene.nodes.find(n=>n.id==='order-analysis')!;
 analysis.settings={...analysis.settings as object,inputItemOrder:['/storage/source.png','/storage/background.png','/storage/person.png','/storage/product.png']};
 const next=restoreVideoWorkflowPrompts(p).studioScene!.nodes.find(n=>n.id===analysis.id)!;
 expect(next.prompt).toContain('@视频1 原片，@图片4 商品 / 服装，@图片3 目标人物，@图片2 场景');
 expect(next.settings).toMatchObject({inputItemOrder:(analysis.settings as Record<string,unknown>).inputItemOrder,textNodeDraftPrompt:next.prompt});
});

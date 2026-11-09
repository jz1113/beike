import { expect, it, vi } from 'vitest';
import { createDepthCopyRunner, omniCopyReferenceInputs, omniCopyVideoInputs } from './depthCopyRunner';
import { inheritStudioCompiler, studioCompilerKey } from './studioCompilerState';
import { resolveStudioInputs } from './studioConnections';
import { studioStoryboardNode, wireStudioStoryboards } from './studioStoryboard';
import type { StudioTaskCommands } from './studioTaskState';
import { buildVideoWorkflowProject, createVideoWorkflowProject } from './videoWorkflowProjects';

function fixture(){
 const scene=createVideoWorkflowProject('depth-copy','copy',1).studioScene!;
 const node=(key:string)=>scene.nodes.find(n=>n.id==='copy-'+key)!;
 for(const key of ['source','product','person'])node(key).content='/storage/'+key+(key==='source'?'.mp4':'.png');
 scene.nodes.push(studioStoryboardNode(node('source'),'/storage/masked.jpg',16,'copy-sheet'));
 scene.connections=wireStudioStoryboards(scene).connections;
 node('video').settings={...node('video').settings as object,model:'my-video-model',duration:'10s',beikeVideoMode:'omni'};
 node('prompt').settings={...node('prompt').settings as object,model:'my-video-model',duration:'10s'};
 const events:string[]=[];
 const commands:StudioTaskCommands={read:()=>scene,update:vi.fn(),stop:vi.fn(),
 runCompiler:vi.fn(async id=>{events.push(id);const n=node('prompt'),inputs=resolveStudioInputs(scene,id);n.settings={...n.settings as object,text:'最终稿',beikeCompilerApproved:'最终稿',beikeCompilerInputKey:studioCompilerKey(n,inputs)};return true;}),
 runText:vi.fn(async()=>{events.push('analysis');node('analysis').settings={...node('analysis').settings as object,text:'【全片一致性】目标人物【声音模式：保留原声】【全片一致性结束】【参考图制作要求】自然站立【参考图制作要求结束】【视频片段 01｜时长 10 秒】\n开场画面：站立\n本地时间轴：0至10秒转身\n结束状态：停稳\n【视频片段结束】',_chatCompletedAt:1};}),
 run:vi.fn(async id=>{events.push(id);Object.assign(scene.nodes.find(n=>n.id===id)!,{content:'/storage/'+id+'.mp4',beikeLastTaskId:'new-'+id+'-'+events.length});return true;})};
 const save=vi.fn(async()=>{}),runner=createDepthCopyRunner({commands:()=>commands,save,stopTask:vi.fn()});
 return {scene,node,commands,runner,events,save};
}
it('prepares in order and stops after saving 07 without submitting a video',async()=>{
 const f=fixture(),edges=JSON.stringify(f.scene.connections);await f.runner.run(()=>{});
 expect(f.events).toEqual(['analysis','copy-keyframe','copy-prompt']);
 expect(f.node('video').settings).toMatchObject({model:'my-video-model',duration:'10s',beikeVideoMode:'omni'});
 expect(f.node('source').content).toBe('/storage/source.mp4');expect(JSON.stringify(f.scene.connections)).toBe(edges);
 expect(f.save).toHaveBeenCalledTimes(4);
});
it('stops on missing input, failed output or an altered model before submitting further stages',async()=>{
 const missing=fixture();missing.node('person').content='';await expect(missing.runner.run(()=>{})).rejects.toThrow('添加素材');expect(missing.commands.runText).not.toHaveBeenCalled();
 const failed=fixture();vi.mocked(failed.commands.run).mockResolvedValue(false);await expect(failed.runner.run(()=>{})).rejects.toThrow('未完成');expect(failed.commands.run).toHaveBeenCalledTimes(1);
 const changed=fixture();vi.mocked(changed.commands.runText!).mockImplementation(async()=>{Object.assign(changed.node('video').settings as object,{model:'new-choice'});});await expect(changed.runner.run(()=>{})).rejects.toThrow('已修改');expect(changed.commands.run).not.toHaveBeenCalled();
});

it('does not overwrite model sound or silent output with the original soundtrack',async()=>{
 for(const mode of ['静音','生成声音']) {
  const f=fixture();
  const original=f.commands.runText!;
  f.commands.runText=async(id,signal)=>{await original(id,signal);const n=f.node('analysis');n.settings={...n.settings as object,text:String((n.settings as Record<string,unknown>).text).replace('声音模式：保留原声',`声音模式：${mode}`)};};
  await f.runner.run(()=>{});
  expect(f.events).toEqual(['analysis','copy-keyframe','copy-prompt']);
  expect(f.events).not.toContain('copy-video');expect(f.events).not.toContain('copy-compose');
 }
});

it('runs the three-node flow after optional processing nodes are removed',async()=>{
 const f=fixture();f.scene.nodes=f.scene.nodes.filter(n=>!['copy-depth','copy-compose'].includes(n.id));
 f.scene.connections=f.scene.connections.filter(e=>!['copy-depth','copy-compose'].includes(e.from)&&!['copy-depth','copy-compose'].includes(e.to));
 await f.runner.run(()=>{});
 expect(f.events).toEqual(['analysis','copy-keyframe','copy-prompt']);
});

it('accepts model and segment choices confirmed inside 07 without repeating completed analysis or images',async()=>{
 const f=fixture(),analyze=f.commands.runText!,compile=f.commands.runCompiler!;
 f.commands.runText=async(id,signal)=>{await analyze(id,signal);const n=f.node('analysis');n.settings={...n.settings as object,text:String((n.settings as Record<string,unknown>).text)+'\n【视频片段 02｜时长 5 秒】\n开场画面：坐下\n本地时间轴：0至5秒抬手\n结束状态：停稳\n【视频片段结束】'};};
 f.commands.runCompiler=async id=>{const n=f.node('prompt');n.settings={...n.settings as object,model:'confirmed-model',duration:'5s'};n.prompt=String(n.prompt).replace('【使用片段：01】','【使用片段：02】');return compile(id);};
 const run=f.commands.run;f.commands.run=async id=>{if(id==='copy-video')Object.assign(f.node('video'),inheritStudioCompiler(f.node('video'),f.scene));return run(id);};
 await f.runner.run(()=>{});
 expect(f.events).toEqual(['analysis','copy-keyframe','copy-prompt']);
 expect(resolveStudioInputs(f.scene,'copy-video')).toMatchObject({duration:5,prompt:expect.stringContaining('最终稿')});
});
it('stops if upstream media changes while 07 is open and releases the runner for a later retry',async()=>{
 const f=fixture(),compile=f.commands.runCompiler!;
 f.commands.runCompiler=async id=>{f.node('keyframe').content='/storage/replaced.png';return compile(id);};
 await expect(f.runner.run(()=>{})).rejects.toThrow('已修改');
 expect(f.events).not.toContain('copy-video');
 f.commands.runCompiler=compile;
 await f.runner.run(()=>{});
 expect(f.events.filter(id=>id==='copy-video')).toHaveLength(0);expect(f.events.filter(id=>id==='copy-prompt')).toHaveLength(2);
});
it('shows the underlying 07 error when optimization fails before confirmation',async()=>{
 const f=fixture();
 f.commands.runCompiler=async()=>{f.node('prompt').errorMsg='所选优化模型已不可用，请重新选择';return false;};
 await expect(f.runner.run(()=>{})).rejects.toThrow('所选优化模型已不可用');
 expect(f.commands.run).toHaveBeenCalledTimes(1);
});
it('honors an explicit silent compiler choice without composing the original soundtrack',async()=>{
 const f=fixture();f.node('prompt').settings={...f.node('prompt').settings as object,beikeVideoAudio:false};
 await f.runner.run(()=>{});
 expect(f.events).toEqual(['analysis','copy-keyframe','copy-prompt']);
 expect(resolveStudioInputs(f.scene,'copy-video')).toMatchObject({audio:false,soundMode:'静音'});
 expect(f.node('source').content).toBe('/storage/source.mp4');
});

it.each(['confirmation','save'])('accepts the confirmed 07 configuration when 08 inherits it during %s',async phase=>{
 const f=fixture(),analyze=f.commands.runText!,compile=f.commands.runCompiler!,report=vi.fn();
 f.commands.runText=async(id,signal)=>{await analyze(id,signal);const n=f.node('analysis');n.settings={...n.settings as object,text:String((n.settings as Record<string,unknown>).text)+'\n【视频片段 02｜时长 5 秒】\n开场画面：坐下\n本地时间轴：0至5秒抬手\n结束状态：停稳\n【视频片段结束】'};};
 f.commands.runCompiler=async id=>{
  const n=f.node('prompt');n.settings={...n.settings as object,model:'confirmed-model',duration:'5s',ratio:'16:9',resolution:'1080P',beikeVideoMode:'omni',beikeVideoAudio:false};
  n.prompt=String(n.prompt).replace('【使用片段：01】','【使用片段：02】');
  const approved=await compile(id);
  if(phase==='confirmation')Object.assign(f.node('video'),inheritStudioCompiler(f.node('video'),f.scene));
  return approved;
 };
 if(phase==='save')f.save.mockImplementation(async()=>{
  if((f.node('prompt').settings as Record<string,unknown>).beikeCompilerApproved)Object.assign(f.node('video'),inheritStudioCompiler(f.node('video'),f.scene));
 });
 f.node('video').content='/storage/existing-result.mp4';
 await f.runner.run(report);
 expect(f.events).toEqual(['analysis','copy-keyframe','copy-prompt']);
 expect(report).toHaveBeenLastCalledWith('ready');
 expect(f.commands.run).toHaveBeenCalledTimes(1);
 expect(f.commands.run).toHaveBeenCalledWith('copy-keyframe',expect.any(AbortSignal));
 expect(f.node('video').settings).toMatchObject({model:'confirmed-model',duration:'5s',ratio:'16:9',resolution:'1080P',beikeVideoMode:'omni',beikeVideoAudio:false});
 expect(resolveStudioInputs(f.scene,'copy-video')).toMatchObject({prompt:expect.stringContaining('最终稿'),duration:5,audio:false});
 expect(f.node('video').content).toBe('/storage/existing-result.mp4');
 expect(f.node('source').content).toBe('/storage/source.mp4');
});

it.each(['reference','analysis','connection'])('still rejects a changed upstream %s during confirmation even if 08 inherits 07',async kind=>{
 const f=fixture(),compile=f.commands.runCompiler!,report=vi.fn();
 f.commands.runCompiler=async id=>{
  const approved=await compile(id);
  Object.assign(f.node('video'),inheritStudioCompiler(f.node('video'),f.scene));
  if(kind==='reference')f.node('keyframe').content='/storage/changed-reference.png';
  if(kind==='analysis')f.node('analysis').settings={...f.node('analysis').settings as object,text:'changed storyboard'};
  if(kind==='connection')f.scene.connections=f.scene.connections.filter(edge=>edge.to!=='copy-compose');
  return approved;
 };
 await expect(f.runner.run(report)).rejects.toThrow('已修改');
 expect(report).not.toHaveBeenCalledWith('ready');
 expect(f.events).not.toContain('copy-video');
});

it.each(['ratio','beikeVideoAudio','inputItemOrder'])('does not accept a changed 07 %s while the confirmed scene is saving',async field=>{
 const f=fixture(),report=vi.fn();
 f.save.mockImplementation(async()=>{
  const n=f.node('prompt'),settings=n.settings as Record<string,unknown>;
  if(settings.beikeCompilerApproved)n.settings={...settings,[field]:field==='ratio'?'16:9':field==='beikeVideoAudio'?false:['/storage/background.png','/storage/keyframe.png']};
 });
 await expect(f.runner.run(report)).rejects.toThrow('已修改');
 expect(report).not.toHaveBeenCalledWith('ready');
 expect(f.events).not.toContain('copy-video');
});

it('keeps the saved video and source intact when confirmation is canceled or its final save fails',async()=>{
 for(const mode of ['canceled','save-failed']) {
  const f=fixture(),report=vi.fn();f.node('video').content='/storage/existing-result.mp4';
  if(mode==='canceled')f.commands.runCompiler=vi.fn(async()=>false);
  else f.save.mockImplementation(async()=>{if((f.node('prompt').settings as Record<string,unknown>).beikeCompilerApproved)throw new Error('保存失败');});
  await expect(f.runner.run(report)).rejects.toThrow(mode==='canceled'?'未确认':'保存失败');
  expect(report).not.toHaveBeenCalledWith('ready');
  expect(f.events).not.toContain('copy-video');expect(f.events).not.toContain('copy-compose');
  expect(f.node('video').content).toBe('/storage/existing-result.mp4');
  expect(f.node('source').content).toBe('/storage/source.mp4');
 }
});

it.each(['text','beikeCompilerApproved','beikeCompilerInputKey'])('refuses a changed saved 07 %s instead of reporting that 08 is ready',async field=>{
 const f=fixture(),report=vi.fn();
 f.save.mockImplementation(async()=>{
  const n=f.node('prompt'),settings=n.settings as Record<string,unknown>;
  if(settings.beikeCompilerApproved)n.settings={...settings,[field]:'changed after approval'};
 });
 await expect(f.runner.run(report)).rejects.toThrow('已修改');
 expect(report).not.toHaveBeenCalledWith('ready');expect(f.events).not.toContain('copy-video');
});

it('allows canvas layout changes while 07 is confirmed without invalidating generation inputs',async()=>{
 const f=fixture(),compile=f.commands.runCompiler!,report=vi.fn();
 f.commands.runCompiler=async id=>{
  const approved=await compile(id);
  const promptNode=f.node('prompt') as typeof f.scene.nodes[number] & { x?: number; y?: number };
  const videoNode=f.node('video') as typeof f.scene.nodes[number] & { x?: number; y?: number };
  promptNode.x=(promptNode.x||0)+100;videoNode.y=(videoNode.y||0)+80;
  Object.assign(f.node('video'),inheritStudioCompiler(f.node('video'),f.scene));
  return approved;
 };
 await f.runner.run(report);
 expect(report).toHaveBeenLastCalledWith('ready');expect(f.events).toEqual(['analysis','copy-keyframe','copy-prompt']);
});

it('blocks duplicate preparation and releases the workflow after cancellation during 07 confirmation',async()=>{
 const f=fixture(),compile=f.commands.runCompiler!,report=vi.fn();
 let confirm!:(value:boolean)=>void,opened!:()=>void;
 const opening=new Promise<void>(resolve=>{opened=resolve;});
 f.commands.runCompiler=async()=>{opened();return new Promise<boolean>(resolve=>{confirm=resolve;});};
 const running=f.runner.run(report);await opening;
 await expect(f.runner.run(()=>{})).rejects.toThrow('已在运行');
 f.runner.cancel();confirm(true);
 await expect(running).rejects.toMatchObject({name:'AbortError'});
 expect(report).not.toHaveBeenCalledWith('ready');expect(f.events).not.toContain('copy-video');
 f.commands.runCompiler=compile;await f.runner.run(report);
 expect(report).toHaveBeenLastCalledWith('ready');expect(f.events).not.toContain('copy-video');
});

it('rejects a truncated analysis before submitting any paid reference image',async()=>{
 const f=fixture();
 f.commands.runText=async()=>{f.node('analysis').settings={...f.node('analysis').settings as object,text:'【全片一致性】目标【声音模式：静音】【全片一致性结束】【视频片段 01｜时长 15 秒】\n开场画面：站立\n本地时间轴：0–10秒：转身'};};
 await expect(f.runner.run(()=>{})).rejects.toThrow('缺失');
 expect(f.commands.run).not.toHaveBeenCalled();
});

const script=(mode='保留原声')=>`【原片观察】原片红衣【原片风格分析】原片观察报告
【全片一致性】目标蓝衣【风格执行要求】柔和侧光【声音模式：${mode}】【全片一致性结束】
【参考图制作要求】中性展示【参考图制作要求结束】
【视频片段 01｜时长 5 秒】
源片范围：0至5秒
开场画面：站立
本地时间轴：0至5秒抬手
结束状态：停稳
声音：后期回贴
【视频片段结束】
【视频片段 02｜时长 8 秒】
开场画面：坐下
本地时间轴：0至8秒转身
结束状态：坐稳
【视频片段结束】`;

it('only sends the selected executable segment, appearance and style to video',()=>{
 const result=omniCopyVideoInputs([script()],'【使用片段：02】图片仅作外观参考');
 expect(result).toMatchObject({duration:8,audio:false,soundMode:'保留原声'});
 for(const value of ['坐下','转身','目标蓝衣','柔和侧光','图片仅作外观参考','全程静音'])expect(result.prompt).toContain(value);
 for(const value of ['原片红衣','原片观察报告','中性展示','抬手','源片范围','后期回贴','使用片段'])expect(result.prompt).not.toContain(value);
});
it('only passes appearance and static reference requirements to image generation',()=>{
 const result=omniCopyReferenceInputs([script(),'保留商品蓝色'],'生成参考图');
 for(const value of ['中性展示','柔和侧光','保留商品蓝色'])expect(result.prompt).toContain(value);
 for(const value of ['原片红衣','抬手','坐下','本地时间轴'])expect(result.prompt).not.toContain(value);
});
it('maps all three sound modes explicitly and fails closed on malformed selections',()=>{
 for(const mode of ['静音','保留原声','生成声音'])expect(omniCopyVideoInputs([script(mode)],'【使用片段：01】').audio).toBe(mode==='生成声音');
 for(const prompt of ['', '【使用片段：03】','【使用片段：01】【使用片段：02】'])expect(()=>omniCopyVideoInputs([script()],prompt)).toThrow();
 for(const value of [script().replace('本地时间轴：0至5秒','本地时间轴：1至5秒'),script().replace('本地时间轴：0至5秒','本地时间轴：0至4秒'),script().replace('【声音模式：保留原声】',''),script().replace('结束状态：停稳','缺少收势'),script()+script()])expect(()=>omniCopyVideoInputs([value],'【使用片段：01】')).toThrow();
});
it('enforces the same filtering and image-only input at the real graph boundary',()=>{
 const s=buildVideoWorkflowProject('depth-copy','omni',1).studioScene!;
 s.nodes.find(n=>n.id==='omni-prompt')!.settings={...s.nodes.find(n=>n.id==='omni-prompt')!.settings as object,duration:'5s'};
 for(const key of ['product','person','background','keyframe'])s.nodes.find(n=>n.id===`omni-${key}`)!.content='/storage/'+key+'.png';
 s.nodes.find(n=>n.id==='omni-prompt')!.settings={...s.nodes.find(n=>n.id==='omni-prompt')!.settings as object,duration:'5s'};
 const analysis=s.nodes.find(n=>n.id==='omni-analysis')!;
 analysis.settings={...analysis.settings as object,textNodeDisplayText:script()};
 const video=resolveStudioInputs(s,'omni-prompt'),image=resolveStudioInputs(s,'omni-keyframe');
 expect(video).toMatchObject({duration:5,audio:false});expect(video.refs.map(r=>r.type)).toEqual(['image','image','image','image']);
 expect(video.prompt).not.toContain('转身');expect(image.prompt).not.toContain('本地时间轴');
 s.connections.push({id:'bad',from:'omni-source',to:'omni-prompt'});
 expect(()=>resolveStudioInputs(s,'omni-prompt')).toThrow('不接收视频');
});

it('preserves confirmed dialogue for generated sound while removing source-only notes',()=>{
 const value=script('生成声音').replace('声音：后期回贴','声音：说“这件是蓝色的”，无音乐');
 expect(omniCopyVideoInputs([value],'【使用片段：01】').prompt).toContain('这件是蓝色的');
});

it('retains numbered text provenance after filtering at the generation boundary',async()=>{
 const {assertStudioTextReferences}=await import('./studioGeneration');
 const s=buildVideoWorkflowProject('depth-copy','numbered',1).studioScene!;
 s.nodes.find(n=>n.id==='numbered-prompt')!.settings={...s.nodes.find(n=>n.id==='numbered-prompt')!.settings as object,duration:'5s'};
 for(const key of ['product','person','background','keyframe'])s.nodes.find(n=>n.id===`numbered-${key}`)!.content='/storage/'+key+'.png';
 s.nodes.find(n=>n.id==='numbered-prompt')!.settings={...s.nodes.find(n=>n.id==='numbered-prompt')!.settings as object,duration:'5s'};
 const analysis=s.nodes.find(n=>n.id==='numbered-analysis')!;
 analysis.settings={...analysis.settings as object,textNodeDisplayText:script()};
 s.nodes.find(n=>n.id==='numbered-keyframe')!.prompt='商品要求 @文本1，分析 @文本2';
 s.nodes.find(n=>n.id==='numbered-prompt')!.prompt='【使用片段：01】按 @文本1 生成';
 for(const key of ['keyframe','prompt']){
  const result=resolveStudioInputs(s,`numbered-${key}`);
  expect(()=>assertStudioTextReferences(result.prompt)).not.toThrow();
  expect(result.prompt).not.toContain('原片观察报告');
 }
});

it('preserves other connected text requirements and their numbering for video optimization',async()=>{
 const {videoPromptMessages}=await import('@shared/domain/assistant/skills/videoPromptSkills');
 const {assertStudioTextReferences}=await import('./studioGeneration');
 const result=omniCopyVideoInputs(['图片1仅提供人物外观，保留蓝色商品，不参考背景',script(),'镜头保持固定，不新增字幕'],'【使用片段：01】按 @文本1 与 @文本3 执行');
 for(const value of ['图片1仅提供人物外观','不参考背景','镜头保持固定','【@文本1','【@文本2','【@文本3'])expect(result.prompt).toContain(value);
 expect(result.prompt).not.toContain('原片观察报告');
 expect(result.prompt).not.toContain('转身');
 expect(()=>assertStudioTextReferences(result.prompt)).not.toThrow();
 const messages=videoPromptMessages({model:'doubao-seedance-2.0-mini',mode:'omni',prompt:result.prompt,duration:result.duration,audio:result.audio,images:1,videos:0})!;
 expect(JSON.parse(messages[1].content)).toMatchObject({originalPrompt:result.prompt,duration:5,audio:false,references:{images:1,videos:0}});
});

it('uses the compiler sound choice consistently in parameters, prompt and soundtrack composition',()=>{
 for(const [original,override,expected] of [['生成声音',false,'静音'],['生成声音',true,'生成声音'],['保留原声',false,'静音']] as const) {
  const scene=buildVideoWorkflowProject('depth-copy','sound',1).studioScene!;
  const frame=scene.nodes.find(n=>n.id==='sound-keyframe')!,analysis=scene.nodes.find(n=>n.id==='sound-analysis')!,compiler=scene.nodes.find(n=>n.id==='sound-prompt')!;
  for(const key of ['product','person','background'])scene.nodes.find(n=>n.id===`sound-${key}`)!.content=`/storage/${key}.png`;
  frame.content='/storage/retained.png';analysis.settings={...analysis.settings as object,textNodeDisplayText:script(original).replace('声音：后期回贴','声音：已确认台词“蓝色商品”，无音乐')};
  compiler.settings={...compiler.settings as object,duration:'5s',beikeVideoAudio:override};
  const result=resolveStudioInputs(scene,compiler.id);
  expect(result).toMatchObject({audio:override,soundMode:expected});
  expect(result.prompt).not.toContain('后期回贴');
  if(!override)expect(result.prompt).toContain('声音：全程静音，无台词、音乐、环境声或音效。');
  else expect(result.prompt).not.toContain('声音：全程静音');
  const restored=JSON.parse(JSON.stringify(scene)) as typeof scene;
  expect(resolveStudioInputs(restored,compiler.id)).toEqual(result);
 }
});

it('accepts Markdown field labels in a completed storyboard without forwarding source notes',()=>{
 const value=script().replace(/^源片范围：(.*)$/gm,'- **源片范围：** $1')
  .replace(/^开场画面：(.*)$/gm,'- **开场画面：** $1')
  .replace(/^本地时间轴：(.*)$/gm,'**本地时间轴**：$1')
  .replace(/^结束状态：(.*)$/gm,'  - **结束状态**：$1')
  .replace(/^声音：(.*)$/gm,'- **声音：** $1');
 const result=omniCopyVideoInputs([value],'【使用片段：01】');
 expect(result.duration).toBe(5);
 expect(result.prompt).toContain('开场画面：站立');
 expect(result.prompt).toContain('结束状态：停稳');
 expect(result.prompt).not.toContain('源片范围');
 expect(result.prompt).not.toContain('后期回贴');
});

it('rejects a competing wood table script before optimization and names its source',()=>{
 const old='开场画面：趴在木桌上，百叶窗硬光。\n0–1秒：看窗户。\n1–15秒：蹲姿收尾。';
 expect(()=>omniCopyVideoInputs([script()], '【使用片段：01】', {draft:old})).toThrow(/07草稿.*第二套/);
 expect(()=>omniCopyVideoInputs([script(),old], '【使用片段：01】', {textNames:['05分镜','旧木桌脚本']})).toThrow(/旧木桌脚本.*第二套/);
 expect(()=>omniCopyVideoInputs([script()], '【使用片段：01】\n'+old)).toThrow(/07节点正文.*第二套/);
});

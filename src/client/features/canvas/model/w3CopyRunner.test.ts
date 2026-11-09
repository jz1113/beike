import {beforeEach,expect,it,vi} from 'vitest';
import {createVideoWorkflowProject} from './videoWorkflowProjects';
import {createW3CopyRunner} from './w3CopyRunner';
import {resolveStudioInputs} from './studioConnections';
import {studioChannels} from './studioGeneration';
import type {StudioTaskCommands} from './studioTaskState';

vi.mock('./studioGeneration',()=>({studioChannels:vi.fn()}));
beforeEach(()=>{
  vi.mocked(studioChannels).mockReturnValue([{id:'beike:video:metaso',kind:'video',metasoH3:true,
    route:'metaso',modelId:'MiniMax-H3',name:'MiniMax-H3',preferred:false}]);
});

const script='【全片一致性】同一人物与商品，指定背景。【声音模式：静音】【全片一致性结束】\n【视频片段 01｜时长 15 秒】\n首帧：人物在背景前的近景。\n本地时间轴：\n0–5秒：后退。\n5–10秒：转身。\n10–15秒：走近后停稳。\n【视频片段结束】';
function fixture() {
  const scene=createVideoWorkflowProject('w3-copy','copy',1).studioScene!;
  const node=(key:string)=>scene.nodes.find(n=>n.id==='copy-'+key)!;
  for(const key of ['source','product','person','background'])node(key).content='/storage/'+key+(key==='source'?'.mp4':'.png');
  node('analysis').settings={...node('analysis').settings as object,text:script,_chatCompletedAt:1};
  for(const key of ['keyframe','video'])Object.assign(node(key),{content:'/storage/old-'+key,beikeLastTaskId:'old-'+key});
  const events:string[]=[];
  const commands:StudioTaskCommands={
    read:()=>scene,
    update:(id,expected,patch)=>{
      const current=scene.nodes.find(n=>n.id===id)!;
      expect(current.beikeTaskId||current.beikeLastTaskId).toBe(expected);
      const settings={...current.settings as object,...patch.settings as object};
      Object.assign(current,patch,{settings});
    },
    runText:vi.fn(async(id,signal)=>{
      signal.throwIfAborted();events.push(id);
      node('analysis').settings={...node('analysis').settings as object,text:script,_chatCompletedAt:2};
    }),
    run:vi.fn(async id=>{
      events.push(id);
      const input=resolveStudioInputs(scene,id);
      expect(input).toMatchObject({duration:15,audio:false});
      expect(input.refs.map(r=>r.type)).toEqual(id==='copy-video'?['image']:['image','image','image']);
      if(id==='copy-video')expect(input.refs[0].url).toBe('/storage/new-copy-keyframe');
      Object.assign(scene.nodes.find(n=>n.id===id)!,{content:'/storage/new-'+id,beikeLastTaskId:'new-'+id});
      return true;
    }),stop:vi.fn(),
  };
  const host={commands:()=>commands,metasoH3:vi.fn(()=> 'beike:video:metaso'),save:vi.fn(async()=>{}),stopTask:vi.fn(),finishVideo:vi.fn(async()=>'/storage/silent.mp4')};
  return {scene,node,commands,host,events,runner:createW3CopyRunner(host)};
}
it('waits for each new result, saves each stage and submits only the new first frame plus the 15s silent script',async()=>{
  const f=fixture();const stages:string[]=[];
  await f.runner.run(stage=>stages.push(stage));
  expect(stages).toEqual(['preflight','analysis','keyframe','video','delivery','complete']);
  expect(f.events).toEqual(['copy-analysis','copy-keyframe','copy-video']);
  expect(f.host.save).toHaveBeenCalledTimes(5);
  expect(f.node('video')).toMatchObject({content:'/storage/silent.mp4',videoUrl:'/storage/silent.mp4',settings:{beikeRawVideoUrl:'/storage/new-copy-video',beikeSilentDelivery:true}});
  expect(f.node('video').settings).toMatchObject({model:'MiniMax-H3',resolution:'768P',duration:'15s',beikeVideoMode:'first_frame',beikeVideoAudio:false,beikeOptimizePrompt:false});
  expect(f.node('source').content).toBe('/storage/source.mp4');
});
it('does not advance or accept old outputs while analysis is pending, and blocks duplicate clicks',async()=>{
  const f=fixture();let finish!:()=>void;
  vi.mocked(f.commands.runText!).mockImplementation(async()=>{
    await new Promise<void>(resolve=>{finish=resolve;});
    f.node('analysis').settings={...f.node('analysis').settings as object,text:script};
  });
  const run=f.runner.run(()=>{});
  await vi.waitFor(()=>expect(f.commands.runText).toHaveBeenCalledOnce());
  expect(f.commands.run).not.toHaveBeenCalled();
  expect((f.node('analysis').settings as {text:string}).text).toBe('');
  await expect(f.runner.run(()=>{})).rejects.toThrow('重复提交');
  finish();await run;expect(f.commands.run).toHaveBeenCalledTimes(2);
});
it('stops on missing media, an altered video edge, an active task before any model call',async()=>{
  for(const change of [
    (f:ReturnType<typeof fixture>)=>{f.node('background').content='';},
    (f:ReturnType<typeof fixture>)=>{f.scene.connections.push({id:'leak',from:'copy-source',to:'copy-video'});},
    (f:ReturnType<typeof fixture>)=>{f.node('keyframe').isGenerating=true;},
  ]){
    const f=fixture();change(f);
    await expect(f.runner.run(()=>{})).rejects.toThrow();
    expect(f.commands.runText).not.toHaveBeenCalled();expect(f.commands.run).not.toHaveBeenCalled();
  }
});
it('stops after failed analysis or a failed image, even if older successful outputs exist',async()=>{
  const analysis=fixture();vi.mocked(analysis.commands.runText!).mockRejectedValue(new Error('分析失败'));
  await expect(analysis.runner.run(()=>{})).rejects.toThrow('分析失败');expect(analysis.commands.run).not.toHaveBeenCalled();
  const image=fixture();vi.mocked(image.commands.run).mockResolvedValue(false);
  await expect(image.runner.run(()=>{})).rejects.toThrow('未成功生成');expect(image.commands.run).toHaveBeenCalledTimes(1);
  const unchanged=fixture();vi.mocked(unchanged.commands.run).mockResolvedValue(true);
  await expect(unchanged.runner.run(()=>{})).rejects.toThrow('未成功生成');expect(unchanged.commands.run).toHaveBeenCalledTimes(1);
});
it('rejects non-15s, audible or multi-segment analysis without submitting an image or video',async()=>{
  for(const invalid of [script.replace('15 秒','8 秒'),script.replace('静音','生成声音'),script+'\n【视频片段 02｜时长 4 秒】\n首帧：近景。\n【视频片段结束】']){
    const f=fixture();vi.mocked(f.commands.runText!).mockImplementation(async()=>{f.node('analysis').settings={...f.node('analysis').settings as object,text:invalid};});
    await expect(f.runner.run(()=>{})).rejects.toThrow('单条15秒');expect(f.commands.run).not.toHaveBeenCalled();
  }
});
it('stops when inputs change during analysis and never sends the changed original to video generation',async()=>{
  const f=fixture();const analyze=f.commands.runText!;
  f.commands.runText=async(...args)=>{await analyze(...args);f.node('background').content='/storage/replaced.png';};
  await expect(f.runner.run(()=>{})).rejects.toThrow('已修改');expect(f.commands.run).not.toHaveBeenCalled();
});
it('cancels pending analysis and prevents downstream generation',async()=>{
  const f=fixture();vi.mocked(f.commands.runText!).mockImplementation(async(_id,signal)=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  }));
  const run=f.runner.run(()=>{});await vi.waitFor(()=>expect(f.commands.runText).toHaveBeenCalledOnce());
  f.runner.cancel();await expect(run).rejects.toMatchObject({name:'AbortError'});expect(f.commands.run).not.toHaveBeenCalled();
});
it('keeps the raw video after delivery failure and can retry processing without another paid model call',async()=>{
  const f=fixture();f.host.finishVideo.mockRejectedValueOnce(new Error('去音轨失败'));
  await expect(f.runner.run(()=>{})).rejects.toThrow('去音轨失败');
  expect(f.node('video').content).toBe('/storage/new-copy-video');
  f.node('source').content='';
  f.scene.connections.length=0;
  await f.runner.finish(()=>{});
  expect(f.commands.runText).toHaveBeenCalledOnce();expect(f.commands.run).toHaveBeenCalledTimes(2);
  expect(f.node('video').content).toBe('/storage/silent.mp4');
});
it('keeps the completed video version separate from the historical version on display',async()=>{
  const f=fixture(),video=f.node('video');
  video.beikeLastTaskId='latest';
  video.content='/storage/older.mp4';
  const older={id:'older',content:video.content,originalUrl:video.content};
  const latest={id:'latest',content:'/storage/latest.mp4',originalUrl:'/storage/latest.mp4'};
  video.settings={...video.settings as object,generationVersions:[older,latest],activeGenerationVersionIndex:0};
  await f.runner.finish(()=>{});
  expect(video.settings).toMatchObject({
    activeGenerationVersionIndex:1,
    beikeRawVideoUrl:latest.originalUrl,
    generationVersions:[older,{id:'latest',content:'/storage/silent.mp4',originalUrl:'/storage/silent.mp4',
      generatedImages:[{fullUrl:'/storage/silent.mp4'}]}],
  });
});
it('does not report delivery after the original video task has been replaced',async()=>{
  const f=fixture(),report=vi.fn();
  f.host.finishVideo.mockImplementationOnce(async()=>{
    f.node('video').beikeLastTaskId='replacement';
    f.node('video').content='/storage/replacement.mp4';
    return '/storage/silent.mp4';
  });
  await expect(f.runner.finish(report)).rejects.toThrow('视频任务已变更');
  expect(f.node('video').content).toBe('/storage/replacement.mp4');
  expect(report).not.toHaveBeenCalledWith('complete');
});
it('does not finalize or report completion after persistence fails',async()=>{
  const f=fixture();f.host.save.mockRejectedValueOnce(new Error('保存失败'));const stages:string[]=[];
  await expect(f.runner.run(stage=>stages.push(stage))).rejects.toThrow('保存失败');
  expect(f.commands.runText).not.toHaveBeenCalled();expect(f.host.finishVideo).not.toHaveBeenCalled();expect(stages).not.toContain('complete');
});

it.each([{beikeVideoMode:'omni'},{resolution:'1080P'},{duration:'8s'}])('stops before analysis when 08 cannot deliver a W3 video (%j)',async settings=>{
 const f=fixture();
 Object.assign(f.node('video').settings as object,settings);
 await expect(f.runner.run(()=>{})).rejects.toThrow('首帧生视频、768P、15秒');
 expect(f.commands.runText).not.toHaveBeenCalled();
 expect(f.commands.run).not.toHaveBeenCalled();
});
it('stops before analysis if there is no Metaso H3 route',async()=>{
  const f=fixture();
  vi.mocked(studioChannels).mockReturnValueOnce([]);
  await expect(f.runner.run(()=>{})).rejects.toThrow('启用该线路');
  expect(f.commands.runText).not.toHaveBeenCalled();
});

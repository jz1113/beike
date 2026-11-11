import { expect, it } from 'vitest';
import { canConnectStudioNodes, changeStudioConnection, filterStudioConnections, omniCopyReferenceInputs, omniCopyVideoInputs, resolveStudioInputs, restoreStudioReference, selectVideoCopyKeyframe, selectVideoCopyStoryboard } from './studioConnections';
import type { StudioScene } from './types';
import { buildVideoWorkflowProject } from './videoWorkflowProjects';
import { newCoverTextOperationId, validateCoverPromptFormat } from './coverBatch';

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

it('requires the matching batch Skill result before preparing a cover for image generation', () => {
  const value = scene();
  value.nodes = [
    { id: 'row-ref', type: 'input-image', content: '/storage/product.png' },
    { id: 'row-render', type: 'gen-image', prompt: '保留表格标题', settings: { beikeCoverExportRatio: '4:3' } },
    { id: 'row-render-writer', type: 'text-node', prompt: '批量写作要求', settings: {
      beikeBatchCoverWriter: true, beikeBatchCoverLayout: 'PHONE-30', beikeCoverSourceUrl: '/storage/product.png',
      textNodeDisplayText: '画幅与构图：PHONE-30｜商品靠右，标题靠左。',
    } },
  ];
  value.connections = [{ id: 'photo', from: 'row-ref', to: 'row-render' }];
  expect(() => resolveStudioInputs(value, 'row-render')).toThrow('Skill 提示词');
  value.connections.push({ id: 'design', from: 'row-render-writer', to: 'row-render' });
  expect(() => resolveStudioInputs(value, 'row-render')).toThrow('素材库已更新');
  const writerSettings = value.nodes[2].settings as Record<string, unknown>;
  writerSettings.textNodeDisplayText = '画幅与构图：PHONE-30\nNEED_INPUT';
  expect(() => resolveStudioInputs(value, 'row-render')).toThrow('NEED_INPUT');
  value.nodes[0].content = '/storage/replaced.png';
  expect(() => resolveStudioInputs(value, 'row-render')).toThrow('同一张商品图');
});

it('requires the original reference and completed design for a single cover', () => {
  const value = scene();
  value.nodes[0].settings = { beikeCoverPromptWriter: true, beikeCoverSourceUrl: 'local-asset://image' };
  value.nodes[2].settings = { beikeRequiredInputs: ['ref', 'text'] };
  value.connections = [{ id: 'photo', from: 'ref', to: 'image' }];
  expect(() => resolveStudioInputs(value, 'image')).toThrow('Skill 提示词');
  value.connections.push({ id: 'design', from: 'text', to: 'image' });
  expect(() => resolveStudioInputs(value, 'image')).toThrow('素材库已更新');
  value.nodes[1].content = '/storage/changed.png';
  expect(() => resolveStudioInputs(value, 'image')).toThrow('同一张商品图');
});

it('uses the selected sample while adapting square Excel covers to the central crop', () => {
  const design = [
    '画幅与构图：PHONE-04｜主体略斜',
    '背景：浅室内散景',
    '商品外观：按 @图片1',
    '标题与排版：',
    '第1行：“原文，”｜字号：大｜位置：左上｜样式：粗白',
    '第2行：“不改字”｜字号：小｜位置：第一行下方｜样式：细白',
    '字体与视觉风格：粗细对比',
    '光线和画质：左侧窗光和镜头暗部',
    '保真约束：保留镜头数量',
  ].join('\n');
  for (const batch of [false, true]) {
    const value = scene();
    const writerId = batch ? 'row-render-writer' : 'text';
    const imageId = batch ? 'row-render' : 'image';
    const productId = batch ? 'row-ref' : 'ref';
    const product = 'https://example.com/target.webp';
    const operationId = newCoverTextOperationId();
    value.nodes = [
      { id: writerId, type: 'text-node', content: design, beikeTextOperationId: operationId, settings: batch
        ? { beikeBatchCoverWriter: true, beikeBatchCoverLayout: 'PHONE-04', beikeCoverSourceUrl: product }
        : { beikeCoverPromptWriter: true, beikeCoverSourceUrl: product, beikeCoverPromptOperationId: operationId } },
      { id: productId, type: 'input-image', content: product },
      { id: imageId, type: 'gen-image', settings: batch
        ? { beikeCoverExportRatio: '4:3', beikeCoverTitle: '原文，不改字' }
        : { ratio: '3:4' } },
    ];
    value.connections = [{ id: 'photo', from: productId, to: imageId }, { id: 'design', from: writerId, to: imageId }];
    const inputs = resolveStudioInputs(value, imageId);
    expect(inputs.refs).toMatchObject([{ nodeId: productId, url: product }]);
    expect(inputs.coverReferencePath).toBe('/cover-layouts/v0.2.0/phone-04.webp');
    expect(inputs.prompt).toMatch(/^画幅与构图：PHONE-04｜\n@图片1 是唯一商品外观依据[^\n]+\n@图片2 是版式样张/);
    expect(inputs.prompt).toContain(batch ? '1:1 为准' : '3:4 为准');
    if (batch) {
      expect(inputs.prompt).toContain('输出完整 1:1 方图');
      expect(inputs.prompt).toContain('横向 25%–75%');
      expect(inputs.prompt).toContain('只借用样张的字体风格');
      expect(inputs.prompt).toContain('位置：中央安全区内居中');
      expect(inputs.prompt).not.toContain('位置：左上');
      expect(inputs.prompt).not.toContain('主体略斜');
    } else {
      expect(inputs.prompt).toContain('白色圆头粗黑');
      expect(inputs.prompt).toContain(design.slice(design.indexOf('｜') + 1));
    }
    expect(() => validateCoverPromptFormat(inputs.prompt, '原文，不改字')).not.toThrow();
    if (batch) {
      value.nodes[0].content = design.replace('不改字', '改字');
      expect(resolveStudioInputs(value, imageId).prompt).toContain('第2行：“改字”');
      expect(value.nodes[2].settings).toMatchObject({ beikeCoverTitle: '原文，不改字' });
      value.nodes[0].content = design.replace(/第1行：[^\n]+\n第2行：[^\n]+/, '无上图文字');
      expect(() => resolveStudioInputs(value, imageId)).toThrow('批量封面缺少上图文案');
    } else {
      value.nodes[0].content = design.replace('PHONE-04', 'PHONE-08');
      const reference = resolveStudioInputs(value, imageId);
      expect(reference.coverReferencePath).toBe('/cover-layouts/v0.2.0/phone-08.webp');
      expect(reference.prompt).toContain('浅黄粗蜡笔字');
      (value.nodes[0].settings as Record<string, unknown>).beikeCoverPromptOperationId = 'old-operation';
      expect(() => resolveStudioInputs(value, imageId)).toThrow('素材库已更新');
    }
  }
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

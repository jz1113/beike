import {beforeEach,describe,expect,it,vi} from 'vitest';
import { coverLayoutImageInput, normalizeBatchCoverPrompt, validateCoverPromptFormat } from './coverBatch';
import {studioVideoSettings} from './studioCompilerState';
import {
  assertStudioReferenceNumbers,
  assertStudioTextReferences,
  canvasChatRequest,
  isExternalStudioChatVideo,
  normalizeStudioReferenceNumbers,
  prepareStudioChatVideo,
  prepareStudioGeneration,
  sortStudioModels,
  studioChannels,
  studioChatVideoInline,
  submitStudioDepth,
  type StudioRequest,
} from './studioGeneration';

const routes=vi.hoisted(()=>[
  {id:'h3-other',modelId:'MiniMax-H3',name:'其他 H3'},
  {id:'h3-metaso',modelId:'MiniMax-H3',name:'秘塔 H3'},
  {id:'wan',modelId:'wan3.0-video',name:'Wan'},
]);
const imageRoutes=vi.hoisted(()=>[] as Array<{id:string;modelId:string;name:string}>);
const chatRoutes=vi.hoisted(()=>[] as Array<{id:string;modelId:string;name:string}>);
const voiceRoutes=vi.hoisted(()=>[] as Array<{id:string;modelId:string;name:string}>);
const depthMocks=vi.hoisted(()=>({
  state:{generationHistoryReady:true,generationTasks:[] as {id:string}[],sessions:[] as {tasks:{id:string}[]}[],addGenerationTask:vi.fn()},
  fetch:vi.fn(),media:vi.fn(),register:vi.fn(),reference:vi.fn(),referenceKind:vi.fn(),overrides:vi.fn(),
}));
vi.mock('@client/store',()=>({useAppStore:{getState:()=>depthMocks.state}}));
vi.mock('@client/shared/api/apiClient',()=>({apiFetch:depthMocks.fetch,storageConfigHeaders:()=>({'x-storage-config':'configured'})}));
vi.mock('@client/shared/api/gatewayClient',()=>({
  getModelCredentials:()=>({}),
  getGatewayClientBaseUrl:(route:string)=>route==='h3-metaso'?'https://metaso.cn/api':'https://other.example/api',
  getGatewayClientHeaders:vi.fn(),
  getMultimodalClientOverrides:depthMocks.overrides,
}));
vi.mock('@client/shared/media/downloadMedia',()=>({fetchMediaBlob:depthMocks.media}));
vi.mock('@client/shared/api/generation/depthGeneration',()=>({registerDepthSubmit:depthMocks.register}));
vi.mock('@client/shared/media/refMediaRegistry',async importOriginal=>({
  ...await importOriginal<typeof import('@client/shared/media/refMediaRegistry')>(),
  registerRefMedia:depthMocks.reference,
  registerRefMediaKind:depthMocks.referenceKind,
}));
vi.mock('./canvasTextRequest',()=>({requestCanvasText:async(body:()=>object)=>{const response=await depthMocks.fetch('/api/generate/canvas-text',{body:JSON.stringify(body())});return response.json();}}));
vi.mock('@shared/domain/models/modalityStorage',async original=>({
  ...await original<typeof import('@shared/domain/models/modalityStorage')>(),
  modalityPickerSelections:(kind:string)=>kind==='video'?routes:kind==='image'?imageRoutes:kind==='chat'?chatRoutes:kind==='voice'?voiceRoutes:[],
  upstreamModalityModelId:(kind:string,id:string)=>(kind==='image'?imageRoutes:routes).find(route=>route.id===id)?.modelId || id,
}));
vi.mock('@client/shared/agent/dispatchGenerationBatch',()=>({currentBatchSettings:()=>({
  imageModel:'image',imageAspect:'9:16',imageQuality:'high',videoModel:'wan',videoAspect:'9:16',
  videoResolution:'720P',videoDuration:5,videoRefMode:'text',videoGenerateAudio:true,
})}));

beforeEach(()=>{
  vi.clearAllMocks();
  depthMocks.state.generationHistoryReady=true;
  depthMocks.state.generationTasks=[];
  depthMocks.state.sessions=[];
  chatRoutes.length=0;
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
});
it('sorts audio channels by manufacturer and version while retaining independent routes',()=>{
  const mixed=[
    {id:'voice-a',modelId:'speech-2.6-hd',name:'语音 A'},
    {id:'voice-b',modelId:'cosyvoice-v2',name:'语音 B'},
    {id:'voice-c',modelId:'speech-2.8-hd',name:'语音 C'},
    {id:'voice-d',modelId:'cosyvoice-v3',name:'语音 D'},
    {id:'voice-e',modelId:'speech-2.8-hd',name:'语音 E'},
  ];
  try {
    voiceRoutes.push(...mixed);
    const voices=studioChannels().filter(channel=>channel.kind==='voice');
    expect(voices.map(channel=>channel.route)).toEqual(['voice-c','voice-e','voice-a','voice-d','voice-b']);
    for(const model of mixed)expect(voices.find(channel=>channel.route===model.id)).toMatchObject({
      id:`beike:voice:${model.id}`,modelId:model.modelId,name:model.name,
    });
  } finally {voiceRoutes.length=0;}
});
it('sorts multimodal channels by series and upstream version while preserving their routes',()=>{
  const mixed=[
    {id:'other',modelId:'custom-vision',name:'其他'},
    {id:'kimi',modelId:'kimi-k3.1-pro',name:'Kimi'},
    {id:'qwen',modelId:'qwen-vl-max',name:'Qwen'},
    {id:'deepseek',modelId:'deepseek-v4.1-flash',name:'DeepSeek'},
    {id:'muse',modelId:'openai/muse-wonder-1.0',name:'Muse'},
    {id:'grok',modelId:'grok-4.7',name:'Grok'},
    {id:'claude',modelId:'claude-opus-5-5',name:'Claude'},
    {id:'text-a',modelId:'gpt-5.6-sol',name:'文本 A'},
    {id:'text-b',modelId:'gemini-3.7-pro',name:'文本 B'},
    {id:'text-c',modelId:'gpt-6.1-luna',name:'文本 C'},
    {id:'text-d',modelId:'gemini-3.8-flash',name:'文本 D'},
  ];
  try {
    chatRoutes.push(...mixed);
    const chats=studioChannels().filter(channel=>channel.kind==='chat');
    expect(chats.map(channel=>channel.route)).toEqual([
      'text-d','text-c','text-a','claude','grok','deepseek','kimi','other','qwen','muse','text-b',
    ]);
    for(const model of mixed)expect(chats.find(channel=>channel.route===model.id)).toMatchObject({
      id:`beike:chat:${model.id}`,modelId:model.modelId,name:model.name,
    });
  } finally {chatRoutes.length=0;}
});
it('sorts image channels by manufacturer and newest version while preserving their routes',()=>{
  const mixed=[
    {id:'gpt-2',modelId:'gpt-image-2',name:'GPT Image 2'},
    {id:'seedream-4',modelId:'doubao-seedream-4-0-250828',name:'Seedream 4'},
    {id:'gpt-25',modelId:'gpt-image-2.5-flare',name:'GPT Image 2.5'},
    {id:'seedream-5',modelId:'doubao-seedream-5-0-260128',name:'Seedream 5'},
  ];
  try {
    imageRoutes.push(...mixed);
    const images=studioChannels().filter(channel=>channel.kind==='image');
    expect(images.map(channel=>channel.route)).toEqual(['gpt-25','gpt-2','seedream-5','seedream-4']);
    for(const model of mixed)expect(images.find(channel=>channel.route===model.id)).toMatchObject({
      id:`beike:image:${model.id}`,modelId:model.modelId,name:model.name,
    });
  } finally {imageRoutes.length=0;}
});
it('uses video catalog priority without changing route IDs or labels',()=>{
  const original=[...routes];
  const mixed=[
    {id:'omni',modelId:'gemini-omni-1.2-flash',name:'Omni'},
    {id:'seedance-1',modelId:'doubao-seedance-1-0-pro-250528',name:'Seedance 1'},
    {id:'metaso',modelId:'MiniMax-H3',name:'MiniMax-H3 · 秘塔海螺'},
    {id:'seedance-2',modelId:'doubao-seedance-2-0-260128',name:'Seedance 2'},
    {id:'kling',modelId:'kling-4.0',name:'Kling'},
    {id:'minimax',modelId:'MiniMax-H3',name:'MiniMax-H3'},
    {id:'veo',modelId:'veo3.1',name:'Veo'},
  ];
  try {
    routes.splice(0,routes.length,...mixed);
    const videos=studioChannels().filter(channel=>channel.kind==='video');
    expect(videos.map(channel=>channel.route)).toEqual(['veo','omni','seedance-2','metaso','minimax','kling','seedance-1']);
    for(const model of mixed)expect(videos.find(channel=>channel.route===model.id)).toMatchObject({
      id:`beike:video:${model.id}`,modelId:model.modelId,name:model.name,
    });
  } finally {routes.splice(0,routes.length,...original);}
});
const request=():StudioRequest=>({taskId:'storyboard-task',videoWorkflow:'w3-copy',model:'beike:video:h3-metaso',
  prompt:'0–3秒抬手，3–8秒转身并停稳；全程静音。',refs:[{type:'image',url:'https://example.com/frame.png'}],duration:8,resolution:'720P',ratio:'9:16',audio:false});

it('keeps image resolution separate from GPT Image quality and uses Seedream pixel bounds', () => {
  imageRoutes.push(
    { id: 'gpt-image-2', modelId: 'gpt-image-2', name: 'GPT Image' },
    { id: 'doubao-seedream-5-0-260128', modelId: 'doubao-seedream-5-0-260128', name: 'Seedream' },
    { id: 'gemini-3.1-flash-image', modelId: 'gemini-3.1-flash-image', name: 'Nano Banana' },
  );
  try {
    const input = { taskId: 'image-spec', prompt: '画一只猫', refs: [], ratio: '9:16', resolution: '2K' };
    const gpt = prepareStudioGeneration({ ...input, model: 'beike:image:gpt-image-2', imageQuality: 'low' })!.task;
    expect(gpt).toMatchObject({ quality: 'medium', imageQuality: 'low', size: '1152x2048' });
    const seedream = prepareStudioGeneration({ ...input, model: 'beike:image:doubao-seedream-5-0-260128' })!.task;
    const [width, height] = seedream.size.split('x').map(Number);
    expect(width / height).toBe(9 / 16);
    expect(width * height).toBeGreaterThanOrEqual(3686400);
    const gemini = prepareStudioGeneration({ ...input, model: 'beike:image:gemini-3.1-flash-image', resolution: '512px' })!.task;
    expect(gemini).toMatchObject({ quality: '512px', size: '384x688' });
  } finally {
    imageRoutes.length = 0;
  }
});

it('keeps prompt numbers aligned with the submitted image order and rejects missing references before preparing a task',()=>{
  imageRoutes.push({id:'gpt-image-2',modelId:'gpt-image-2',name:'Image'});
  try {
    const input:StudioRequest={taskId:'reference-check',model:'beike:image:gpt-image-2',
      prompt:'人物 @图片1，场景 @图片2',refs:['https://example.com/face.png','https://example.com/place.png']};
    const prepared=prepareStudioGeneration(input)!;
    expect(prepared.task.referenceImages).toEqual(input.refs);
    expect(prepared.task.prompt).toContain('人物 @图片1，场景 @图片2');
    expect(()=>prepareStudioGeneration({...input,refs:input.refs.slice(0,1)})).toThrow('素材已移除');
  } finally {imageRoutes.length=0;}
});

it('binds Metaso by host and prepares an H3 768P task with script and first frame, without reference video',()=>{
  expect(studioChannels().filter(channel=>'metasoH3' in channel && channel.metasoH3).map(channel=>channel.id)).toEqual(['beike:video:h3-metaso']);
  const prepared=prepareStudioGeneration(request())!;
  expect(prepared.task).toMatchObject({model:'MiniMax-H3',modelRouteKey:'h3-metaso',videoResolution:'768P',videoDuration:8,
    videoRefMode:'first_frame',generateAudio:false,referenceVideoUrls:[]});
});
it('allows changing the template model and keeps input safeguards on the default Metaso first-frame flow',()=>{
  for(const model of ['beike:video:h3-other','beike:video:wan'])expect(prepareStudioGeneration({...request(),model})?.task).toMatchObject({videoRefMode:'first_frame',modelRouteKey:model.replace('beike:video:','')});
  expect(()=>prepareStudioGeneration({...request(),refs:[...request().refs,{type:'video',url:'https://example.com/source.mp4'}]})).toThrow('不提交原视频');
  for(const duration of [undefined,3,16,4.5])expect(()=>prepareStudioGeneration({...request(),duration})).toThrow('时长');
  expect(()=>prepareStudioGeneration({...request(),refs:[]})).toThrow('关键帧');
});

it('preserves an explicit reference mode with one or two images in the prepared generation task',()=>{
  for(const count of [1,2]) {
    const prepared=prepareStudioGeneration({...request(),videoWorkflow:undefined,videoMode:'omni',
      refs:Array.from({length:count},(_,i)=>({type:'image' as const,url:`https://example.com/${i}.png`}))})!;
    expect(prepared.task.videoRefMode).toBe('omni');
    expect(prepared.task).not.toHaveProperty('firstFrameImage');

    expect(prepared.settings).toMatchObject({beikeResolvedVideoMode:'omni'});
  }
});

it('offers host model modes and shows the mode inferred for older nodes without changing their settings',()=>{
  const node={id:'video',type:'gen-video',settings:{model:'beike:video:h3-metaso',ratio:'9:16',duration:'8s',resolution:'768P'}};
  const panel=studioVideoSettings(node)!;
  expect(panel.beikeModeOptions.map(item=>item.value)).toEqual(['auto','omni','first_frame','last_frame','first_last_frame','text']);
  expect(panel.beikeModeOptions[0].label).toBe('自动 · 文生视频');
  expect(panel.selectedRatio).toBe('9:16');
  expect(panel.resolutionOptions).toEqual(['480P','768P','1080P','2K']);
  expect(panel.durationOptions).toHaveLength(12);
  const explicit=studioVideoSettings({...node,settings:{...node.settings,beikeVideoMode:'omni'}})!;
  expect(explicit.beikeSelectedMode).toBe('omni');
  expect(explicit.beikeModeOptions[0].label).toBe('自动 · 文生视频');
  expect(studioVideoSettings({...node,type:'gen-image'})).toBeUndefined();
  expect(studioVideoSettings({...node,settings:{...node.settings,beikeOperation:'depth-video'}})).toBeUndefined();
});

it('defaults storyboard copies to first frame while respecting an explicit model mode',()=>{
  expect(prepareStudioGeneration({...request(),videoMode:'omni'})?.task.videoRefMode).toBe('omni');
  const panel=studioVideoSettings({id:'video',type:'gen-video',settings:{model:request().model,beikeVideoWorkflow:'w3-copy'}})!;
  expect(panel.beikeSelectedMode).toBe('first_frame');
  expect(panel.beikeModeOptions.map(item=>item.value)).toEqual(['auto','omni','first_frame','last_frame','first_last_frame','text']);
  expect(studioVideoSettings({id:'video',type:'gen-video',settings:{model:request().model,beikeVideoWorkflow:'w3-copy',beikeVideoMode:'omni'}})?.beikeSelectedMode).toBe('omni');
});

it('submits a selected H3 tail frame with its adaptive ratio instead of reverting to the template mode',()=>{
  const prepared=prepareStudioGeneration({...request(),videoMode:'last_frame'})!;
  expect(prepared.task).toMatchObject({videoRefMode:'last_frame',size:'adaptive',videoResolution:'768P'});
});

it('keeps the Veo extension setting visible with its continuation duration and method',()=>{
  routes.push({id:'veo-test',modelId:'veo3.1',name:'Veo'});
  try {
    const panel=studioVideoSettings({id:'veo',type:'gen-video',settings:{model:'beike:video:veo-test',beikeVideoMode:'extend',resolution:'720P',duration:'5s'}})!;
    expect(panel.beikeModeOptions).toContainEqual({value:'extend',label:'末帧续拍延长'});
    expect(panel.durationOptions).toEqual(['8s']);
    expect(panel.selectedDuration).toBe('8s');
    expect(panel.durationHint).toContain('拼接');
  } finally {routes.splice(routes.findIndex(route=>route.id==='veo-test'),1);}
});
it('preserves the selected video order after prompt references reorder the input strip',()=>{
 const refs=[{type:'video' as const,url:'https://example.com/a.mp4'},{type:'image' as const,url:'https://example.com/face.png'},{type:'video' as const,url:'https://example.com/b.mp4'}];
 const result=prepareStudioGeneration({...request(),videoWorkflow:undefined,videoMode:'omni',prompt:'先 @视频3 再 @图片2 最后 @视频1',refs})!;
 expect(result.task.referenceVideoUrls).toEqual([refs[2].url,refs[0].url]);
 expect(result.task.prompt).toContain('先 @视频1 再 @图片1 最后 @视频2');
 const only=prepareStudioGeneration({...request(),videoWorkflow:undefined,videoMode:'omni',prompt:'只参考 @视频3',refs})!;
 expect(only.task.referenceVideoUrls).toEqual([refs[2].url]);
});
it('keeps the complete long cover prompt in the submitted image task', () => {
  imageRoutes.push({ id: 'image-test', modelId: 'gpt-image-2', name: 'Image' });
  try {
    const prompt = ['画幅与构图：竖屏', '背景：' + '保留桌面的真实纹理。'.repeat(300), '保真约束：保留原始镜头结构。'].join('\n');
    const prepared = prepareStudioGeneration({
      taskId: 'cover-long-prompt', model: 'beike:image:image-test', prompt, refs: [], ratio: '3:4',
    });
    expect(prepared?.task.prompt).toBe(prompt);
  } finally {
    imageRoutes.length = 0;
  }
});

it('does not substitute videos for image inputs or submit unresolved text references',()=>{
 imageRoutes.push({id:'image-test',modelId:'gpt-image-2',name:'Image'});
 try {
  const input={taskId:'invalid-media',model:'beike:image:image-test',prompt:'按参考生成',refs:[{type:'video' as const,url:'https://example.com/source.mp4'}]};
  expect(()=>prepareStudioGeneration(input)).toThrow('不支持视频引用');
  expect(()=>prepareStudioGeneration({...input,refs:[],prompt:'按 @文本1 生成'})).toThrow('文本未连接');
 } finally {imageRoutes.length=0;}
});

it('uses explicit omni script parameters without silently changing duration or audio',()=>{
 const input:StudioRequest={taskId:'omni-script',model:'beike:video:wan',prompt:'目标人物转身，全程静音',refs:[{type:'image',url:'https://example.com/ref.png'}],scriptOnly:true,videoMode:'omni',duration:5,audio:false,resolution:'720P',ratio:'9:16'};
 const prepared=prepareStudioGeneration(input)!;
 expect(prepared.task).toMatchObject({videoRefMode:'omni',videoDuration:5,generateAudio:false,referenceVideoUrls:[]});
 expect(prepareStudioGeneration({...input,duration:15})!.task).toMatchObject({videoDuration:15,generateAudio:false});
 expect(()=>prepareStudioGeneration({...input,duration:999})).toThrow('分镜时长');
 expect(()=>prepareStudioGeneration({...input,audio:undefined})).toThrow('声音参数');
 expect(()=>prepareStudioGeneration({...input,videoMode:'first_frame'})).toThrow('全能模式');
 expect(()=>prepareStudioGeneration({...input,refs:[{type:'video',url:'https://example.com/original.mp4'}]})).toThrow('目标参考图');
});

it('embeds verified text sources without exposing text tokens to the image attachment parser',()=>{
 imageRoutes.push({id:'image-text',modelId:'gpt-image-2',name:'Image'});
 try {
  const prepared=prepareStudioGeneration({taskId:'bound-text',model:'beike:image:image-text',
   prompt:'【@文本1 · 商品】\n灰色套装\n【@文本2 · 分镜】\n白墙前自然站立\n使用 @文本1 和 @文本2，服装 @图片1',refs:['https://example.com/product.png']})!;
  expect(prepared.task.prompt).toContain('灰色套装');
  expect(prepared.task.prompt).toContain('白墙前自然站立');
  expect(prepared.task.prompt).not.toContain('@文本');
  expect(prepared.task.referenceImages).toEqual(['https://example.com/product.png']);
 } finally {imageRoutes.length=0;}
});

it('passes mixed canvas references as separate video audio inputs and validates the selected mode',()=>{
  const request:StudioRequest={taskId:'with-audio',model:'beike:video:h3-other',prompt:'参考 @图片1 和 @音频2',videoMode:'auto',duration:5,audio:true,refs:[
    {type:'image',url:'https://example.com/person.png'},
    {type:'audio',url:'/storage/local/audio/voice.wav'},
  ]};
  expect(prepareStudioGeneration(request)?.task).toMatchObject({
    videoRefMode:'omni',referenceImages:['https://example.com/person.png'],
    referenceAudioUrls:['/storage/local/audio/voice.wav'],prompt:expect.stringContaining('@音频1'),
  });
  expect(()=>prepareStudioGeneration({...request,videoMode:'first_frame'})).toThrow('参考音频仅支持全能参考');
  expect(()=>prepareStudioGeneration({...request,audio:false})).toThrow('参考音频需要开启生成声音');
});

it('puts catalog video families first and leaves historical routes stable', () => {
  const ids = [
    'doubao-seedance-1-0-pro-250528', 'kling-video-v2-5-turbo',
    'doubao-seedance-1-5-pro-251215', 'viduq3',
    'doubao-seedance-2-0-fast-260128', 'kling-video-v3',
    'doubao-seedance-2.5', 'vidu-q4-preview', 'kling-video-v2-6',
    'doubao-seedance-2.0-mini',
  ];
  const models = ids.map((modelId, index) => ({ id: `route-${index}`, modelId }));
  expect(sortStudioModels(models).map(model => model.modelId)).toEqual([
    'doubao-seedance-2.5', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2.0-mini',
    'vidu-q4-preview', 'doubao-seedance-1-0-pro-250528', 'kling-video-v2-5-turbo',
    'doubao-seedance-1-5-pro-251215', 'viduq3', 'kling-video-v3', 'kling-video-v2-6',
  ]);
  expect(models.map(model => model.modelId)).toEqual(ids);
});

it('keeps duplicate routes stable within the video catalog order', () => {
  const models = [
    { modelId: 'gemini-omni-1.0-flash', id: 'omni' },
    { modelId: 'veo3.1', id: 'veo' },
    { modelId: 'MiniMax-H3', id: 'metaso' },
    { modelId: 'MiniMax-H3', id: 'official' },
    { modelId: 'wan2.6-video', id: 'wan-old' },
    { modelId: 'wan3.0-video', id: 'wan-new' },
  ];
  expect(sortStudioModels(models).map(model => model.id)).toEqual([
    'veo', 'omni', 'wan-new', 'metaso', 'official', 'wan-old',
  ]);
});

it('uses image catalog order without treating snapshot dates as versions', () => {
  const models = [
    'doubao-seedream-4-0-250828', 'gpt-image-2', 'gemini-2.5-flash-image',
    'doubao-seedream-5-0-260128', 'gpt-image-2.5-flare', 'gemini-3.1-flash-image',
    'doubao-seedream-4-5-251128', 'gpt-image-2.5-sunburst', 'gemini-3-pro-image',
  ].map(modelId => ({ modelId }));
  expect(sortStudioModels(models).map(model => model.modelId)).toEqual([
    'gemini-3.1-flash-image',
    'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2',
    'doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128',
    'doubao-seedream-4-0-250828', 'gemini-2.5-flash-image', 'gemini-3-pro-image',
  ]);
});

it('uses text catalog order across families and generations', () => {
  const models = [
    'gpt-5.6-sol', 'claude-opus-4-5-20251101-thinking', 'gemini-3.7-pro',
    'gpt-6.1-luna', 'claude-sonnet-5', 'gemini-3.8-flash',
    'gpt-6-sol', 'claude-opus-4-6',
  ].map(modelId => ({ modelId }));
  expect(sortStudioModels(models).map(model => model.modelId)).toEqual([
    'gemini-3.8-flash', 'gpt-6.1-luna', 'gpt-6-sol', 'gpt-5.6-sol',
    'claude-sonnet-5', 'claude-opus-4-5-20251101-thinking', 'gemini-3.7-pro', 'claude-opus-4-6',
  ]);
});

it('groups audio manufacturers and sorts speech, voice and TTS versions newest first', () => {
  const models = [
    'speech-2.6-hd', 'tts-1-hd', 'cosyvoice-v2', 'eleven_multilingual_v2',
    'speech-2.8-turbo', 'gpt-4o-mini-tts', 'cosyvoice-v3', 'eleven_v3', 'speech-02-hd',
  ].map(modelId => ({ modelId }));
  expect(sortStudioModels(models, 'voice').map(model => model.modelId)).toEqual([
    'speech-2.8-turbo', 'speech-2.6-hd', 'speech-02-hd',
    'gpt-4o-mini-tts', 'tts-1-hd', 'cosyvoice-v3', 'cosyvoice-v2',
    'eleven_v3', 'eleven_multilingual_v2',
  ]);
});

it('将画布混合编号转换为图片和视频各自的编号，同时保留无效引用供校验报错',()=>{
  const refs=[{type:'video' as const},{type:'image' as const},{type:'image' as const}];
  expect(normalizeStudioReferenceNumbers('@视频1 @图片2 @图片3 @图片9',refs)).toBe('@视频1 @图片1 @图片2 @图片9');
});

it('rejects removed or mismatched references before numbering for the provider',()=>{
  const refs=[{type:'video' as const},{type:'image' as const}];
  expect(()=>assertStudioReferenceNumbers('@视频1 @图片2',refs)).not.toThrow();
  for(const prompt of ['@图片1','@图片3','@音频1','@视频0'])
    expect(()=>assertStudioReferenceNumbers(prompt,refs)).toThrow('请重新引用');
});

it('normalizes tokens emitted by the native @ menu and legacy img mentions through the mixed reference order',()=>{
  const refs=[{type:'video' as const},{type:'image' as const},{type:'image' as const}];
  expect(()=>assertStudioReferenceNumbers('@1 @2 @IMG3',refs)).not.toThrow();
  expect(normalizeStudioReferenceNumbers('@1 @2 @IMG3',refs)).toBe('@视频1 @图片1 @图片2');
  for(const prompt of ['@0','@4','@img1'])expect(()=>assertStudioReferenceNumbers(prompt,refs)).toThrow('请重新引用');
  expect(normalizeStudioReferenceNumbers('人物 @文本1，产品 @2',refs)).toBe('人物 @文本1，产品 @图片1');
});

it('requires an actual nonempty connected text body for every text mention',()=>{
 expect(()=>assertStudioTextReferences('使用 @文本1\n【@文本1 · 要求】\n【商品要求】蓝色服装')).not.toThrow();
 for(const prompt of ['使用 @文本1','【@文本1 · 要求】','【@文本1 · 要求】\n【@文本2 · 分镜】\n正文','@文本2\n【@文本1 · 要求】正文'])
  expect(()=>assertStudioTextReferences(prompt)).toThrow('文本未连接');
});

describe('画布文本节点参考视频上传与多模态提交', () => {
  it('不会把宿主本地视频当作模型可访问的公网地址', () => {
    expect(isExternalStudioChatVideo('http://127.0.0.1:5173/storage/ref.mp4', 'http://127.0.0.1:5173')).toBe(false);
    expect(isExternalStudioChatVideo('http://localhost:3000/storage/ref.mp4', 'http://127.0.0.1:5173')).toBe(false);
    expect(isExternalStudioChatVideo('https://cdn.example/ref.mp4', 'http://127.0.0.1:5173')).toBe(true);
    expect(isExternalStudioChatVideo('blob:https://example.com/id', 'http://127.0.0.1:5173')).toBe(false);
  });
  it('通过宿主上传视频并使用对象存储返回的地址', async () => {
    depthMocks.fetch.mockResolvedValue(new Response(JSON.stringify({success:true,url:'https://cdn.example/video.mp4'})));
    expect(await prepareStudioChatVideo(new Blob(['video'], {type:'video/mp4'}))).toBe('https://cdn.example/video.mp4');
    const [url, req] = depthMocks.fetch.mock.calls[0];
    expect(url).toBe('/api/generate/upload-ref');
    expect(req.headers).toEqual({'x-storage-config':'configured'});
    expect(req.body.get('file').type).toBe('video/mp4');
  });
  it('保留存储服务的具体错误，不发送失效素材', async () => {
    depthMocks.fetch.mockResolvedValue(new Response(JSON.stringify({error:'请先配置对象存储'}), {status:400}));
    await expect(prepareStudioChatVideo(new Blob(['video'], {type:'video/mp4'}))).rejects.toThrow('请先配置对象存储');
    await expect(prepareStudioChatVideo(new Blob([], {type:'video/mp4'}))).rejects.toThrow('参考视频已失效');
    expect(depthMocks.fetch).toHaveBeenCalledOnce();
  });
  it('uses the upstream model name while retaining the selected channel credentials', async()=>{
    chatRoutes.push({id:'provider-entry',modelId:'gemini-3.8-flash',name:'Gemini'});
    depthMocks.overrides.mockReturnValue({textProtocol:'openai',customBaseUrl:'https://example.test',customApiKey:'test-channel-key'});
    depthMocks.fetch.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'正文'},finish_reason:'stop'}]})));
    await canvasChatRequest({model:'beike:chat:provider-entry',messages:[{role:'user',content:'分析'}]},new AbortController().signal,{projectId:'project',nodeId:'text',runId:'run'});
    const body=JSON.parse(depthMocks.fetch.mock.calls.at(-1)![1].body);
    expect(body).toMatchObject({model:'gemini-3.8-flash',customApiKey:'test-channel-key',customBaseUrl:'https://example.test'});
    expect(depthMocks.overrides).toHaveBeenLastCalledWith('provider-entry');
  });
  it('selects inline video by the configured route protocol rather than the model label',()=>{
    chatRoutes.push({id:'native',modelId:'gemini-test',name:'Native'},{id:'compatible',modelId:'gemini-test',name:'Compatible'});
    depthMocks.overrides.mockImplementation((route:string)=>({textProtocol:route==='native'?'gemini':'openai'}));
    expect(studioChatVideoInline('beike:chat:native')).toBe(true);
    expect(studioChatVideoInline('beike:chat:compatible')).toBe(false);
    expect(studioChatVideoInline('missing')).toBe(false);
  });
});

const depthReq={taskId:'test-depth',model:'beike:depth:video',prompt:'',operation:'depth-video',refs:[{type:'video' as const,url:'https://example.test/reference.mp4'}]};
describe('画布深度转换接入',()=>{
  beforeEach(()=>{
    depthMocks.fetch.mockResolvedValue(Response.json({depthModelReady:true}));
    depthMocks.media.mockResolvedValue(new Blob(['video'],{type:'video/mp4'}));
  });
  it('将素材和参数登记后提交现有持久任务队列',async()=>{
    await submitStudioDepth(depthReq,'project-a');
    expect(depthMocks.register).toHaveBeenCalledWith('test-depth',expect.objectContaining({file:expect.any(File),mode:'depth-video',style:'mocap'}));
    expect(depthMocks.state.addGenerationTask).toHaveBeenCalledWith(expect.objectContaining({id:'test-depth',canvasProjectId:'project-a',mediaType:'depth-video',referenceImageUrl:depthReq.refs[0].url}),false);
  });
  it('模型未就绪时不读取素材也不提交任务',async()=>{
    depthMocks.fetch.mockResolvedValue(Response.json({depthModelReady:false}));
    await expect(submitStudioDepth(depthReq,'project-a')).rejects.toThrow('本机深度模型尚未就绪');
    expect(depthMocks.media).not.toHaveBeenCalled();expect(depthMocks.state.addGenerationTask).not.toHaveBeenCalled();
  });
  it('同任务重复恢复不再次提交',async()=>{
    depthMocks.state.generationTasks=[{id:depthReq.taskId}];
    await submitStudioDepth(depthReq,'project-a');
    expect(depthMocks.fetch).not.toHaveBeenCalled();expect(depthMocks.state.addGenerationTask).not.toHaveBeenCalled();
  });
  it('拒绝混入图片及无效响应，避免把错误页送给深度模型',async()=>{
    await expect(submitStudioDepth({...depthReq,refs:[...depthReq.refs,{type:'image',url:'https://example.test/p.png'}]},'project-a')).rejects.toThrow('只接受一条');
    depthMocks.media.mockResolvedValue(new Blob(['error'],{type:'text/html'}));
    await expect(submitStudioDepth(depthReq,'project-a')).rejects.toThrow('不是有效的视频');
    expect(depthMocks.register).not.toHaveBeenCalled();expect(depthMocks.state.addGenerationTask).not.toHaveBeenCalled();
  });
  it.each(['environment','media'])('does not enqueue a cancelled depth preparation while awaiting %s',async phase=>{
    const controller=new AbortController();let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
    if(phase==='environment')depthMocks.fetch.mockImplementation(async()=>{entered();await gate;return Response.json({depthModelReady:true});});
    else depthMocks.media.mockImplementation(async()=>{entered();await gate;return new Blob(['video'],{type:'video/mp4'});});
    const pending=submitStudioDepth(depthReq,'project-a',controller.signal);
    await started;controller.abort();release();
    await expect(pending).rejects.toThrow();
    expect(depthMocks.register).not.toHaveBeenCalled();expect(depthMocks.state.addGenerationTask).not.toHaveBeenCalled();
  });
  it('rejects an already cancelled depth preparation without reading environment or media',async()=>{
    const controller=new AbortController();controller.abort();
    await expect(submitStudioDepth(depthReq,'project-a',controller.signal)).rejects.toThrow();
    expect(depthMocks.fetch).not.toHaveBeenCalled();expect(depthMocks.media).not.toHaveBeenCalled();
  });
});

it('builds a cover task with product first, layout sample second, and the requested landscape size', () => {
  imageRoutes.push(
    { id: 'cover-test', modelId: 'gpt-image-2', name: 'GPT Image' },
    { id: 'cover-one-ref', modelId: 'qwen-image-edit', name: 'Qwen' },
  );
  try {
    const refs = ['https://example.com/product.webp', 'data:image/webp;base64,UklGRg=='];
    const title = '原文 PHONE-20，NEED_INPUT @图片99 --ar 16:9 限制：标题';
    const design = normalizeBatchCoverPrompt(JSON.stringify({
      layout: 'PHONE-01', composition: '主体居中', background: '保留真实材质与光线。'.repeat(100),
      product: '按 @图片1 保留镜头', titleLines: [
        { text: '原文 PHONE-20，', size: '大', position: '顶部', style: '粗白' },
        { text: 'NEED_INPUT @图片99 --ar 16:9 限制：标题', size: '小', position: '第二行', style: '细白' },
      ], typography: '圆黑体', lighting: '左侧窗光', constraints: '保留商品颜色',
    }), 'PHONE-01', title);
    for (const [ratio, size] of [['4:3', '4096x3072'], ['3:4', '3072x4096']]) {
      const { prompt } = coverLayoutImageInput(design, ratio)!;
      const request: StudioRequest = {
        taskId: 'cover-two-refs', model: 'beike:image:cover-test',
        prompt, refs, ratio, requiresCoverStyleReference: true,
      };
      const task = prepareStudioGeneration(request)!.task;
      expect(task.referenceImages).toEqual(refs);
      expect(task.prompt).toBe(prompt);
      expect(() => validateCoverPromptFormat(task.prompt, title)).not.toThrow();
      expect(task.size).toBe(size);
      expect(() => prepareStudioGeneration({ ...request, model: 'beike:image:cover-one-ref' }))
        .toThrow('不支持同时使用商品图和版式图');
    }
  } finally {
    imageRoutes.length = 0;
  }
});

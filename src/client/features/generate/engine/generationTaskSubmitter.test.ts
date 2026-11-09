import {beforeEach,expect,it,vi} from 'vitest';
import type {GenerationTask} from '@client/store';
import {submitSingleGenerationTask} from './generationTaskSubmitter';
const mocks=vi.hoisted(()=>({tasks:[] as GenerationTask[],fetch:vi.fn(),compress:vi.fn(),headers:vi.fn(),credentials:vi.fn()}));
vi.mock('@client/store',()=>({useAppStore:{getState:()=>({generationTasks:mocks.tasks,sessions:[]})}}));
vi.mock('@client/shared/api/apiClient',()=>({apiFetch:mocks.fetch,readClientStorageConfig:()=>({}),storageConfigHeaders:()=>({})}));
vi.mock('@client/shared/api/gatewayClient',()=>({getGatewayClientHeaders:mocks.headers,getModelCredentials:mocks.credentials,getGatewayClientOverrides:()=>({customBaseUrl:''})}));
vi.mock('@client/shared/media/image-utils',()=>({compressImageForSubmission:mocks.compress}));
vi.mock('@client/shared/media/refMediaRegistry',()=>({resolveRefMediaFile:()=>undefined,resolveRefMediaKind:()=>undefined}));
vi.mock('@shared/domain/media/videoCapabilities',async importOriginal=>({...await importOriginal<typeof import('@shared/domain/media/videoCapabilities')>(),videoInputError:()=>null}));
vi.mock('@shared/domain/core/latencyAudit',()=>({logLatencyAudit:()=>{}}));
vi.mock('@client/shared/utils/usageScope', async importOriginal => ({ ...await importOriginal<typeof import('@client/shared/utils/usageScope')>(), createUsageScope: () => ({}) }));
beforeEach(()=>{vi.clearAllMocks();mocks.headers.mockReturnValue({});mocks.credentials.mockReturnValue({});mocks.fetch.mockResolvedValue(Response.json({success:true,resultUrl:'/storage/result.mp4'}));mocks.compress.mockImplementation(async source=>`data:image/png;base64,${source.includes('first')?'FIRST':'LAST'}`);});
it('submits restored local first/last frames consistently in both the ordered list and explicit fields',async()=>{
 const task={id:'restored-frame-retry',prompt:'转身',model:'video-model',status:'IN_PROGRESS',mediaType:'video',videoRefMode:'first_last_frame',referenceImages:['blob:https://example.test/restored-first','blob:https://example.test/restored-last'],firstFrameImage:'blob:https://example.test/restored-first',lastFrameImage:'blob:https://example.test/restored-last'} as GenerationTask;
 mocks.tasks=[task];const update=vi.fn();
 await submitSingleGenerationTask(task,update,{},new Set());
 const body=JSON.parse(mocks.fetch.mock.calls[0][1].body);
 expect(body).toMatchObject({images:['data:image/png;base64,FIRST','data:image/png;base64,LAST'],first_frame_image:'data:image/png;base64,FIRST',last_frame_image:'data:image/png;base64,LAST'});
 expect(mocks.compress).toHaveBeenCalledTimes(2);
 expect(update).toHaveBeenCalledWith(task.id,expect.objectContaining({status:'SUCCESS',resultUrl:'/storage/result.mp4'}));
});

it('sends stored audio as a separate video input rather than as a visual frame',async()=>{
 const task={id:'audio-video',prompt:'参考 @音频1',model:'MiniMax-H3',status:'IN_PROGRESS',mediaType:'video',videoRefMode:'omni',generateAudio:true,referenceAudioUrls:['/storage/local/audio/voice.wav']} as GenerationTask;
 mocks.tasks=[task];
 await submitSingleGenerationTask(task,vi.fn(),{},new Set());
 const [path,options]=mocks.fetch.mock.calls[0];
 expect(path).toBe('/api/generate/video');
 expect(JSON.parse(options.body)).toMatchObject({ref_mode:'omni',images:[],videos:[],audios:['/storage/local/audio/voice.wav'],audio:true});
 expect(mocks.compress).not.toHaveBeenCalled();
});

it('uses the selected image route for both request headers and the body template',async()=>{
 const selected='image-template-route';
 const template={imageField:'selected-image'};
 mocks.headers.mockImplementation((route:string)=>route===selected?{'x-custom-protocol':'template','x-custom-base-url':'https://selected.example'}:{});
 mocks.credentials.mockImplementation((route:string)=>route===selected?{protocol:'template',baseUrl:'https://selected.example',requestTemplate:template}:{requestTemplate:{imageField:'wrong-channel'}});
 const task={id:'image-route',prompt:'产品照片',model:'shared-image-model',modelRouteKey:selected,status:'IN_PROGRESS',mediaType:'image',size:'1024x1024'} as GenerationTask;
 mocks.tasks=[task];
 await submitSingleGenerationTask(task,vi.fn(),{},new Set());
 const [path,options]=mocks.fetch.mock.calls[0];
 expect(path).toBe('/api/generate/image');
 expect(JSON.parse(options.body)).toMatchObject({model:'shared-image-model',customBaseUrl:'https://selected.example',customProtocol:'template',requestTemplate:template});
});

it.each([
 {status:504,body:{success:false,error:'gateway timeout'}},
 {status:200,body:{success:true}},
])('keeps an incomplete submission response ($status) in receipt recovery',async({status,body})=>{
 const task={id:'studio-lost-response',prompt:'视频',model:'MiniMax-H3',status:'IN_PROGRESS',mediaType:'video',videoRefMode:'omni'} as GenerationTask;
 mocks.tasks=[task];
 mocks.fetch.mockResolvedValueOnce(Response.json(body,{status}));
 const update=vi.fn();
 await submitSingleGenerationTask(task,update,{},new Set());
 expect(mocks.fetch).toHaveBeenCalledTimes(1);
 expect(update).toHaveBeenLastCalledWith(task.id,expect.objectContaining({status:'IN_PROGRESS',submissionRecoveryRequired:true}));
});

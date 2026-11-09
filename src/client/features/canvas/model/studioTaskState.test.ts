import { afterEach, expect, it, vi } from 'vitest';
import type { GenerationTask } from '@client/store';
import { claimGenerationDispatch, finishGenerationDispatch, subscribeGenerationPreparationStop } from '@client/shared/api/generation/generationDispatch';
const mocks=vi.hoisted(()=>({tasks:[] as GenerationTask[],update:vi.fn(),attempt:vi.fn(),fetch:vi.fn()}));
vi.mock('@client/store',()=>({useAppStore:{getState:()=>({generationTasks:mocks.tasks,sessions:[],generationHistoryReady:true,updateGenerationTask:mocks.update})}}));
vi.mock('@client/shared/api/apiClient',()=>({apiFetch:mocks.fetch,storageConfigHeaders:()=>({})}));
vi.mock('@client/shared/api/gatewayClient',()=>({getGatewayClientHeaders:()=>({'x-custom-base-url':'https://comfly.test'})}));
vi.mock('@client/shared/media/generationAttempt',()=>({createGenerationAttemptId:()=> 'new-batch',prepareGenerationAttempt:mocks.attempt}));
import {
  prepareStudioRetry,
  recoverStudioIdleNode,
  recoverStudioPromptReview,
  recoverStudioTaskRecord,
  restoreStudioTaskResult,
  stopStudioNode,
  stopStudioTask,
  studioGenerationFailure,
  studioMediaRunBlock,
  studioNodeTaskId,
  studioProjectGenerationHistory,
} from './studioTaskState';
import type { StudioScene } from './types';

const task=(fields:Partial<GenerationTask>={})=>({id:'node-task',status:'IN_PROGRESS',prompt:'original',model:'video',referenceImages:['data:image/png;base64,photo','data:video/mp4;base64,movie'],referenceVideoUrls:['data:video/mp4;base64,movie'],...fields}) as GenerationTask;
afterEach(()=>{vi.clearAllMocks();mocks.tasks=[];finishGenerationDispatch('node-task');});

it('recovers a persisted preflight lock while retaining errors, media and all versions',()=>{
  const node={id:'image',type:'gen-image',isGenerating:false,errorMsg:'参考类型不兼容',content:'/storage/old.png',
    settings:{isGenerating:true,generationVersions:[{content:'/storage/old.png'}]}};
  expect(recoverStudioIdleNode(node)).toEqual({...node,settings:{...node.settings,isGenerating:false}});
  expect(node.settings.isGenerating).toBe(true);
});

it('keeps an unapproved draft on refresh while preventing submission recovery',()=>{
  const node={id:'video',type:'gen-video',isGenerating:true,beikeTaskId:'preview',beikePromptReviewPending:true,
    beikePromptOptimization:{skillId:'sd25-pe',optimized:'AI 稿',draft:'用户正在修改的草稿'},
    beikeTaskRecord:{id:'preview',model:'video',prompt:'draft'},settings:{isGenerating:true,generationVersions:[{content:'/storage/old.mp4'}]}};
  const restored=recoverStudioPromptReview(node);
  expect(restored).toMatchObject({isGenerating:false,beikePromptReviewPending:false,content:'/storage/old.mp4',beikePromptOptimization:node.beikePromptOptimization});
  expect(restored.beikeTaskId).toBeUndefined();expect(restored.beikeTaskRecord).toBeUndefined();
  expect(recoverStudioTaskRecord(restored)).toBeUndefined();
});
it('does not unlock an active or tracked backend task',()=>{
  for(const state of [{isGenerating:true},{isGenerating:false,beikeTaskId:'pending'}]) {
    const node={id:'image',type:'gen-image',...state,settings:{isGenerating:true}};
    expect(recoverStudioIdleNode(node)).toBe(node);
  }
});
it('releases both busy indicators on failure so a corrected reference can be resubmitted',()=>{
  const settings={model:'image',isGenerating:true,progress:50,generationVersions:[{content:'/storage/old.png'}]};
  expect(studioGenerationFailure(settings,'请替换参考')).toEqual({beikeTaskId:undefined,beikePromptOptimizing:false,isGenerating:false,errorMsg:'请替换参考',
    settings:{...settings,_preGenerateSnapshot:undefined,isGenerating:false,progress:0,error:'请替换参考'}});
  expect(settings.isGenerating).toBe(true);
});
it('stops waiting without losing the existing result, version history or recovery identity',()=>{
  const node={id:'image',type:'gen-image',isGenerating:true,beikeTaskId:'pending',content:'/storage/old.png',
    settings:{isGenerating:true,generationVersions:[{id:'old',content:'/storage/old.png'}]}};
  const stopped=stopStudioNode(node,'pending');
  expect(stopped).toEqual({...node,beikeTaskId:undefined,beikeTaskRecord:undefined,beikeLastTaskId:'pending',beikeTaskStopped:true,beikePromptOptimizing:false,isGenerating:false,errorMsg:undefined,
    settings:{...node.settings,_preGenerateSnapshot:undefined,isGenerating:false,progress:0,error:undefined}});
  expect(studioNodeTaskId(stopped)).toBe('pending');expect(stopStudioNode(node,'stale-attempt')).toBe(node);
});
it('restores the selected old result after native pre-generation clears content, rather than losing it on cancel/failure',()=>{
  const node={id:'image',type:'gen-image',content:'',imageUrl:'/storage/latest.png',settings:{
    generationVersions:[{content:'/storage/selected.png'},{content:'/storage/latest.png'}],activeGenerationVersionIndex:0}};
  expect(restoreStudioTaskResult(node).content).toBe('/storage/selected.png');
  expect(restoreStudioTaskResult({...node,content:'/storage/current.png'}).content).toBe('/storage/current.png');
});

it('recovers a saved task intent by its original key and fixed references without dispatching another attempt',()=>{
  const record={id:'original',model:'configured-route',prompt:'original prompt',status:'IN_PROGRESS' as const,createdAt:1,
    referenceImages:['data:image/png;base64,original'],referenceVideoUrls:['/storage/reference.mp4'],duration:5};
  const node={id:'video',type:'gen-video',isGenerating:true,beikeTaskId:'original',beikeTaskRecord:record};
  const recovered=recoverStudioTaskRecord(node);
  expect(recovered).toEqual({...record,resultUrl:undefined,submissionRecoveryRequired:true,
    failReason:'正在核对上次提交结果，请勿重复生成'});
  expect(recovered).not.toBe(record);expect(record).not.toHaveProperty('submissionRecoveryRequired');
  for(const patch of [{isGenerating:false},{beikePromptReviewPending:true},{beikeTaskStopped:true},{beikeTaskId:'new-attempt'},{beikeTaskRecord:undefined},
    {beikeTaskRecord:{...record,model:undefined}}])expect(recoverStudioTaskRecord({...node,...patch})).toBeUndefined();
});

it('keeps a stopped node receipt recoverable if the generation archive was not flushed before reload',()=>{
 const audio='/storage/local/audio/reference.wav';
 const record={id:'original',model:'MiniMax-H3',prompt:'original',referenceAudioUrls:[audio]};
 const node={id:'video',type:'gen-video',isGenerating:true,beikeTaskId:record.id,beikeTaskRecord:record};
 const stopped=stopStudioNode(node,record.id);
 expect(stopped).toMatchObject({beikeTaskStopped:true,isGenerating:false,beikeTaskRecord:record});
 expect(recoverStudioTaskRecord(stopped)).toMatchObject({id:record.id,submissionRecoveryRequired:true,referenceAudioUrls:[audio]});
});

it('cancels only the chosen unsubmitted job and keeps the history record',()=>{
  mocks.tasks=[task(),task({id:'another'})];
  const stop=vi.fn(),unsubscribe=subscribeGenerationPreparationStop(stop);
  try {
    stopStudioTask('node-task');
    expect(mocks.update).toHaveBeenCalledWith('node-task',expect.objectContaining({status:'FAILURE',failReason:'已取消，任务尚未提交'}));
    expect(stop).toHaveBeenCalledExactlyOnceWith('node-task');expect(mocks.tasks).toHaveLength(2);
  } finally{unsubscribe();}
});
it.each([{taskId:'accepted'},{submissionRecoveryRequired:true},{}])('keeps a dispatched or unconfirmed operation recoverable (%j)',fields=>{
  mocks.tasks=[task(fields)];if(!Object.keys(fields).length)claimGenerationDispatch('node-task');
  const stop=vi.fn(),unsubscribe=subscribeGenerationPreparationStop(stop);
  try {stopStudioTask('node-task');expect(mocks.update).not.toHaveBeenCalled();expect(stop).not.toHaveBeenCalled();}
  finally{unsubscribe();}
});
it('creates a separate attempt from the exact failed task references and parameters',async()=>{
  const failed=task({status:'FAILURE',taskId:'failed-upstream',resultUrl:undefined});mocks.tasks=[failed];
  const next={...failed,id:'new-attempt',taskId:undefined};mocks.attempt.mockResolvedValueOnce(next);
  expect(await prepareStudioRetry(failed.id)).toBe(next);
  expect(mocks.attempt).toHaveBeenCalledWith(failed,'new-batch');expect(failed.taskId).toBe('failed-upstream');
});
it('does not retry while an original receipt is unknown or after it completes',async()=>{
  for(const pending of [task({submissionRecoveryRequired:true}),task(),task({status:'SUCCESS',resultUrl:'/storage/result.mp4'})]) {
    mocks.tasks=[pending];await expect(prepareStudioRetry(pending.id)).rejects.toThrow();
  }
  expect(mocks.attempt).not.toHaveBeenCalled();
});

it('queries the original Comfly receipt before retrying and blocks a changed channel',async()=>{
 const failed=task({status:'FAILURE',mediaType:'video',taskId:'accepted-video',dbId:'receipt',modelRouteKey:'comfly-entry',
   referenceAudioUrls:['/storage/local/audio/reference.wav']});mocks.tasks=[failed];
 mocks.fetch.mockResolvedValueOnce(Response.json({code:'task_route_changed',submissionUnknown:true,error:'请恢复原渠道'},{status:409}));
 await expect(prepareStudioRetry(failed.id)).rejects.toThrow('请恢复原渠道');
 expect(mocks.attempt).not.toHaveBeenCalled();
 const [url,options]=mocks.fetch.mock.calls[0];
 expect(String(url)).toContain('taskId=accepted-video');
 expect(String(url)).toContain('recheck_failed=1');
 expect(options.headers).toMatchObject({'x-task-record-id':'receipt'});
 expect(options.method).toBeUndefined();
 mocks.fetch.mockResolvedValueOnce(Response.json({success:true,status:'FAILURE',failReason:'已确认失败'}));
 const next={...failed,id:'new-attempt',taskId:undefined};mocks.attempt.mockResolvedValueOnce(next);
 await expect(prepareStudioRetry(failed.id)).resolves.toMatchObject({referenceAudioUrls:failed.referenceAudioUrls});
});

it('recovers an existing successful result instead of making a second generation',async()=>{
 const failed=task({status:'FAILURE',mediaType:'image',taskId:'old-image'});mocks.tasks=[failed];
 mocks.fetch.mockResolvedValueOnce(Response.json({success:true,status:'SUCCESS',resultUrl:'/storage/original.png'}));
 await expect(prepareStudioRetry(failed.id)).rejects.toThrow('原任务已完成');
 expect(mocks.update).toHaveBeenCalledWith(failed.id,expect.objectContaining({status:'SUCCESS',resultUrl:'/storage/original.png'}));
 expect(mocks.attempt).not.toHaveBeenCalled();
});

it('stopping a node does not permit another run while its previous task is unresolved',()=>{
 mocks.tasks=[task({submissionRecoveryRequired:true})];
 expect(studioMediaRunBlock('node-task')).toContain('继续等待');
 mocks.tasks=[task({status:'FAILURE',submissionRecoveryRequired:false})];
 expect(studioMediaRunBlock('node-task')).toBeUndefined();
});

const media=(id:string,patch:Partial<GenerationTask>={}):GenerationTask=>({
  id,mediaType:'video',model:'video-model',prompt:'Original prompt',title:'Generation',status:'SUCCESS',
  size:'',quality:'',progress:'100%',createdAt:2,useReferenceImage:false,...patch,
});
it('lists distinct attempts and saved versions, merging archive copies by task identity',()=>{
  const scene:StudioScene={nodes:[
    {id:'video',type:'gen-video',beikeLastTaskId:'unsubmitted',errorMsg:'输入已变更',settings:{generationVersions:[
      {id:'old-only',content:'/old.mp4',createdAt:1},
      {id:'original',content:'/same.mp4',createdAt:2},
    ]}},
    {id:'compose',type:'gen-video',content:'/compose.webm',settings:{beikeOperation:'compose-original',generationVersions:[{id:'local',content:'/compose.webm'}]}},
    {id:'idle',type:'gen-image'},
  ],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
  const original=media('original',{referenceAudioUrls:['/reference.wav']});
  const recent=media('recent',{canvasProjectId:'project',resultUrl:'/same.mp4',createdAt:3});
  const foreign=media('foreign',{canvasProjectId:'other'});
  const entries=studioProjectGenerationHistory('project',scene,[original,recent,foreign],[{
    id:'project-session',canvasProjectId:'project',createdAt:1,title:'Project',tasks:[original,foreign],
  }]);
  expect(entries.map(entry=>entry.id)).toEqual(['recent','original','old-only']);
  expect(entries[1]).toMatchObject({result:'/same.mp4',node:{id:'video'},task:{referenceAudioUrls:['/reference.wav']}});
  expect(entries[2]).toMatchObject({result:'/old.mp4',kind:'video'});
});

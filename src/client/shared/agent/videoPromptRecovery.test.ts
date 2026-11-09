import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {optimizeVideoPrompt} from './videoPromptOptimizer';
import {apiFetch} from '@client/shared/api/apiClient';
import {modalityPickerSelections} from '@shared/domain/models/modalityStorage';
vi.mock('@client/shared/api/apiClient',()=>({apiFetch:vi.fn()}));
vi.mock('@client/shared/api/gatewayClient',()=>({getMultimodalClientOverrides:()=>({customApiKey:'private-original'})}));
vi.mock('@client/shared/utils/modelUsage',()=>({recordChatTokens:vi.fn()}));
vi.mock('@client/shared/utils/textOperationUsage',()=>({prepareTextOperationUsage:vi.fn(),replayTextOperationUsage:vi.fn()}));
vi.mock('@client/store',()=>({useAppStore:{getState:()=>({assistantModel:'text-route'})}}));
vi.mock('@shared/domain/models/modalityStorage',()=>({modalityPickerSelections:vi.fn()}));
vi.mock('@shared/domain/models/workflowModels',()=>({getEnabledMultimodalModelsFromSettings:()=>[],readWorkflowModelsFromStorage:()=>({})}));
const input={model:'wan3.0-video',prompt:'original',images:0,videos:0};
const context={projectId:'project',nodeId:'node',stage:'compiler' as const,runId:'original',inputKey:'binding'};
const result=()=>Response.json({operationKey:'original',choices:[{finish_reason:'stop',message:{content:'optimized'}}],usage:{total_tokens:7}});
beforeEach(()=>{
 vi.resetAllMocks();const rows=new Map<string,string>();vi.stubGlobal('window',{});
 vi.stubGlobal('localStorage',{getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>rows.set(key,value)});
 const queues=new Map<string,Promise<unknown>>();vi.stubGlobal('navigator',{locks:{request:(key:string,_opts:unknown,fn:()=>unknown)=>{const next=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(key,next);return next;}}});
 vi.mocked(modalityPickerSelections).mockReturnValue([{id:'text-route',name:'Text',entryId:'text-route',modelId:'text'}]);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
it('S12 lost optimization response remains GET-only after input and model changes',async()=>{
 vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost after dispatch'));
 await expect(optimizeVideoPrompt(input,new AbortController().signal,context)).rejects.toMatchObject({recoveryRequired:true});
 vi.mocked(modalityPickerSelections).mockReturnValue([]);vi.mocked(apiFetch).mockResolvedValueOnce(result());
 const recovered=await optimizeVideoPrompt({...input,prompt:'changed',model:'unsupported'},new AbortController().signal,{...context,runId:'replacement'});
 expect(recovered).toMatchObject({original:'original',optimized:'optimized',inputKey:'binding'});
 expect(vi.mocked(apiFetch).mock.calls.map(([url,init])=>[url,init?.method||'GET'])).toEqual([['/api/generate/canvas-text','POST'],['/api/generate/canvas-text?operationKey=original','GET']]);
});
it('S12 operation snapshot and scene are durable before POST and contain no credentials',async()=>{
 const {readVideoPromptOperation}=await import('./videoPromptOperation');
 const save=vi.fn(async(id:string)=>expect(readVideoPromptOperation(context)?.id).toBe(id));
 vi.mocked(apiFetch).mockImplementationOnce(async(_url,init)=>{
  expect(save).toHaveBeenCalledWith('original');
  expect(init?.headers).toMatchObject({'x-idempotency-key':'original'});
  expect(JSON.parse(init?.body as string)).toMatchObject({clientTaskId:'original'});
  expect(JSON.stringify(readVideoPromptOperation(context))).not.toContain('private-original');return result();
 });
 await optimizeVideoPrompt(input,new AbortController().signal,{...context,onOperation:save});
});
it.each([404,409,503,401])('S12 recovery HTTP %s cannot authorize a replacement key',async status=>{
 vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost'));
 await expect(optimizeVideoPrompt(input,new AbortController().signal,context)).rejects.toThrow();
 vi.mocked(apiFetch).mockImplementation(async()=>Response.json({submissionUnknown:true},{status}));
 for(const runId of ['replacement','another'])await expect(optimizeVideoPrompt(input,new AbortController().signal,{...context,runId})).rejects.toMatchObject({recoveryRequired:true});
 expect(vi.mocked(apiFetch).mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
it.each([{submissionUnknown:true,submissionRejected:true},{choices:[{finish_reason:'length',message:{content:'partial'}}]},{choices:[]},{operationKey:'different',choices:[{finish_reason:'stop',message:{content:'wrong'}}]}])('S12 uncertain or mismatched receipts stay query-only (%j)',async data=>{
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(data));
 await expect(optimizeVideoPrompt(input,new AbortController().signal,context)).rejects.toMatchObject({recoveryRequired:true});
 vi.mocked(apiFetch).mockResolvedValueOnce(result());await optimizeVideoPrompt(input,new AbortController().signal,{...context,runId:'next'});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
});
it('S12 simultaneous tabs dispatch one paid optimization',async()=>{
 vi.mocked(apiFetch).mockImplementation(async(_url,init)=>init?.method==='POST'?result():Response.json({submissionUnknown:true},{status:409}));
 await Promise.allSettled([optimizeVideoPrompt(input,new AbortController().signal,context),optimizeVideoPrompt(input,new AbortController().signal,{...context,runId:'second-tab'})]);
 expect(vi.mocked(apiFetch).mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
it('S12 completed stages are reused by automatic/stale runs; a new acknowledged user intent can POST',async()=>{
 vi.mocked(apiFetch).mockResolvedValueOnce(result());await optimizeVideoPrompt(input,new AbortController().signal,context);
 await optimizeVideoPrompt(input,new AbortController().signal,context);
 await optimizeVideoPrompt(input,new AbortController().signal,{...context,runId:'stale-tab'});
 expect(apiFetch).toHaveBeenCalledOnce();
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({choices:[{finish_reason:'stop',message:{content:'new optimized'}}]}));
 await optimizeVideoPrompt(input,new AbortController().signal,{...context,runId:'explicit',previousOperationId:'original'});
 expect(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.headers).toMatchObject({'x-idempotency-key':'explicit'});
});
it.each(['throw','silent','corrupt','no-lock'])('S12 %s storage/locking fault blocks dispatch',async kind=>{
 if(kind==='throw')vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('full')});
 if(kind==='silent')vi.spyOn(localStorage,'setItem').mockImplementation(()=>{});
 if(kind==='corrupt')vi.spyOn(localStorage,'getItem').mockReturnValue('{broken');
 if(kind==='no-lock')vi.stubGlobal('navigator',{});
 await expect(optimizeVideoPrompt(input,new AbortController().signal,context)).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled();
});
it('S12 failed scene persistence is known preflight failure and does not dispatch',async()=>{
 await expect(optimizeVideoPrompt(input,new AbortController().signal,{...context,onOperation:()=>{throw Error('scene full')}})).rejects.toMatchObject({submissionRejected:true});
 expect(apiFetch).not.toHaveBeenCalled();vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({choices:[{finish_reason:'stop',message:{content:'retry'}}]}));
 await optimizeVideoPrompt(input,new AbortController().signal,{...context,runId:'explicit',previousOperationId:'original'});expect(apiFetch).toHaveBeenCalledOnce();
});
it('S12 failed completion persistence leaves the operation pending for GET recovery',async()=>{
 vi.mocked(apiFetch).mockImplementationOnce(async()=>{vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('full')});return result()});
 await expect(optimizeVideoPrompt(input,new AbortController().signal,context)).rejects.toMatchObject({recoveryRequired:true});vi.restoreAllMocks();
 vi.mocked(apiFetch).mockResolvedValueOnce(result());await optimizeVideoPrompt(input,new AbortController().signal,{...context,runId:'retry'});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
});
it('S12 legacy scenes with missing original snapshots cannot invent a replacement key',async()=>{
 await expect(optimizeVideoPrompt(input,new AbortController().signal,{...context,recoveryOnly:true})).rejects.toThrow();
 await expect(optimizeVideoPrompt(input,new AbortController().signal,{...context,previousOperationId:'legacy'})).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled();
});
it('S12 compiler/video stages, nodes, projects and workspaces have separate ownership',async()=>{
 vi.mocked(apiFetch).mockImplementation(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'stage result'}}]}));
 for(const scope of [{},{stage:'video' as const},{nodeId:'other'},{projectId:'other'}])await optimizeVideoPrompt(input,new AbortController().signal,{...context,...scope});
 localStorage.setItem('beike_workspace_secret','other-workspace-'.repeat(3));await optimizeVideoPrompt(input,new AbortController().signal,context);
 expect(apiFetch).toHaveBeenCalledTimes(5);
});
it('S12 workspace changes during scene save cannot dispatch under another owner',async()=>{
 await expect(optimizeVideoPrompt(input,new AbortController().signal,{...context,onOperation:()=>{localStorage.setItem('beike_workspace_secret','other-workspace-'.repeat(3))}})).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled();
});
it('S12 closing during the request and reopening recovers the original stage',async()=>{
 const controller=new AbortController();vi.mocked(apiFetch).mockImplementationOnce(async()=>{controller.abort();return result()});
 await expect(optimizeVideoPrompt(input,controller.signal,context)).rejects.toMatchObject({recoveryRequired:true});
 vi.mocked(apiFetch).mockResolvedValueOnce(result());
 const {recoverVideoPromptOptimization}=await import('./videoPromptOptimizer');
 const value=await recoverVideoPromptOptimization({...context,runId:'reopened'},new AbortController().signal);
 expect(value).toMatchObject({operationId:'original',original:'original'});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
});
it('S12 explicit server rejection releases recovery and a later acknowledged intent may retry',async()=>{
 const resolved=vi.fn(async()=>{});vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({submissionRejected:true,error:'invalid inputs'},{status:400}));
 await expect(optimizeVideoPrompt(input,new AbortController().signal,{...context,onResolved:resolved})).rejects.toMatchObject({submissionRejected:true});
 expect(resolved).toHaveBeenCalledOnce();vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({choices:[{finish_reason:'stop',message:{content:'retry optimized'}}]}));
 await optimizeVideoPrompt(input,new AbortController().signal,{...context,runId:'retry',previousOperationId:'original'});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','POST']);
});
it('S12 an optimizer module reload still queries the original saved stage',async()=>{
 vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost'));await expect(optimizeVideoPrompt(input,new AbortController().signal,context)).rejects.toThrow();
 vi.resetModules();const fresh=await import('./videoPromptOptimizer');const {apiFetch:freshFetch}=await import('@client/shared/api/apiClient');
 vi.mocked(freshFetch).mockResolvedValueOnce(result());
 expect(await fresh.recoverVideoPromptOptimization({...context,runId:'reload'},new AbortController().signal)).toMatchObject({operationId:'original',optimized:'optimized'});
 expect(vi.mocked(freshFetch).mock.calls.at(-1)?.[0]).toBe('/api/generate/canvas-text?operationKey=original');
});
it('S12 two nodes finishing in reverse order retain their own operations and drafts',async()=>{
 const releases=new Map<string,(response:Response)=>void>();
 vi.mocked(apiFetch).mockImplementation(async(_url,init)=>new Promise<Response>(resolve=>{releases.set(JSON.parse(init?.body as string).clientTaskId,resolve);}));
 const first=optimizeVideoPrompt(input,new AbortController().signal,{...context,nodeId:'first-node',runId:'first'});
 const second=optimizeVideoPrompt({...input,prompt:'second-input'},new AbortController().signal,{...context,nodeId:'second-node',runId:'second'});
 await vi.waitFor(()=>expect(releases.size).toBe(2));
 releases.get('second')!(Response.json({operationKey:'second',choices:[{finish_reason:'stop',message:{content:'second-result'}}]}));
 expect(await second).toMatchObject({operationId:'second',original:'second-input',optimized:'second-result'});
 releases.get('first')!(Response.json({operationKey:'first',choices:[{finish_reason:'stop',message:{content:'first-result'}}]}));
 expect(await first).toMatchObject({operationId:'first',original:'original',optimized:'first-result'});
 const {readVideoPromptOperation}=await import('./videoPromptOperation');
 expect(readVideoPromptOperation({...context,nodeId:'first-node'})?.result?.operationId).toBe('first');
 expect(readVideoPromptOperation({...context,nodeId:'second-node'})?.result?.operationId).toBe('second');
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { clearUsageLogs, getUsageLogs } from '@client/shared/utils/usageTracker';
import { readCanvasTextOperation, requestCanvasText } from './canvasTextRequest';
import { cloneCanvasProject } from './creativeWorkflowProjects';
import type { StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';
import { recoverStudioTextNode, recoverStudioTextRun, studioTextRequest } from './videoWorkflowRecovery';

const chatRoutes = vi.hoisted(() => [{ id: 'test', modelId: 'actual', name: 'test' }]);
vi.mock('@client/shared/api/apiClient',()=>({apiFetch:vi.fn()}));
vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: vi.fn(() => ({ textProtocol: 'openai' })), getGatewayClientHeaders: () => ({}) }));
vi.mock('@shared/domain/models/modalityStorage', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/domain/models/modalityStorage')>(),
  modalityPickerSelections: (kind: string) => kind === 'chat' ? chatRoutes : [],
}));

const context={projectId:'project',nodeId:'analysis',runId:'original'};
const body=vi.fn(()=>({model:'test',messages:[{role:'user',content:'analyse'}]}));
const result=()=>Response.json({success:true,operationKey:'original',choices:[{finish_reason:'stop',message:{content:'original result'}}]});
const run=(extra={})=>requestCanvasText(body,{...context,...extra},new AbortController().signal);
let nodes:StudioScene['nodes'],commands:StudioTaskCommands;
const save=vi.fn(async()=>{});
const payload=(nodeId='analysis',runId='original')=>({model:'beike:chat:test',messages:[{role:'user',content:'analyse'}],beikeTextContext:{nodeId,runId}});
const complete=(id='original')=>Response.json({success:true,operationKey:id,choices:[{finish_reason:'stop',message:{content:'saved final result'}}]});

beforeEach(()=>{
 vi.resetAllMocks();body.mockReturnValue({model:'test',messages:[{role:'user',content:'analyse'}]});
 chatRoutes.splice(0, chatRoutes.length, { id: 'test', modelId: 'actual', name: 'test' });
 vi.mocked(getMultimodalClientOverrides).mockReturnValue({ textProtocol: 'openai' });
 const rows=new Map<string,string>();
 vi.stubGlobal('window',{ addEventListener: () => {}, dispatchEvent: () => true });
 vi.stubGlobal('localStorage',{getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>rows.set(k,v),removeItem:(k:string)=>rows.delete(k),key:(i:number)=>[...rows.keys()][i]??null,get length(){return rows.size;}});
 localStorage.setItem('beike_workspace_secret','original-workspace-'.repeat(3));
 const locks=new Map<string,Promise<unknown>>();vi.stubGlobal('navigator',{locks:{request:(key:string,_opts:unknown,fn:()=>unknown)=>{const next=(locks.get(key)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(key,next);return next;}}});
 nodes=[{id:'analysis',type:'text-node',settings:{text:'old content'}},{id:'other',type:'text-node',settings:{text:'other content'}}];
 commands={read:()=>({nodes,connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}}),update:(id,_expected,patch)=>{const node=nodes.find(n=>n.id===id)!;Object.assign(node,{...patch,settings:{...(node.settings as object),...(patch.settings as object)}})},run:async()=>{},stop:()=>{}};
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
it('S11 saves operation and scene before first POST, then unknown retries use original GET despite changed input/channel',async()=>{
 const saveOp=vi.fn(async(id:string)=>{expect(readCanvasTextOperation(context)?.id).toBe(id)});
 vi.mocked(apiFetch).mockImplementationOnce(async()=>{expect(saveOp).toHaveBeenCalledWith('original');throw Error('lost reply')});
 await expect(run({onOperation:saveOp})).rejects.toMatchObject({recoveryRequired:true});
 body.mockImplementation(()=>{throw Error('old model removed')});vi.mocked(apiFetch).mockResolvedValueOnce(result());
 await run({runId:'new-proposal'});
 expect(vi.mocked(apiFetch).mock.calls.map(([url,init])=>[url,init?.method||'GET'])).toEqual([['/api/generate/canvas-text','POST'],['/api/generate/canvas-text?operationKey=original','GET']]);
 expect(body).toHaveBeenCalledOnce();
});
it.each([404,409,503,401])('S11 recovery HTTP %s cannot authorize a fresh key',async status=>{
 vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost'));await expect(run()).rejects.toThrow();
 vi.mocked(apiFetch).mockImplementation(async()=>Response.json({submissionUnknown:true},{status}));
 await expect(run({runId:'new'})).rejects.toThrow();await expect(run({runId:'another'})).rejects.toThrow();
 expect(vi.mocked(apiFetch).mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
it.each([{submissionUnknown:true,submissionRejected:true},{success:true,choices:[]},{success:true,choices:[{finish_reason:'length',message:{content:'partial'}}]}])('S11 unknown/rejection conflicts and invalid output remain query-only (%j)',async value=>{
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(value));await expect(run()).rejects.toMatchObject({recoveryRequired:true});
 vi.mocked(apiFetch).mockResolvedValueOnce(result());await run({runId:'retry'});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
});
it('S11 simultaneous tabs share one intent and issue only one POST',async()=>{
 vi.mocked(apiFetch).mockImplementation(async(_url,init)=>init?.method==='POST'?result():Response.json({submissionUnknown:true},{status:409}));
 await Promise.allSettled([run(),run({runId:'other-tab'})]);
 expect(vi.mocked(apiFetch).mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
it('S11 automatic retries within one run and stale completed tabs cannot generate again; explicit acknowledged run can',async()=>{
 vi.mocked(apiFetch).mockImplementation(async()=>result());await run();await run();await run({runId:'stale'});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET','GET']);
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({success:true,text:'new result',operationKey:'explicit'}));
 await run({runId:'explicit',previousOperationId:'original'});
 expect(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.method).toBe('POST');
});
it('S11 saves legacy scene identity and queries it without creating a new paid intent',async()=>{
 vi.mocked(apiFetch).mockResolvedValueOnce(result());await run({runId:'proposal',previousOperationId:'original',recoveryOnly:true});
 expect(body).not.toHaveBeenCalled();expect(apiFetch).toHaveBeenCalledWith('/api/generate/canvas-text?operationKey=original',expect.anything());
});
it('S11 legacy missing identity and corrupt storage block submission',async()=>{
 await expect(run({recoveryOnly:true})).rejects.toThrow();
 vi.stubGlobal('localStorage',{getItem:()=>'{broken',setItem:vi.fn()});await expect(run()).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled();
});
it.each(['throw','silent'])('S11 %s operation storage failure blocks dispatch',async mode=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{if(mode==='throw')throw Error('full')});await expect(run()).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled();
});
it('S11 absent cross-tab locking blocks dispatch',async()=>{vi.stubGlobal('navigator',{});await expect(run()).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled()});
it('S11 failed scene persistence blocks dispatch and known preflight failure may be explicitly retried',async()=>{
 await expect(run({onOperation:async()=>{throw Error('scene save failed')}})).rejects.toMatchObject({submissionRejected:true});expect(apiFetch).not.toHaveBeenCalled();
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({success:true,text:'retry',operationKey:'retry'}));await run({runId:'retry',previousOperationId:'original'});
 expect(apiFetch).toHaveBeenCalledOnce();
});
it('S11 unknown status write failure stays pending and never permits another POST',async()=>{
 vi.mocked(apiFetch).mockImplementationOnce(async()=>{vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('full')});return result()});
 await expect(run()).rejects.toThrow();vi.restoreAllMocks();
 vi.mocked(apiFetch).mockResolvedValueOnce(result());await run({runId:'after-storage-recovers'});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
});
it('S11 switches of workspace during scene save cannot dispatch to a different owner',async()=>{
 await expect(run({onOperation:()=>{localStorage.setItem('beike_workspace_secret','other-workspace-'.repeat(3))}})).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled();
});
it('S11 restoring interrupted 05 nodes clears busy state while preserving query-only identity',()=>{
 const legacy={id:'analysis',type:'text-node',beikeTextOperationId:'legacy',settings:{textNodeIsAnalyzing:true,text:'old result'}};
 expect(recoverStudioTextNode('project',legacy)).toMatchObject({beikeTextOperationId:'legacy',beikeTextRecoveryRequired:true,settings:{textNodeIsAnalyzing:false,text:'old result'}});
});
it.each(['text','05-analysis'])('S13 %s lost receipt recovers usage on original channel once', async nodeId=>{
 const ctx={projectId:'project',nodeId,runId:'original'};
 const reqBody=vi.fn(()=>({model:'original-model',customBaseUrl:'https://original.test'}));
 vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost reply')).mockResolvedValue(Response.json({operationKey:'original',success:true,text:'saved result',usage:{total_tokens:8}}));
 await expect(requestCanvasText(reqBody,ctx,new AbortController().signal)).rejects.toThrow();
 await requestCanvasText(()=>{throw Error('current model removed');},{...ctx,recoveryOnly:true,previousOperationId:'original'},new AbortController().signal);
 expect(reqBody).toHaveBeenCalledOnce();
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
 expect(getUsageLogs()).toHaveLength(1);
 expect(getUsageLogs()[0]).toMatchObject({modelId:'original-model',totalTokens:8,success:true});
});
it('S13 cleared canvas text usage stays empty when the pending reply arrives',async()=>{
 vi.mocked(apiFetch).mockImplementationOnce(async()=>{clearUsageLogs();return Response.json({operationKey:'original',success:true,text:'result',usage:{total_tokens:8}});});
 await requestCanvasText(()=>({model:'original-model'}),{projectId:'project',nodeId:'text',runId:'original'},new AbortController().signal);
 expect(getUsageLogs()).toHaveLength(0);
});

it('S11 native bridge saves correlated node identity before dispatch and retains recovery until content commits',async()=>{
 vi.mocked(apiFetch).mockImplementationOnce(async()=>{expect(save).toHaveBeenCalled();expect(nodes[0]).toMatchObject({beikeTextOperationId:'original',beikeTextRecoveryRequired:true});return complete()});
 await studioTextRequest('project',payload(),new AbortController().signal,commands,save);
 expect(nodes[0].beikeTextRecoveryRequired).toBe(true);
 vi.mocked(apiFetch).mockResolvedValueOnce(complete());chatRoutes.length=0;
 expect(await recoverStudioTextRun('project','analysis',commands,save)).toBe(true);
 expect(nodes[0]).toMatchObject({content:'saved final result',beikeTextRecoveryRequired:false,settings:{text:'saved final result',textNodeIsAnalyzing:false}});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
});
it('S11 refresh and explicit recovery bypass removed models and broken references',async()=>{
 vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost'));await expect(studioTextRequest('project',payload(),new AbortController().signal,commands,save)).rejects.toThrow();
 nodes[0]=recoverStudioTextNode('project',{...nodes[0],settings:{text:'old content',textNodeIsAnalyzing:true}});
 chatRoutes.length=0;vi.mocked(apiFetch).mockResolvedValueOnce(complete());
 await recoverStudioTextRun('project','analysis',commands,save);
 expect(nodes[0].content).toBe('saved final result');
});
it('S11 overlapping node runs keep separate identities when replies finish in reverse order',async()=>{
 let release!:(value:Response)=>void;vi.mocked(apiFetch).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));
 const first=studioTextRequest('project',payload(),new AbortController().signal,commands,save);await vi.waitFor(()=>expect(release).toBeDefined());
 vi.mocked(apiFetch).mockResolvedValueOnce(complete('other-operation'));
 await studioTextRequest('project',payload('other','other-operation'),new AbortController().signal,commands,save);release(complete());await first;
 expect(nodes.map(n=>n.beikeTextOperationId)).toEqual(['original','other-operation']);
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>new Headers(init?.headers).get('x-idempotency-key'))).toEqual(['original','other-operation']);
});
it('S11 uncorrelated requests and missing legacy keys cannot generate new paid work',async()=>{
 await expect(studioTextRequest('project',{model:'test'},new AbortController().signal,commands,save)).rejects.toThrow('核对');
 nodes[0].beikeTextRecoveryRequired=true;await expect(recoverStudioTextRun('project','analysis',commands,save)).rejects.toThrow();expect(apiFetch).not.toHaveBeenCalled();
});
it('S11 recovery does not overwrite a concurrently edited body',async()=>{
 nodes[0].beikeTextOperationId='legacy';nodes[0].beikeTextRecoveryRequired=true;
 vi.mocked(apiFetch).mockImplementationOnce(async()=>{nodes[0].settings={text:'user edited'};return complete('legacy')});
 await expect(recoverStudioTextRun('project','analysis',commands,save)).rejects.toThrow('文本已修改');expect(nodes[0].settings).toEqual({text:'user edited'});
});
it('S11 copying projects and nodes clears operation ownership and interrupted analysis flags',()=>{
 const node={...nodes[0],beikeTextOperationId:'original',beikeTextRecoveryRequired:true,settings:{textNodeIsAnalyzing:true,beikeTextRunError:'unknown'}};
 const copy=cloneCanvasProject({id:'project',title:'test',nodes:[],createdAt:1,updatedAt:1,studioScene:{...commands.read(),nodes:[node]}},'copy');
 expect(copy.studioScene?.nodes[0]).toMatchObject({beikeTextOperationId:undefined,beikeTextRecoveryRequired:undefined,settings:{textNodeIsAnalyzing:false}});
});
it('a rejected recovery unlocks the original node without submitting another request',async()=>{
 vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost'));
 await expect(studioTextRequest('project',payload(),new AbortController().signal,commands,save)).rejects.toThrow();
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({operationKey:'original',submissionRejected:true,submissionUnknown:false,error:'上游拒绝改编请求'},{status:502}));
 await expect(recoverStudioTextRun('project','analysis',commands,save)).rejects.toThrow('上游拒绝改编请求');
 expect(nodes[0]).toMatchObject({beikeTextOperationId:'original',beikeTextRecoveryRequired:false,settings:{text:'old content'}});
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
});

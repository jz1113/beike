import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { createUsageScope } from '@client/shared/utils/usageScope';
import { clearUsageLogs, getUsageLogs } from '@client/shared/utils/usageTracker';
import { saveCanvasProjects, useCanvasStore } from '../store/useCanvasStore';
import { recordLayerUsage, runLayerDecompositionTask } from './layerDecompositionTask';
import type { CanvasNode } from './types';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn(), proxyMediaUrl: (url: string) => url, storageConfigHeaders: () => ({}), readClientStorageConfig: () => ({}) }));
vi.mock('../store/useCanvasStore', () => ({ saveCanvasProjects: vi.fn(), useCanvasStore: { getState: vi.fn() } }));
let nodes: CanvasNode[];
const source: CanvasNode = { id: 'source', type: 'image', imageUrl: '/source.png', title: '原图', x: 0, y: 0, width: 100, height: 100, createdAt: 1 };
const prepare = vi.fn(async () => 'data:image/png;base64,hello');
const prepareImageMock = vi.fn<(_url: string) => Promise<string>>();
const layers = [{ url: 'https://example.test/a.png', name: '底图', zIndex: 0, width: 100, height: 100, placement: 'separate' }, { url: 'https://example.test/b.png', name: '图层', zIndex: 1, width: 100, height: 100, placement: 'separate' }];
const run = (id = 'original', prompt = '拆分') => runLayerDecompositionTask('project', source, prepare, prompt, id);
beforeEach(() => {
  vi.resetAllMocks();
  nodes = [{ ...source }];
  const rows = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value) });
  vi.stubGlobal('window', {});
  localStorage.setItem('beike_workspace_secret', 'workspace-original-'.repeat(3));
  const locks = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', { locks: { request: (key: string, _options: unknown, callback: () => unknown) => {
    const next = (locks.get(key) || Promise.resolve()).catch(() => {}).then(callback); locks.set(key, next); return next;
  } } });
  vi.mocked(useCanvasStore.getState).mockReturnValue({ projects: [{ id: 'project', nodes }], addNode: (_id: string, node: CanvasNode) => nodes.push(node), updateNode: (_project: string, id: string, patch: Partial<CanvasNode>) => Object.assign(nodes.find(node => node.id === id)!, patch) } as unknown as ReturnType<typeof useCanvasStore.getState>);
  prepare.mockResolvedValue('data:image/png;base64,hello');
});
afterEach(() => vi.unstubAllGlobals());
it('persists the original operation and canvas before POST, then recovers a lost response using GET despite changed input', async () => {
  vi.mocked(apiFetch).mockImplementationOnce(async () => {
    expect(saveCanvasProjects).toHaveBeenCalled();
    expect(nodes.find(node => node.id === 'layer-task-original')?.layerOperationId).toBe('original');
    throw new TypeError('lost response');
  }).mockResolvedValueOnce(Response.json({ success: true, layers }));
  await run();
  expect(nodes.find(node => node.id === 'layer-task-original')?.status).toBe('error');
  await run('new-key-after-refresh', '修改后的要求');
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(vi.mocked(apiFetch).mock.calls.map(([url, init]) => [url, init?.method || 'GET'])).toEqual([
    ['/api/generate/layer-decomposition', 'POST'], ['/api/generate/layer-decomposition?operationKey=original', 'GET'],
  ]);
  expect(prepare).toHaveBeenCalledOnce();
  expect(nodes.filter(node => node.imageUrl?.startsWith('https:'))).toHaveLength(2);
});
it.each([404, 409, 503, 401])('keeps unknown operation on recovery HTTP %s without another POST', async status => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new TypeError('lost'));
  await run();
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ success: false, submissionUnknown: true }, { status }));
  await run('next'); await run('next-again');
  expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(vi.mocked(apiFetch).mock.calls.slice(1).every(([url]) => String(url).includes('operationKey=original'))).toBe(true);
});
it('refuses dispatch when operation persistence or canvas persistence fails', async () => {
  vi.mocked(saveCanvasProjects).mockRejectedValueOnce(new Error('disk full'));
  await run(); expect(apiFetch).not.toHaveBeenCalled();
});
it('cross-tab attempts reserve one original operation and make at most one POST', async () => {
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({ success: true, layers }) : Response.json({ submissionUnknown: true }, { status: 409 }));
  await Promise.all([run(), run('other-tab')]);
  expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('storage write or read failure blocks submission even when a new key is proposed', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('disk full'); } });
  await expect(run()).rejects.toThrow('disk full');
  expect(apiFetch).not.toHaveBeenCalled();
  vi.stubGlobal('localStorage', { getItem: () => '{corrupt', setItem: vi.fn() });
  await expect(run('new-key')).rejects.toThrow();
  expect(apiFetch).not.toHaveBeenCalled();
});
it('requires the cross-tab lock before dispatch', async () => {
  vi.stubGlobal('navigator', {});
  await expect(run()).rejects.toThrow('跨页面');
  expect(apiFetch).not.toHaveBeenCalled();
});
it('legacy unknown node is queried by its original operation, without preparing or submitting again', async () => {
  nodes.push({ ...source, id: 'layer-task-legacy', imageUrl: undefined, layerTask: true, referenceNodeIds: ['source'], status: 'generating' });
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ error: 'not found' }, { status: 404 }));
  await run('new-key');
  expect(apiFetch).toHaveBeenCalledWith('/api/generate/layer-decomposition?operationKey=legacy', { cache: 'no-store' });
  expect(prepare).not.toHaveBeenCalled();
});
it('does not duplicate layers on repeated completed receipt recovery', async () => {
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ success: true, operationKey: 'original', layers }));
  await run(); await run('next');
  expect(nodes.filter(node => node.imageUrl?.startsWith('https:'))).toHaveLength(2);
  expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('a late failed recovery cannot downgrade an already completed image', async () => {
  let release!: (response: Response) => void;
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('lost'));
  await run();
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const stale = run('stale');
  await vi.waitFor(() => expect(release).toBeDefined());
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, layers }));
  await run('recovered');
  release(Response.json({ submissionUnknown: true }, { status: 409 })); await stale;
  expect(nodes.find(node => node.id === 'layer-task-original')?.status).toBe('success');
});
it('unknown flag wins over rejection and malformed response never authorizes a new key', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ submissionUnknown: true, submissionRejected: true }, { status: 502 }));
  await run();
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response('not-json'));
  await run('second');
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ submissionUnknown: true }, { status: 409 }));
  await run('third');
  expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('recovery button is GET-only even if saved input differs from the error text', async () => {
  const { recoverLayerDecompositionTask } = await import('./layerDecompositionTask');
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('lost'));
  await run();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, layers }));
  await recoverLayerDecompositionTask('project', nodes.find(node => node.id === 'layer-task-original')!);
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
});
it('refresh with a missing latest canvas snapshot still recovers the persisted operation rather than submitting a new key', async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('response lost'));
  await run();
  nodes.splice(1);
  vi.resetModules();
  const reopened = await import('./layerDecompositionTask');
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, layers }));
  await reopened.runLayerDecompositionTask('project', source, prepare, '刷新后修改', 'fresh-proposal');
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
  expect(nodes.find(node => node.id === 'layer-task-original')?.status).toBe('success');
});
it('recovers a receipt without the original source node and without image preparation', async () => {
  const { recoverLayerDecompositionTask } = await import('./layerDecompositionTask');
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('lost'));
  await run();
  const placeholder = nodes.find(node => node.id === 'layer-task-original')!;
  nodes.splice(0, 1); placeholder.referenceNodeIds = [];
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, layers }));
  await recoverLayerDecompositionTask('project', placeholder);
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
  expect(prepare).toHaveBeenCalledOnce();
});
it('a silently discarded operation write blocks dispatch', async () => {
  const read = localStorage.getItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {});
  vi.spyOn(localStorage, 'getItem').mockImplementation(read);
  await expect(run()).rejects.toThrow('结果待核对');
  expect(apiFetch).not.toHaveBeenCalled();
});
it('workspace change during image preparation blocks dispatch and retains the original reservation', async () => {
  prepare.mockImplementationOnce(async () => { localStorage.setItem('beike_workspace_secret', 'workspace-other-'.repeat(3)); return 'image'; });
  await run();
  expect(apiFetch).not.toHaveBeenCalled();
  localStorage.setItem('beike_workspace_secret', 'workspace-original-'.repeat(3));
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ submissionUnknown: true }, { status: 409 }));
  await run('new-key');
  expect(apiFetch).toHaveBeenCalledWith('/api/generate/layer-decomposition?operationKey=original', { cache: 'no-store' });
});
it.each(['image', 'canvas'])('P2 retries identical parameters after confirmed %s preflight failure without querying a never-submitted task', async stage => {
  if (stage === 'image') prepare.mockRejectedValueOnce(new Error('temporary image failure'));
  else vi.mocked(saveCanvasProjects).mockRejectedValueOnce(new Error('temporary save failure'));
  await run();
  expect(apiFetch).not.toHaveBeenCalled();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, layers }));
  await run('retry');
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST']);
  expect(nodes.find(node=>node.id==='layer-task-original')).toMatchObject({layerRetryAllowed:true});
});
it('P2 retry button retains original image and prompt across source edits', async()=>{
 const {retryLayerDecompositionTask}=await import('./layerDecompositionTask');
 prepare.mockRejectedValueOnce(new Error('image download failed'));await run();
 const failed=nodes.find(node=>node.id==='layer-task-original')!;
 nodes[0].imageUrl='/changed-source.png';
 prepareImageMock.mockResolvedValueOnce('data:image/png;base64,original');
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({success:true,layers}));
 await retryLayerDecompositionTask('project',failed,prepareImageMock);
 expect(prepareImageMock).toHaveBeenCalledWith('/source.png');
 expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({image:'data:image/png;base64,original',prompt:'拆分'});
});
it('P2 stale retry button never re-posts an unknown operation',async()=>{
 const {retryLayerDecompositionTask}=await import('./layerDecompositionTask');
 vi.mocked(apiFetch).mockRejectedValueOnce(new Error('lost'));await run();
 const stale={...nodes.find(node=>node.id==='layer-task-original')!,layerRetryAllowed:true};
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({submissionUnknown:true},{status:409}));
 await retryLayerDecompositionTask('project',stale,prepareImageMock);
 expect(vi.mocked(apiFetch).mock.calls.map(([,init])=>init?.method||'GET')).toEqual(['POST','GET']);
 expect(prepareImageMock).not.toHaveBeenCalled();
});
it('P2 failed preflight settlement keeps the original key unknown instead of enabling a retry', async()=>{
 const write=localStorage.setItem.bind(localStorage);
 prepare.mockImplementationOnce(async()=>{
   vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('disk full')});
   throw new Error('image preparation failed');
 });
 await run();
 expect(nodes.find(node=>node.id==='layer-task-original')?.layerRetryAllowed).toBe(false);
 vi.spyOn(localStorage,'setItem').mockImplementation(write);
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({submissionUnknown:true},{status:409}));
 await run('new-proposal');
 expect(vi.mocked(apiFetch).mock.calls.map(([url,init])=>[url,init?.method||'GET'])).toEqual([['/api/generate/layer-decomposition?operationKey=original','GET']]);
});

describe('recordLayerUsage', () => {
  let storage: Storage;
  const usageLayers = [{url:'https://example.test/a.png',placement:'separate'}, {url:'https://example.test/b.png',placement:'separate'}];
  const receipt = (extra = {}) => ({model:'actual-layer-model', usageChannelId:'a'.repeat(64), operationKey:'operation', success:true, layers: usageLayers, usage:{total_tokens:37}, ...extra});
  beforeEach(()=>{
   const rows=new Map<string,string>();
   storage={get length(){return rows.size},key:i=>[...rows.keys()][i]??null,getItem:k=>rows.get(k)??null,setItem:(k,v)=>{rows.set(k,v)},removeItem:k=>{rows.delete(k)},clear:()=>rows.clear()};
   vi.stubGlobal('localStorage',storage);vi.stubGlobal('window',{dispatchEvent:()=>true});
   storage.setItem('beike_workspace_secret','original-workspace-'.repeat(3));
  });
  afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
  it('counts one paid decomposition rather than one call per output layer, deduplicating POST and recovery',()=>{
   const scope=createUsageScope('image','layer',{});
   recordLayerUsage(receipt(),scope,'operation',true);recordLayerUsage(receipt(),scope,'operation',true);
   expect(getUsageLogs()).toHaveLength(1);
   expect(getUsageLogs()[0]).toMatchObject({modelId:'actual-layer-model',type:'image',totalTokens:37,mediaCount:1,billableCount:1,success:true,scope:{...scope,channelId:'a'.repeat(64)}});
  });
  it('retains billed failure and upgrades partial usage to full result without downgrading stale replays',()=>{
   const scope=createUsageScope('image','layer',{});
   recordLayerUsage(receipt({success:false,submissionUnknown:true,usage:{prompt_tokens:11}}),scope,'operation',false);
   expect(getUsageLogs()[0]).toMatchObject({totalTokens:11,success:false,mediaCount:0});
   recordLayerUsage(receipt({usage:{prompt_tokens:11,completion_tokens:7,total_tokens:18}}),scope,'operation',true);
   recordLayerUsage(receipt({success:false,submissionUnknown:true,usage:{prompt_tokens:4}}),scope,'operation',false);
   expect(getUsageLogs()).toHaveLength(1);expect(getUsageLogs()[0]).toMatchObject({totalTokens:18,success:true,mediaCount:1});
  });
  it.each([{submissionUnknown:true},{layers:[]},{layers:[{url:'invalid'},{url:'invalid'}]}])('never counts invalid or unknown output as successful media (%j)',extra=>{
   recordLayerUsage(receipt(extra),createUsageScope('image','layer',{}),'operation',true);
   expect(getUsageLogs()[0]).toMatchObject({totalTokens:37,success:false,mediaCount:0});
  });
  it('successful receipts without tokens still count a single output and estimated paid invocation',()=>{
   recordLayerUsage(receipt({usage:undefined}),createUsageScope('image','layer',{}),'operation',true);
   expect(getUsageLogs()[0]).toMatchObject({mediaCount:1,billableCount:1,success:true});
  });
  it('clear barrier discards old receipts but admits a fresh operation',()=>{
   const old=createUsageScope('image','layer',{});recordLayerUsage(receipt(),old,'operation',true);clearUsageLogs();
   recordLayerUsage(receipt(),old,'operation',true);expect(getUsageLogs()).toEqual([]);
   recordLayerUsage(receipt(),createUsageScope('image','layer',{}),'fresh',true);expect(getUsageLogs()).toHaveLength(1);
  });
  it('does not invent attribution for historical receipts and isolates original workspace and actual channels',()=>{
   const original=createUsageScope('image','layer',{});
   recordLayerUsage(receipt(),undefined,'legacy',true);expect(getUsageLogs()).toEqual([]);
   storage.setItem('beike_workspace_secret','changed-workspace-'.repeat(3));
   recordLayerUsage(receipt(),original,'operation',true);expect(getUsageLogs()).toEqual([]);
   storage.setItem('beike_workspace_secret','original-workspace-'.repeat(3));
   recordLayerUsage(receipt(),original,'operation',true);
   recordLayerUsage(receipt({usageChannelId:'b'.repeat(64)}),original,'operation',true);
   expect(getUsageLogs()).toHaveLength(2);
  });
});

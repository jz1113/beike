import { afterEach, expect, it, vi } from 'vitest';
import { createUsageScope, operationUsageScope, usageDigest } from './usageScope';
import { recordMediaTaskUsage, recordChatTokens } from './modelUsage';
import { getUsageLogs, getUsageSummary, recordModelUsage } from './usageTracker';

function storage() {
  const values = new Map<string,string>();
  const localStorage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); }, removeItem: (key:string) => { values.delete(key); } };
  vi.stubGlobal('localStorage',localStorage); vi.stubGlobal('window',{localStorage,dispatchEvent:()=>true});
  localStorage.setItem('beike_workspace_secret','workspace-a-secret-'.repeat(3));
  return localStorage;
}
afterEach(()=>vi.unstubAllGlobals());
const scope = {workspaceId:'workspace-a',channelId:'channel-a',mediaType:'image'};

it('P2 upgrades partial tokens, preserves disjoint fields, and ignores older/replayed cumulative snapshots',()=>{
  storage();
  const base={localTaskId:'operation',taskId:'remote',modelId:'gpt-image-2',type:'image' as const,scope};
  recordMediaTaskUsage({...base,usage:{prompt_tokens:5}});
  recordMediaTaskUsage({...base,usage:{completion_tokens:7,total_tokens:12}});
  recordMediaTaskUsage({...base,usage:{prompt_tokens:2,total_tokens:2}});
  recordMediaTaskUsage({...base,usage:{total_tokens:12}});
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({promptTokens:5,completionTokens:7,totalTokens:12});
  expect(getUsageSummary('today')).toMatchObject({totalRequests:1,totalTokens:12,imageCount:1});
});

it('P2 refreshes estimated token cost while preserving explicit zero cost',()=>{
  storage();
  const base={modelId:'gpt-6-luna',operationId:'text',scope:{...scope,mediaType:'chat'}};
  recordChatTokens({...base,usage:{prompt_tokens:1000}});
  expect(getUsageLogs()[0].costUsd).toBe(0.0001);
  recordChatTokens({...base,usage:{prompt_tokens:1000,completion_tokens:1000,total_tokens:2000}});
  expect(getUsageLogs()[0].costUsd).toBe(0.0006);
  recordModelUsage({taskId:'local-depth',modelId:'depth-video',modelName:'Depth video',provider:'local',type:'video',success:true,costUsd:0,duration:5,scope:{...scope,mediaType:'depth-video'}});
  recordMediaTaskUsage({taskId:'local-depth',modelId:'depth-video',type:'video',duration:10,scope:{...scope,mediaType:'depth-video'}});
  expect(getUsageLogs().find(log=>log.taskId==='local-depth')?.costUsd).toBe(0);
});

it('P2 isolates identical task IDs and local IDs by workspace, channel and media type',()=>{
  storage();
  const base={localTaskId:'same-local',taskId:'same-upstream',modelId:'gpt-image-2',type:'image' as const,usage:{total_tokens:3}};
  for(const item of [scope,{...scope,workspaceId:'workspace-b'},{...scope,channelId:'channel-b'},{...scope,mediaType:'video'}]) {
    recordMediaTaskUsage({...base,scope:item}); recordMediaTaskUsage({...base,scope:item});
  }
  expect(getUsageLogs()).toHaveLength(4);
  expect(getUsageSummary('today').totalTokens).toBe(12);
});

it('P2 separates distinct local operations and reconciles history using the immutable server record',()=>{
  storage();
  const base={taskId:'same-upstream',modelId:'gpt-image-2',type:'image' as const,scope};
  recordMediaTaskUsage({...base,localTaskId:'one',recordId:'record-one'});
  recordMediaTaskUsage({...base,localTaskId:'two',recordId:'record-two'});
  recordMediaTaskUsage({...base,localTaskId:'history-one',recordId:'record-one',usage:{total_tokens:9}});
  expect(getUsageLogs()).toHaveLength(2);
  expect(getUsageLogs().find(log=>log.recordId==='record-one')?.totalTokens).toBe(9);
});

it('P2 leaves legacy unscoped history intact without guessing its ownership',()=>{
  const local=storage();
  local.setItem('app_real_usage_logs',JSON.stringify([{id:'legacy',timestamp:Date.now(),taskId:'same',modelId:'gpt-image-2',type:'image',totalTokens:4,costUsd:0,costRmb:0,success:true}]));
  recordMediaTaskUsage({taskId:'same',modelId:'gpt-image-2',type:'image',scope,usage:{total_tokens:8}});
  expect(getUsageLogs()).toHaveLength(2);
  expect(getUsageLogs().find(log=>log.id==='legacy')).toMatchObject({totalTokens:4});
});

it('P2 fingerprints actual channel/workspace without exporting secrets and survives settings changes through the saved scope',async()=>{
  const local=storage();
  for(const text of ['', 'abc', '中文与 emoji🙂', 'a'.repeat(200)]) {
    const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
    expect(usageDigest(text)).toBe(expected);
  }
  const headers={'x-custom-base-url':'https://channel-a.example','x-custom-api-key':'private-key'};
  const saved=createUsageScope('video','model',headers);
  const other=createUsageScope('video','model',{...headers,'x-custom-api-key':'different-account'});
  expect(saved.channelId).not.toBe(other.channelId);
  local.setItem('beike_workspace_secret','workspace-b-secret-'.repeat(3));
  expect(createUsageScope('video','model',headers).workspaceId).not.toBe(saved.workspaceId);
  expect(JSON.stringify(saved)).not.toContain('private-key');
  expect(JSON.stringify(saved)).not.toContain('workspace-a-secret');
  const base={taskId:'original',modelId:'model',type:'video' as const,scope:saved};
  recordMediaTaskUsage({...base,usage:{total_tokens:5}});
  recordMediaTaskUsage({...base,usage:{total_tokens:12}});
  expect(getUsageLogs()).toHaveLength(1);expect(getUsageLogs()[0].totalTokens).toBe(12);
});


it('P2 restores an immutable operation channel after settings change instead of counting a new request',()=>{
 storage();
 const first=operationUsageScope('original-key','image','model',{'x-custom-base-url':'https://a.example','x-custom-api-key':'key-a'});
 const restored=operationUsageScope('original-key','image','model',{'x-custom-base-url':'https://b.example','x-custom-api-key':'key-b'});
 const next=operationUsageScope('new-intent','image','model',{'x-custom-base-url':'https://b.example','x-custom-api-key':'key-b'});
 expect(restored).toEqual(first);expect(next.channelId).not.toBe(first.channelId);
});

it('P2 old and legacy operation scopes cannot resurrect statistics after clear, while new operations count', async () => {
  storage();
  const { clearUsageLogs } = await import('./usageTracker');
  const original = createUsageScope('image');
  const old = { modelId: 'gpt-image-2', type: 'image' as const, localTaskId: 'old', scope: original };
  recordMediaTaskUsage(old); clearUsageLogs();
  recordMediaTaskUsage({ ...old, usage: { totalTokens: 9 } });
  recordMediaTaskUsage({ ...old, localTaskId: 'legacy', scope: { workspaceId: 'w', channelId: 'c', mediaType: 'image' } });
  expect(getUsageLogs()).toEqual([]);
  recordMediaTaskUsage({ ...old, localTaskId: 'new', scope: createUsageScope('image') });
  expect(getUsageLogs()).toHaveLength(1);
});

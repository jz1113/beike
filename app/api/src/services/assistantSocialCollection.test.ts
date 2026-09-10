vi.mock('./assistantMemory', () => ({ assistantMemory: { remember: vi.fn(async () => ({ enabled: true, summary: '' })), get: vi.fn() }, summarizeMemory: vi.fn() }));
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { socialCollectionIntent, collectSocialImages } from './assistantSocialCollection';
import { AgentRuntime } from '@beike/server-kit/assistant/agentRuntime';
import { runAssistantTurn } from './assistantAgent';
import { buildAssistantMessages } from './assistantMessageBuilder';
import { runAgentLoop } from '@beike/server-kit/assistant/agentLoop';
const config = vi.hoisted(() => ({ key: '' }));

vi.mock('./assistantTurnPersist', () => ({ upsertTurn: vi.fn(async () => {}), updateTurnStatus: vi.fn(async () => {}), syncRuntimeToDb: vi.fn(async () => {}), syncSnapshot: vi.fn(async () => {}) }));
vi.mock('./itemPersistQueue', () => ({ enqueueItemPersist: vi.fn(), flushItemQueue: vi.fn(async () => {}) }));
vi.mock('./imageHelpers', () => ({ getDefaultBaseUrl: () => 'https://model.invalid', getDefaultApiKey: () => '' }));
vi.mock('@beike/domain/gatewayCreds', () => ({ resolveGatewayCreds: () => ({baseUrl: 'https://model.invalid', apiKey: config.key}) }));
vi.mock('./assistantMessageBuilder', () => ({ buildAssistantMessages: vi.fn(async () => ({formattedMessages:[],lastUserMsg:'',documents:[]})) }));

vi.mock('@beike/server-kit/assistant/agentLoop', () => ({ runAgentLoop: vi.fn(async (opts) => ({runtime: opts.runtime ?? new AgentRuntime(opts), textStreamed:true, modelUsed:'test-model', finalMessages:opts.messages})), streamFinalReply: vi.fn() }));

const urls = Array.from({length: 15}, (_, i) => `https://image.example/${i}.jpg`);
const fetchMock = vi.fn(async () => new Response(JSON.stringify({success: true, data: {title: '测试图集', images: urls}})));
beforeEach(() => { vi.clearAllMocks(); config.key = ''; vi.stubGlobal('fetch', fetchMock); });

describe('小红书直接采集', () => {
  it('识别分享文本、去重链接、拒绝仿冒域名并区分采集与筛选', () => {
    expect(socialCollectionIntent('分享 https://xhslink.com/a/123， https://xhslink.com/a/123')).toEqual({urls:['https://xhslink.com/a/123'],analyze:false});
    expect(socialCollectionIntent('https://xiaohongshu.com.evil.test/abc').urls).toEqual([]);
    expect(socialCollectionIntent('https://www.xiaohongshu.com/explore/abc 挑3张封面').analyze).toBe(false);
    expect(socialCollectionIntent('从刚才采集的图片挑3张封面').analyze).toBe(true);
    expect(socialCollectionIntent('https://xhslink.com/abc 只采集，不分析封面').analyze).toBe(false);
  });
  it('保留超过8张的完整图集，不把采集声称为视觉查看', async () => {
    const send=vi.fn();
    const runtime=new AgentRuntime({turnId:'test',threadId:'test',send});
    const result=await collectSocialImages(['https://xhslink.com/abc'],'http://localhost:3000',runtime);
    expect(result.images).toHaveLength(15);
    expect(result.productWidget).toMatchObject({allImages:urls, platform:'xiaohongshu'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/catalog/styles/parse-link');
    expect(send.mock.calls.some(([evt])=>evt.type==='tool_visual_inspection')).toBe(false);
  });
  it('没有模型密钥且启用压缩时仍可采集完成，唯一网络请求是采集接口', async () => {
    const send=vi.fn();
    await runAssistantTurn({ req: new Request('http://localhost:3000/api/assistant/turn'),
      body: {messages:[{role:'user',content:'https://xhslink.com/abc'}], enableCompression:true}, send });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(buildAssistantMessages).not.toHaveBeenCalled();
    expect(runAgentLoop).not.toHaveBeenCalled();
    expect(send.mock.calls.some(([evt]) => evt.type==='turn/completed')).toBe(true);
    expect(send.mock.calls.some(([evt]) => evt.type==='meta' && evt.modelUsed==='direct-collection' && evt.productWidget.allImages.length===15)).toBe(true);
  });
  it('采集失败不调用模型编造结果', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({success:false,error:'作品已失效'})));
    const send=vi.fn();
    const result=await collectSocialImages(['https://xhslink.com/abc'],'http://localhost:3000',new AgentRuntime({turnId:'test',threadId:'test',send}));
    expect(result.images).toEqual([]);
    expect(result.summaries.join()).toContain('作品已失效');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

 it('带用途的采集请求也只采集，等待用户后续指令', async () => {
   config.key='test';
   const send = vi.fn();
   await runAssistantTurn({req:new Request('http://localhost:3000/api/assistant/turn'),body:{messages:[{role:'user',content:'https://xhslink.com/abc 挑3张封面'}]},send});
   expect(fetchMock).toHaveBeenCalledTimes(1);
   expect(runAgentLoop).not.toHaveBeenCalled();
   expect(buildAssistantMessages).not.toHaveBeenCalled();
   expect(send.mock.calls.some(([event]) => event.type === 'turn/completed')).toBe(true);
 });
 it('下一轮挑图复用卡片，不重复采集', async () => {
   config.key='test';
   const send = vi.fn();
   await runAssistantTurn({req:new Request('http://localhost:3000/api/assistant/turn'),body:{messages:[{role:'assistant',content:'采集完成',productWidget:{allImages:urls}},{role:'user',content:'挑3张封面'}]},send});
   expect(send.mock.calls.some(([event]) => event.type === 'meta' && event.productWidget)).toBe(false);
   expect(fetchMock).not.toHaveBeenCalled();
   const options=vi.mocked(runAgentLoop).mock.calls[0][0];
   expect((options.messages[0] as any).content.filter((part: any)=>part.type==='image_url')).toHaveLength(15);
 });

it('44张图的图文规划只引用6张，跳过全量视觉评分并限制写入工具', async () => {
  config.key = 'test';
  const gallery = Array.from({ length: 44 }, (_, i) => `https://image.example/${i}.jpg`);
  const send = vi.fn();
  await runAssistantTurn({ req: new Request('http://localhost:3000/api/assistant/turn'), body: { messages: [
    { role: 'assistant', content: '已采集', productWidget: { allImages: gallery } },
    { role: 'user', content: '参考刚采集的图片版式生成6页图文方案和每页提示词，先规划' },
  ] }, send });
  const firstTask = send.mock.calls.find(([event]) => event.type === 'task')?.[0];
  expect(firstTask?.task.references).toHaveLength(6);
  expect(firstTask?.task.stage).not.toBe('准备上下文');
  expect(fetchMock).not.toHaveBeenCalled();
  const options = vi.mocked(runAgentLoop).mock.calls[0][0];
  expect((options.messages[0] as any).content.filter((part: any) => part.type === 'image_url')).toHaveLength(6);
  expect(options.allowedTools).not.toContain('trigger_generate');
  expect(send.mock.calls.some(([event]) => event.type === 'task' && event.task.references.length === 6 && event.task.totalReferences === 44)).toBe(true);
});

it('搜索请求不触发额外网络调用，也不注册搜索工具', async () => {
  config.key = 'test';
  await runAssistantTurn({ req: new Request('http://localhost:3000/api/assistant/turn'), body: { messages: [{ role: 'user', content: '联网搜索当地博物馆开放时间' }] }, send: vi.fn() });
  expect(fetchMock).not.toHaveBeenCalled();
  const options = vi.mocked(runAgentLoop).mock.calls[0][0];
  expect(options.toolCtx).not.toHaveProperty('searchWeb');
  expect(options.messages.some((m: any) => m.role === 'tool')).toBe(false);
});

import { expect, it, vi } from 'vitest';
import { recoverTurn } from './recover';
import { getTurnSnapshot } from './turns';
vi.mock('./turns', () => ({ getTurnSnapshot: vi.fn(async () => new Response(JSON.stringify({ snapshot: { status: 'completed', items: [{ kind: 'agentMessage', content: '成稿' }] } }))) }));
it('恢复只读取规范快照，不把完成结果改成已中断', async () => {
  const response = await recoverTurn(new Request('http://localhost/api/assistant/turns/turn1/recover', { method: 'POST' }));
  expect((await response.json()).snapshot.status).toBe('completed');
  expect(vi.mocked(getTurnSnapshot).mock.calls[0][0].url).toBe('http://localhost/api/assistant/turns/turn1/snapshot');
});

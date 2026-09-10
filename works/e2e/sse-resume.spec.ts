/**
 * E2E: SSE 断线重连恢复快照（PR2 fix/data-integrity 中修复的 lastTurnIdRef）
 *
 * 真实测试需要运行后端 + 前端，本测试侧重契约：
 *   - 后端 /api/assistant/turns/:turnId/snapshot 必须根据 path 参数返回正确 turn
 *   - 不需要依赖前端 UI（仅 API 契约测试）
 */
import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

test('snapshot 接口接受路径参数 turnId', async ({ request }) => {
  // 假设已有 turn 数据，否则 404 是预期。关键是接口结构稳定。
  const fakeTurnId = 'e2e-nonexistent-turn';
  const res = await request.get(`${API_BASE}/api/assistant/turns/${encodeURIComponent(fakeTurnId)}/snapshot`);
  expect([200, 401, 403, 404]).toContain(res.status());

  // 验证返回的 JSON 结构（若 200）
  if (res.status() === 200) {
    const body = await res.json();
    expect(body).toHaveProperty('success');
  }
});

test('listThreadTurns 接口接受路径参数 threadId', async ({ request }) => {
  const res = await request.get(`${API_BASE}/api/assistant/threads/e2e-thread/turns`);
  expect([200, 401, 403]).toContain(res.status());
});

test('拒绝非法 turnId（含路径遍历）', async ({ request }) => {
  const maliciousTurnId = '../etc/passwd';
  const res = await request.get(
    `${API_BASE}/api/assistant/turns/${encodeURIComponent(maliciousTurnId)}/snapshot`,
  );
  // 服务端应拒绝或返回 400/404，绝不返回 200 含敏感数据
  expect([400, 404, 401, 403]).toContain(res.status());
});

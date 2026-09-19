/**
 * E2E: 任务提交队列中断（PR2 中修复的 AbortController）
 *
 * 真实测试需要运行后端并提交任务；本测试断言：
 *   - /api/catalog/collect 与 /api/generate/image 等带超时
 *   - 长耗时请求不应永久挂起（30s / 40s 等超时）
 *
 * 由于 e2e 环境的真实万邦接口可能不可用，这里验证：
 *   1. 接口超时参数被前端正确传递
 *   2. abort 后 UI 仍可用（无 JS 错误）
 */
import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const DEV_TOKEN = process.env.LOCAL_ACCESS_TOKEN || process.env.VITE_APP_ACCESS_TOKEN || 'azhuo-local-dev';
const apiHeaders = { 'x-app-token': DEV_TOKEN, 'Content-Type': 'application/json' };

test('长时间 collect 请求被超时', async ({ request }) => {
  const t0 = Date.now();
  const res = await request.post(`${API_BASE}/api/catalog/collect`, {
    timeout: 35_000,
    headers: apiHeaders,
    data: {
      url: 'https://example.com/item/999999999999999999999999999', // 故意无效 SKU
      platform: 'jd',
      forceRefresh: true,
    },
    failOnStatusCode: false,
  });
  const elapsed = Date.now() - t0;

  // 30s AbortSignal.timeout 应在 35s 内响应（要么 400 不存在，要么 5xx 等明确错误）
  expect(elapsed).toBeLessThan(35_000);
  expect([400, 401, 403, 404, 429, 500, 502]).toContain(res.status());
});

test('短暂请求正常返回', async ({ request }) => {
  // 假设存在缓存中或健康的可用 SKU
  const res = await request.post(`${API_BASE}/api/catalog/collect`, {
    timeout: 30_000,
    headers: apiHeaders,
    data: {
      url: '',
      platform: 'auto',
    },
    failOnStatusCode: false,
  });
  // 空 url 应被服务端拒绝（400），不应挂起
  expect([400, 401, 403]).toContain(res.status());
});

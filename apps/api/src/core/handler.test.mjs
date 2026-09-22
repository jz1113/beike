import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './errors.ts';
import { asJsonRoute, jsonFail, jsonOk } from './handler.ts';

describe('asJsonRoute', () => {
  it('returns the handler response on success', async () => {
    const route = asJsonRoute(async () => jsonOk({ ping: true }));
    const response = await route(new Request('http://local/test'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, ping: true });
  });

  it('maps thrown AppError to the standard envelope', async () => {
    const route = asJsonRoute(async () => {
      throw new AppError('批次不存在或已删除', 404, 'not_found');
    });
    const response = await route(new Request('http://local/test'));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false,
      error: '批次不存在或已删除',
      code: 'not_found',
    });
  });

  it('jsonFail uses a client-safe envelope', async () => {
    const response = jsonFail('请求体无效', 400, 'invalid_json');
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: '请求体无效',
      code: 'invalid_json',
    });
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWanbangResponse, withWanbangCredentials } from './wanbang.ts';

test('withWanbangCredentials adds URL-encoded gateway credentials without altering endpoint params', () => {
  const url = new URL(withWanbangCredentials(
    'https://api-gw.onebound.cn/taobao/item_get/?num_iid=123&cache=yes',
    'key + /',
    'secret&=',
  ));

  assert.equal(url.searchParams.get('num_iid'), '123');
  assert.equal(url.searchParams.get('cache'), 'yes');
  assert.equal(url.searchParams.get('key'), 'key + /');
  assert.equal(url.searchParams.get('secret'), 'secret&=');
});

test('parseWanbangResponse reports an empty gateway body without leaking a JSON parser error', async () => {
  await assert.rejects(
    parseWanbangResponse(new Response('', { status: 200 })),
    /万邦网关返回空响应（HTTP 200）/,
  );
});

test('parseWanbangResponse reports non-JSON gateway content clearly', async () => {
  await assert.rejects(
    parseWanbangResponse(new Response('<html>upstream error</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })),
    /万邦网关返回 HTML 页面（HTTP 502）/,
  );
});

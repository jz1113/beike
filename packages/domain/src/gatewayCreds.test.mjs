import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowServerSecretFallback, resolveGatewayCreds } from './gatewayCreds.ts';
import { configureDomainRuntime } from './runtime.ts';

test('production web uses only the request key and ignores the server default', () => {
  configureDomainRuntime({ env: { NODE_ENV: 'production' } });
  assert.equal(allowServerSecretFallback(), false);
  const fromHeader = resolveGatewayCreds(
    new Request('https://app.example/api/generate/image', { headers: { 'x-custom-api-key': 'user-key' } }),
    {},
    { baseUrl: 'https://ai.example', apiKey: 'server-key' },
  );
  assert.equal(fromHeader.apiKey, 'user-key');
  const fallback = resolveGatewayCreds(
    new Request('https://app.example/api/generate/image'),
    {},
    { baseUrl: 'https://ai.example', apiKey: 'server-key' },
  );
  assert.equal(fallback.apiKey, '');
  configureDomainRuntime({ env: { NODE_ENV: 'development', DESKTOP_SHELL: '1' } });
  assert.equal(allowServerSecretFallback(), true);
  const desktop = resolveGatewayCreds(
    new Request('http://127.0.0.1/api/generate/image'),
    {},
    { baseUrl: 'https://ai.example', apiKey: 'server-key' },
  );
  assert.equal(desktop.apiKey, 'server-key');
  configureDomainRuntime({ env: {} });
});

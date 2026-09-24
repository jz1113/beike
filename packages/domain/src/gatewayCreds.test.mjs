import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowServerSecretFallback, GatewayBaseUrlError, isPublicHttpGatewayIpUrl, resolveGatewayCreds } from './gatewayCreds.ts';
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
  configureDomainRuntime({ env: { NODE_ENV: 'development' } });
  assert.equal(allowServerSecretFallback(), true);
  const local = resolveGatewayCreds(
    new Request('http://127.0.0.1/api/generate/image'),
    {},
    { baseUrl: 'https://ai.example', apiKey: 'server-key' },
  );
  assert.equal(local.apiKey, 'server-key');
  configureDomainRuntime({ env: {} });
});

test('explicit Responses HTTP consent accepts only a public IPv4 address and a request key', () => {
  configureDomainRuntime({ env: { NODE_ENV: 'production', ALLOW_CUSTOM_BASE_URL: 'false' } });
  try {
    assert.equal(isPublicHttpGatewayIpUrl('http://8.211.191.95:8080/v1'), true);
    for (const url of ['http://127.0.0.1:8080', 'http://192.168.1.5:8080', 'http://example.com', 'http://198.51.100.1']) {
      assert.equal(isPublicHttpGatewayIpUrl(url), false, url);
    }
    const request = new Request('https://app.example/api/generate/analyze');
    const options = { customBaseUrl: 'http://8.211.191.95:8080', customApiKey: 'user-key', apiFormat: 'openai-responses', allowInsecureHttp: true };
    const accepted = resolveGatewayCreds(request, options, { baseUrl: 'https://ai.example', apiKey: 'server-key' });
    assert.equal(accepted.baseUrl, 'http://8.211.191.95:8080');
    assert.equal(accepted.apiKey, 'user-key');
    assert.equal(resolveGatewayCreds(request, { ...options, customApiKey: '' }, { baseUrl: 'https://ai.example', apiKey: 'server-key' }).apiKey, '');
    assert.throws(() => resolveGatewayCreds(request, { ...options, allowInsecureHttp: false }, { baseUrl: 'https://ai.example', apiKey: 'server-key' }), GatewayBaseUrlError);
    assert.throws(() => resolveGatewayCreds(request, { ...options, apiFormat: undefined }, { baseUrl: 'https://ai.example', apiKey: 'server-key' }), GatewayBaseUrlError);
    assert.throws(() => resolveGatewayCreds(request, { ...options, customBaseUrl: 'http://127.0.0.1:8080' }, { baseUrl: 'https://ai.example', apiKey: 'server-key' }), GatewayBaseUrlError);
  } finally {
    configureDomainRuntime({ env: {} });
  }
});

test('production web accepts the configured gateway with an OpenAI /v1 suffix', () => {
  configureDomainRuntime({ env: { NODE_ENV: 'production' } });
  try {
    const credentials = resolveGatewayCreds(
      new Request('https://app.example/api/catalog/assets/deconstruct', {
        headers: {
          'x-custom-base-url': 'https://ai.example/v1/',
          'x-custom-api-key': 'user-key',
        },
      }),
      {},
      { baseUrl: 'https://ai.example', apiKey: 'server-key' },
    );
    assert.equal(credentials.baseUrl, 'https://ai.example');
    assert.equal(credentials.apiKey, 'user-key');
    assert.equal(credentials.ignoredClientBase, false);
    const otherGateway = resolveGatewayCreds(
      new Request('https://app.example/api/catalog/assets/deconstruct', {
        headers: {
          'x-custom-base-url': 'https://other.example/v1',
          'x-custom-api-key': 'user-key',
        },
      }),
      {},
      { baseUrl: 'https://ai.example', apiKey: 'server-key' },
    );
    assert.equal(otherGateway.baseUrl, 'https://other.example');
    assert.equal(otherGateway.apiKey, 'user-key');
    assert.throws(() => resolveGatewayCreds(
      new Request('https://app.example/api/catalog/assets/deconstruct', {
        headers: {
          'x-custom-base-url': 'http://127.0.0.1:3000',
          'x-custom-api-key': 'user-key',
        },
      }),
      {},
      { baseUrl: 'https://ai.example', apiKey: 'server-key' },
    ), (error) => error instanceof GatewayBaseUrlError && error.status === 400);
  } finally {
    configureDomainRuntime({ env: {} });
  }
});

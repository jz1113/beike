import { beforeEach, expect, it, vi } from 'vitest';
const secrets = vi.hoisted(() => ({ get: vi.fn(async () => 'image-secret'), set: vi.fn(async () => {}) }));
vi.mock('../credentialClient', () => ({ credentialGet: secrets.get, credentialSet: secrets.set }));
import { applyImageGateway, saveImageGatewayConfig, rememberImageTaskRoute } from '../imageGateway';
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); secrets.get.mockResolvedValue('image-secret'); });
it('routes image submission and polling with an independent credential pair', async () => {
  await saveImageGatewayConfig(true, 'https://images.example.com/v1/', 'image-secret');
  const init = await applyImageGateway('/api/generate/image', {
    method: 'POST', headers: { 'x-custom-api-key': 'main-secret' },
    body: JSON.stringify({ prompt: 'test', customBaseUrl: 'https://main.example.com', customApiKey: 'main-secret' }),
  });
  expect(JSON.parse(init!.body as string)).toMatchObject({ customBaseUrl: 'https://images.example.com/v1', customApiKey: 'image-secret', prompt: 'test' });
  const poll = await applyImageGateway('/api/generate/image?taskId=123');
  expect(new Headers(poll!.headers).get('x-custom-api-key')).toBe('image-secret');
  expect(new Headers(poll!.headers).get('x-custom-base-url')).toBe('https://images.example.com/v1');
});
it('does not change analysis, video, assistant or disabled image requests', async () => {
  await saveImageGatewayConfig(true, 'https://images.example.com', 'image-secret');
  const original = { body: 'unchanged' };
  for (const path of ['/api/generate/analyze', '/api/generate/video', '/api/assistant/chat']) {
    expect(await applyImageGateway(path, original)).toBe(original);
  }
  await saveImageGatewayConfig(false, '', '');
  expect(await applyImageGateway('/api/generate/image', original)).toBe(original);
});
it('does not fall back to the main key when independent credentials are missing', async () => {
  localStorage.setItem('image_gateway_enabled', 'true');
  localStorage.setItem('image_base_url', 'https://images.example.com');
  secrets.get.mockResolvedValue('');
  await expect(applyImageGateway('/api/generate/image')).rejects.toThrow('配置不完整');
});
it('retains the old URL and enabled state if secure persistence fails', async () => {
  secrets.set.mockRejectedValueOnce(new Error('save failed'));
  await expect(saveImageGatewayConfig(true, 'https://images.example.com', 'key')).rejects.toThrow('save failed');
  expect(localStorage.getItem('image_gateway_enabled')).toBeNull();
});

it('routes selected models independently and keeps Comfly credentials for other models', async () => {
  await saveImageGatewayConfig(true, 'https://images.example.com', 'image-secret', ['openai/gpt-image-2']);
  const submit = (model: string) => applyImageGateway('/api/generate/image', {
    method: 'POST', headers: { 'x-custom-api-key': 'main-secret', 'x-custom-base-url': 'https://main.example.com' },
    body: JSON.stringify({ model, customApiKey: 'main-secret', customBaseUrl: 'https://main.example.com' }),
  });
  const independent = await submit('openai/gpt-image-2');
  const main = await submit('gpt-image-2');
  expect(new Headers(independent?.headers).get('x-custom-api-key')).toBe('image-secret');
  expect(new Headers(main?.headers).get('x-custom-api-key')).toBe('main-secret');
  expect(JSON.parse(main?.body as string).customApiKey).toBe('main-secret');
  await rememberImageTaskRoute(independent, Response.json({ taskId: 'independent-task' }));
  await rememberImageTaskRoute(main, Response.json({ taskId: 'main-task' }));
  await saveImageGatewayConfig(false, 'https://images.example.com', 'image-secret', []);
  const poll = await applyImageGateway('/api/generate/image?taskId=independent-task');
  expect(new Headers(poll?.headers).get('x-custom-api-key')).toBe('image-secret');
  await saveImageGatewayConfig(true, 'https://images.example.com', 'image-secret', ['gpt-image-2']);
  const mainPoll = { headers: { 'x-custom-base-url': 'https://main.example.com', 'x-custom-api-key': 'main-secret' } };
  expect(await applyImageGateway('/api/generate/image?taskId=main-task', mainPoll)).toBe(mainPoll);
  expect(localStorage.getItem('image_task_route:independent-task')).not.toContain('secret');
  await saveImageGatewayConfig(true, 'https://other.example.com', 'other-secret', []);
  await expect(applyImageGateway('/api/generate/image?taskId=independent-task')).rejects.toThrow('地址已变更');
});
it('routes a Request body without consuming the original request', async () => {
  await saveImageGatewayConfig(true, 'https://images.example.com', 'image-secret', ['selected']);
  const request = new Request('http://localhost/api/generate/image', { method: 'POST', body: JSON.stringify({ model: 'selected' }) });
  const result = await applyImageGateway(request);
  expect(JSON.parse(result?.body as string).customApiKey).toBe('image-secret');
  expect(request.bodyUsed).toBe(false);
});

it('corrects reversed legacy selections for the two GPT Image 2 entries', async () => {
  await saveImageGatewayConfig(true, 'https://api.gapnet.ai/endpoint', 'image-secret', ['gpt-image-2']);
  for (const model of ['gpt-image-2', 'openai/gpt-image-2']) {
    const init = await applyImageGateway('/api/generate/image', {
      method: 'POST', headers: { 'x-custom-base-url': 'https://ai.comfly.org', 'x-custom-api-key': 'main-secret' },
      body: JSON.stringify({ model, customBaseUrl: 'https://ai.comfly.org', customApiKey: 'main-secret' }),
    });
    const independent = model.startsWith('openai/');
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe(model);
    expect(body.customBaseUrl).toBe(independent ? 'https://api.gapnet.ai/endpoint' : 'https://ai.comfly.org');
    expect(body.customApiKey).toBe(independent ? 'image-secret' : 'main-secret');
    expect(new Headers(init?.headers).get('x-custom-base-url')).toBe(body.customBaseUrl);
    expect(new Headers(init?.headers).get('x-custom-api-key')).toBe(body.customApiKey);
  }
});
it('blocks a disabled or wrongly addressed independent model before dispatch', async () => {
  const input = { method: 'POST', body: JSON.stringify({ model: 'openai/gpt-image-2' }) };
  await expect(applyImageGateway('/api/generate/image', input)).rejects.toThrow('启用');
  await saveImageGatewayConfig(true, 'https://ai.comfly.org', 'image-secret', []);
  await expect(applyImageGateway('/api/generate/image', input)).rejects.toThrow('不能使用 Comfly');
  await expect(applyImageGateway('/api/generate/image', { method: 'POST', body: JSON.stringify({ model: 'gpt-image-2', customBaseUrl: 'https://api.gapnet.ai/endpoint' }) })).rejects.toThrow('恢复主网关');
});

it.each(['/api/generate/analyze', '/api/catalog/assets/deconstruct', '/api/assistant/turn/start', '/api/assistant/chat', '/api/generate/copywriting'])('routes %s to the selected text gateway and isolates fallbacks', async path => {
  await saveImageGatewayConfig(true, 'https://second.example.com/endpoint', 'image-secret', []);
  localStorage.setItem('independent_text_models', JSON.stringify(['gpt-5.6-luna', 'gpt-5.6-terra']));
  const result = await applyImageGateway(path, { method: 'POST', headers: { 'x-custom-api-key': 'main-secret' }, body: JSON.stringify({ model: 'gpt-5.6-luna', customBaseUrl: 'https://ai.comfly.org', customApiKey: 'main-secret', fallbackModels: ['gpt-5.6-terra', 'main-only'] }) });
  expect(JSON.parse(result!.body as string)).toMatchObject({ model: 'gpt-5.6-luna', customBaseUrl: 'https://second.example.com/endpoint', customApiKey: 'image-secret', fallbackModels: ['gpt-5.6-terra'] });
  expect(new Headers(result!.headers).get('x-custom-api-key')).toBe('image-secret');
  expect(new Headers(result!.headers).get('x-custom-base-url')).toBe('https://second.example.com/endpoint');
});
it('filters independent fallback models out of Comfly requests without changing credentials', async () => {
  localStorage.setItem('independent_text_models', JSON.stringify(['second']));
  const result = await applyImageGateway('/api/generate/analyze', { method: 'POST', body: JSON.stringify({ model: 'main', customBaseUrl: 'https://main.example.com', customApiKey: 'main-key', fallbackModels: ['second', 'main-backup'] }) });
  expect(JSON.parse(result!.body as string)).toEqual({ model: 'main', customBaseUrl: 'https://main.example.com', customApiKey: 'main-key', fallbackModels: ['main-backup'] });
});
it('fails closed for disabled independent text and image models', async () => {
  await saveImageGatewayConfig(false, 'https://second.example.com', 'secret', ['flux-pro']);
  localStorage.setItem('independent_text_models', JSON.stringify(['second']));
  await expect(applyImageGateway('/api/generate/analyze', { method: 'POST', body: JSON.stringify({ model: 'second' }) })).rejects.toThrow('启用');
  await expect(applyImageGateway('/api/generate/image', { method: 'POST', body: JSON.stringify({ model: 'flux-pro' }) })).rejects.toThrow('启用');
});
it('does not dispatch with main credentials when text gateway key is missing', async () => {
  await saveImageGatewayConfig(true, 'https://second.example.com', 'secret', []);
  localStorage.setItem('independent_text_models', JSON.stringify(['second']));
  secrets.get.mockResolvedValue('');
  await expect(applyImageGateway('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ model: 'second', customApiKey: 'main-secret' }) })).rejects.toThrow('配置不完整');
});

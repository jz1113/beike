import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEditsMultipart, resolveImageCredentials } from './gatewayCredentials.ts';
import { buildImageRequest } from '@beike/domain/modelAdapters';
import { isApprovedModel } from '@beike/domain/modelCatalog';

test('联池模型使用独立密钥与固定地址', () => {
  const req = new Request('http://localhost/api/generate/image', {
    headers: { 'x-lianchi-api-key': 'pool-key', 'x-custom-api-key': 'comfly-key', 'x-custom-base-url': 'https://ai.comfly.org' },
  });
  assert.equal(isApprovedModel('openai/gpt-image-2', 'image'), true);
  assert.deepEqual(resolveImageCredentials(req, { model: 'openai/gpt-image-2' }), {
    baseUrl: 'https://api.gapnet.ai/endpoint', apiKey: 'pool-key',
  });
});

test('联池编辑使用 multipart image[]，保留模型与尺寸', () => {
  const image = 'data:image/png;base64,' + Buffer.from('test-image').toString('base64');
  const adapted = buildImageRequest({ model: 'openai/gpt-image-2', prompt: '修改背景', size: '1024x1024', quality: 'medium', images: [image], preferEdits: true });
  assert.equal(adapted.useEdits, true);
  assert.equal(adapted.payload.model, 'openai/gpt-image-2');
  const { form, imageAppended } = buildEditsMultipart(adapted.payload, [image], { imageField: 'image[]' });
  assert.equal(imageAppended, 1);
  assert.equal(form.get('model'), 'openai/gpt-image-2');
  assert.equal(form.get('prompt'), '修改背景');
  assert.equal(form.getAll('image[]').length, 1);
  assert.equal(form.get('image'), null);
});

test('联池文生图构造标准 JSON 参数且不携带参考图字段', () => {
  const adapted = buildImageRequest({ model: 'openai/gpt-image-2', prompt: '一只柯基犬', size: '1024x1024', quality: 'medium' });
  assert.equal(adapted.useEdits, false);
  assert.equal(adapted.payload.model, 'openai/gpt-image-2');
  assert.equal(adapted.payload.prompt, '一只柯基犬');
  assert.equal(adapted.payload.size, '1024x1024');
  assert.equal(adapted.payload.quality, 'medium');
  assert.equal(Object.hasOwn(adapted.payload, 'image'), false);
});

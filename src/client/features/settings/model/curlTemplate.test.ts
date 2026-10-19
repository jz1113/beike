import { describe, expect, it } from 'vitest';
import { parseCurl, qwenAsyncPreset, qwenSyncPreset } from './curlTemplate';

describe('parseCurl', () => {
  it('reads the Qianwen sync example into a request template', () => {
    const template = parseCurl(`curl --location 'https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation' \\
--header 'Content-Type: application/json' \\
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \\
--data '{"model":"qwen-image-3.0","input":{"messages":[{"role":"user","content":[{"text":"一只柯基"}]}]}}'`);
    expect(template.submit.method).toBe('POST');
    expect(template.submit.url).toBe('https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(template.submit.headers?.Authorization).toBe('Bearer {{apiKey}}');
    expect(template.submit.body).toContain('qwen-image-3.0');
  });

  it('builds native sync and async presets from the provider base URL', () => {
    const sync = qwenSyncPreset('https://maas.qianwenaiapi.com/compatible-mode/v1');
    expect(sync.submit.url).toBe('https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(sync.result.imageUrlPath).toBe('output.choices.0.message.content.0.image');
    const asyncTemplate = qwenAsyncPreset('https://dashscope.aliyuncs.com');
    expect(asyncTemplate.submit.headers?.['X-DashScope-Async']).toBe('enable');
    expect(asyncTemplate.poll?.url).toBe('https://dashscope.aliyuncs.com/api/v1/tasks/{{taskId}}');
    expect(asyncTemplate.result.taskIdPath).toBe('output.task_id');
  });
});

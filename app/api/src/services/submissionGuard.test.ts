import { describe, expect, it } from 'vitest';
import { guardSubmission } from './submissionGuard';
import { randomUUID } from 'node:crypto';
const credentials = { baseUrl: 'https://mock.invalid', apiKey: 'mock-secret' };
const request = (key: string, prompt = 'test', images = ['a']) => new Request('http://localhost/api/generate/image', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': key }, body: JSON.stringify({ prompt, images }),
});
describe('durable submission receipts', () => {
  it('dispatches once under concurrency, restores result and rejects different input', async () => {
    const key = randomUUID(); let calls = 0;
    const submit = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return Response.json({ taskId: 'one' }); };
    const results = await Promise.all(Array.from({ length: 20 }, () => guardSubmission(request(key), 'image', credentials, submit)));
    expect(calls).toBe(1);
    expect(await results[0].json()).toEqual({ taskId: 'one' });
    expect((await guardSubmission(request(key), 'image', credentials, submit)).status).toBe(200);
    expect(calls).toBe(1);
    expect((await guardSubmission(request(key, 'changed'), 'image', credentials, submit)).status).toBe(409);
    expect((await guardSubmission(request(key, 'test', ['b']), 'image', credentials, submit)).status).toBe(409);
  });
  it('does not resubmit an unknown outcome', async () => {
    const key = randomUUID(); let calls = 0;
    const submit = async (): Promise<Response> => { calls++; throw new Error('connection lost'); };
    await expect(guardSubmission(request(key), 'image', credentials, submit)).rejects.toThrow();
    expect((await guardSubmission(request(key), 'image', credentials, submit)).status).toBe(409);
    expect(calls).toBe(1);
  });
});

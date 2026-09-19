import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@beike/server-kit/prisma';
import { executeImagePoll } from '../image/poll';
import { GET as pollVideo } from '../video';

vi.mock('@beike/server-kit/storage', () => ({
  persistMediaUrl: vi.fn(async () => null), extractStorageConfigFromRequest: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['image', executeImagePoll, 'SUCCESS'], ['video', pollVideo, 'SUCCESS'],
  ['image', executeImagePoll, 'FAILURE'], ['video', pollVideo, 'FAILURE'],
] as const)(
  '%s preserves committed %s under reversed responses', async (kind, poll, terminal) => {
    const taskId = `cgt-${randomUUID()}`;
    const url = 'https://mock.invalid/result';
    const expectedUrl = terminal === 'SUCCESS' ? url : '';
    const upstream = (status: string) => Response.json(status === 'SUCCESS' ? { status: 'succeeded', url } : { status: 'failed', fail_reason: 'failed' });
    await prisma.imageTask.create({ data: { taskId, prompt: 'race', status: 'IN_PROGRESS' } });
    let release!: (response: Response) => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const fetch = vi.fn()
      .mockImplementationOnce(() => { started(); return new Promise<Response>(resolve => { release = resolve; }); })
      .mockImplementation(() => Promise.resolve(upstream(terminal)));
    vi.stubGlobal('fetch', fetch);
    const request = () => new Request(`http://localhost/api/generate/${kind}?taskId=${taskId}`);
    const delayed = poll(request());
    await ready;
    expect(await (await poll(request())).json()).toMatchObject({ status: terminal, resultUrl: expectedUrl });
    release(upstream(terminal === 'SUCCESS' ? 'FAILURE' : 'SUCCESS'));
    expect(await (await delayed).json()).toMatchObject({ status: terminal, resultUrl: expectedUrl });
    expect(await prisma.imageTask.findUnique({ where: { taskId } })).toMatchObject({ status: terminal, resultUrl: expectedUrl || null });
    const calls = fetch.mock.calls.length;
    expect(await (await poll(request())).json()).toMatchObject({ status: terminal });
    expect(fetch).toHaveBeenCalledTimes(calls);
  },
);

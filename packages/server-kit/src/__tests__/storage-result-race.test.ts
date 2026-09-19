import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { persistMediaUrl } from '../storage';
import { persistRemoteLocal } from '../persistRemoteLocal';

vi.mock('../persistRemoteLocal', () => ({ persistRemoteLocal: vi.fn() }));

it('a delayed media download cannot replace a newer result URL', async () => {
  const taskId = randomUUID();
  const original = 'https://mock.invalid/temporary';
  const replacement = '/storage/newer-result.mp4';
  await prisma.imageTask.create({ data: { taskId, prompt: 'race', status: 'SUCCESS', resultUrl: original } });
  vi.mocked(persistRemoteLocal).mockImplementationOnce(async () => {
    await prisma.imageTask.update({ where: { taskId }, data: { resultUrl: replacement } });
    return '/storage/older-download.mp4';
  });
  await persistMediaUrl(taskId, original, 'video', { enabled: false });
  expect(await prisma.imageTask.findUnique({ where: { taskId } })).toMatchObject({ resultUrl: replacement });
});

it('updates the URL when its original successful result still matches', async () => {
  const taskId = randomUUID();
  const original = 'https://mock.invalid/temporary';
  await prisma.imageTask.create({ data: { taskId, prompt: 'normal', status: 'SUCCESS', resultUrl: original } });
  vi.mocked(persistRemoteLocal).mockResolvedValueOnce('/storage/saved.mp4');
  await persistMediaUrl(taskId, original, 'video', { enabled: false });
  expect(await prisma.imageTask.findUnique({ where: { taskId } })).toMatchObject({ resultUrl: '/storage/saved.mp4' });
});

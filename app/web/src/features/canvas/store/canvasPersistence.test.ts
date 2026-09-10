import { expect, it } from 'vitest';
import { canvasStorage } from './canvasPersistence';
it('preserves legacy backup and restores persisted projects without localStorage rewrites', async () => {
  const name = `canvas-${Date.now()}`;
  const value = JSON.stringify({ state: { projects: [{ id: 'persistent-project', title: 'restored', nodes: [{ videoUrl: '/storage/azhuo/video.mp4' }] }] }, version: 0 });
  localStorage.setItem(name, value);
  expect(await canvasStorage.getItem(name)).toBe(value);
  await canvasStorage.setItem(name, value);
  expect(localStorage.getItem(name)).toBe(value);
  localStorage.removeItem(name);
  const recovered = JSON.parse((await canvasStorage.getItem(name))!);
  expect(recovered.state.projects[0].nodes[0].videoUrl).toBe('/storage/azhuo/video.mp4');
});

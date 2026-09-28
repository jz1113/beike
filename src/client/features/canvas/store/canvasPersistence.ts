import { openDB } from 'idb';
import type { StateStorage } from 'zustand/middleware';
import type { CanvasProject } from '../model/types';

let connection: ReturnType<typeof openDB> | undefined;
const database = () => connection ??= openDB('beike-canvas-projects', 1, {
  upgrade(db) { db.createObjectStore('projects'); db.createObjectStore('meta'); },
}).catch(error => { connection = undefined; throw error; });
let pending: Promise<void> = Promise.resolve();
let writeVersion = 0;
let lastFailureAt = 0;
let saveFailed = false;
let hydrated = false;
export const finishCanvasHydration = () => { hydrated = true; };
export const hasCanvasSaveFailure = () => saveFailed;
function reportFailure() {
  saveFailed = true;
  if (Date.now() - lastFailureAt < 10_000) return;
  lastFailureAt = Date.now();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('canvas-save-error'));
}
async function restoreLegacy(value: string | null) {
  if (!value) return null;
  const parsed = JSON.parse(value);
  for (const project of parsed.state?.projects || []) {
    for (const node of project.nodes || []) {
      const url = node.audioUrl || node.videoUrl || node.imageUrl;
      if (typeof url === 'string' && url.startsWith('blob:')) {
        try { const res = await fetch(url); if (!res.ok) node.missingMedia = true; }
        catch { node.missingMedia = true; }
      }
    }
  }
  return JSON.stringify(parsed);
}
/** Projects are stored asynchronously; the legacy localStorage record is kept as a migration backup. */
export const canvasStorage: StateStorage = {
  async getItem(name) {
    try {
      const db = await database();
      const manifest = await db.get('meta', name);
      if (manifest) {
        const projects = await Promise.all(manifest.ids.map((id: string) => db.get('projects', id)));
        if (projects.some(project => !project)) throw new Error('项目数据不完整');
        return restoreLegacy(JSON.stringify({ state: { projects }, version: manifest.version }));
      }
      return restoreLegacy(localStorage.getItem(name));
    } catch { reportFailure(); return restoreLegacy(localStorage.getItem(name)); }
  },
  async setItem(name, value) {
    // Route/selection updates can happen before IndexedDB hydration. Never persist that empty initial state.
    if (!hydrated) return;
    const version = ++writeVersion;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('canvas-save-start'));
    pending = pending.catch(() => {}).then(async () => {
      if (version !== writeVersion) return;
      const parsed = JSON.parse(value) as { state: { projects: CanvasProject[] }; version: number };
      const db = await database();
      const tx = db.transaction(['meta', 'projects'], 'readwrite');
      const ids = parsed.state.projects.map(project => project.id);
      const old = await tx.objectStore('meta').get(name);
      for (const id of old?.ids || []) if (!ids.includes(id)) await tx.objectStore('projects').delete(id);
      for (const project of parsed.state.projects) await tx.objectStore('projects').put(project, project.id);
      await tx.objectStore('meta').put({ ids, version: parsed.version }, name);
      await tx.done;
      saveFailed = false;
      if (version === writeVersion && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('canvas-save-complete'));
    });
    try { await pending; } catch { reportFailure(); }
  },
  async removeItem(name) {
    await pending.catch(() => {});
    const db = await database();
    await db.delete('meta', name);
  },
};

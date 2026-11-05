import { uniqueCanvasProjectTitle } from '../model/canvasProjectTitles';
import { openDB } from 'idb';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { buildCanvasArchive, completeCanvasArchive, mapCanvasMedia } from '../model/canvasArchive';
import type { CanvasArchive } from '../model/canvasArchive';
import type { CanvasProject, StudioScene } from '../model/types';
import { restoreStudioCachedMedia } from '../model/studioCachedMedia';
import { canvasStorage, hasCanvasReadFailure, hasCanvasSaveFailure } from './canvasPersistence';
import { useCanvasStore } from './useCanvasStore';

const assetDatabase = (id: string) => `beike.studio.${id}.QiaodoumayiAssetCache`;

async function openCanvasAssets(projectId: string) {
  const name = assetDatabase(projectId);
  if (!(await indexedDB.databases()).some(item => item.name === name)) return;
  return openDB(name);
}

export async function readCanvasAsset(projectId: string, id: string): Promise<Blob | undefined> {
  const db = await openCanvasAssets(projectId);
  if (!db) return;
  try { return db.objectStoreNames.contains('assets') ? (await db.get('assets', id))?.blob : undefined; }
  finally { db.close(); }
}

export async function exportCanvasProject(project: CanvasProject, progress: (message: string) => void): Promise<Blob> {
  return buildCanvasArchive(project, id => readCanvasAsset(project.id, id), fetchMediaBlob, progress);
}

/** Publish the restored project only after both its files and its project record have been saved. */
export async function restoreCanvasArchive(archive: CanvasArchive, progress: (message: string) => void): Promise<CanvasProject> {
  if (hasCanvasReadFailure() || !useCanvasStore.persist.hasHydrated()) throw new Error('请先在首页重试读取本机项目');
  progress('正在恢复项目素材…');
  const completed = await completeCanvasArchive(archive,fetchMediaBlob);
  archive.project = completed.project; archive.assets = completed.assets;
  const { project, assets } = archive;
  progress('正在保存项目素材…');
  if (assets.length) {
    const db = await openDB(assetDatabase(project.id), 1, { upgrade(database) {
      const store = database.createObjectStore('assets', {keyPath:'id'});
      store.createIndex('remoteUrl','remoteUrl'); store.createIndex('cachedAt','cachedAt');
    } });
    try {
      const tx = db.transaction('assets','readwrite');
      try {
        for (const asset of assets) await tx.store.put({ id:asset.id, blob:asset.blob, mimeType:asset.blob.type,
          size:asset.blob.size, cachedAt:Date.now(), cacheSubdir:'local' });
        await tx.done;
      } catch (error) {
        try { tx.abort(); } catch { /* A failed request may already have aborted its transaction. */ }
        await tx.done.catch(()=>{}); throw error;
      }
    } finally { db.close(); }
  }
  progress('正在保存恢复的项目…');
  // Store actions replace the projects array. If an update arrives while the shared
  // persistence queue is writing, save a fresh merge before publishing the import.
  // No await may separate the final comparison from setState.
  while (true) {
    const {projects:before,activeProjectId} = useCanvasStore.getState();
    project.title = uniqueCanvasProjectTitle(project.title, before, project.id);
    const projects = [project,...before.filter(item=>item.id!==project.id)];
    await canvasStorage.setItem('beike_canvas_projects_store', JSON.stringify({
      state:{projects,activeProjectId},version:0,
    }));
    if (hasCanvasSaveFailure()) throw new Error('恢复项目未保存，请重试；原有项目未被替换');
    const latest = useCanvasStore.getState();
    if (latest.projects !== before || latest.activeProjectId !== activeProjectId) continue;
    useCanvasStore.setState({projects});
    return project;
  }
}

/** Blob URLs are valid only while the canvas is open. Persist cache references instead. */
export async function hydrateCanvasScene(projectId: string, scene?: StudioScene) {
  const urls = new Map<string, Promise<string>>();
  const created = new Set<string>();
  const reverse = new Map<string, string>();
  const assetIds = new Map<string,string>();
  const mediaKinds = new Map<string,string>();
  const failures:unknown[]=[];
  const blobs = new Map<string,Promise<Blob | undefined>>();
  let cache:ReturnType<typeof openCanvasAssets> | undefined;
  const readAsset = (id:string) => {
    let pending=blobs.get(id);
    if (!pending) {
      pending=(async()=>{
        const db=await (cache ??= openCanvasAssets(projectId));
        return db?.objectStoreNames.contains('assets') ? (await db.get('assets',id))?.blob as Blob | undefined : undefined;
      })();
      blobs.set(id,pending);
    }
    return pending;
  };
  try {
    const recovered=await restoreStudioCachedMedia(scene,async id=>Boolean((await readAsset(id))?.size));
    const hydrated = await mapCanvasMedia(recovered, async ref => {
      const local=ref.startsWith('local-asset://');
      if (!local && !/^data:(image|video|audio)\//i.test(ref)) return ref;
      let pending = urls.get(ref);
      if (!pending) {
        pending = (async () => {
          const id=local?decodeURIComponent(ref.slice(14)):`inline-${crypto.randomUUID()}`;
          const blob = local ? await readAsset(id) : await (await fetch(ref)).blob();
          if (!blob?.size) throw new Error('项目的本机素材无法读取，请重试打开或从备份恢复');
          const url = URL.createObjectURL(blob); created.add(url); reverse.set(url,ref);
          assetIds.set(url,id);
          const kind=/^(image|video|audio)\//i.exec(blob.type)?.[1]?.toLowerCase();
          if(kind)mediaKinds.set(url,kind);
          return url;
        })();
        urls.set(ref,pending);
      }
      // Finish every field before releasing failed-open URLs; another file can
      // otherwise finish after the first rejection and leak its video buffer.
      return pending.catch(error=>{failures.push(error);return ref;});
    }) as StudioScene | undefined;
    if (failures.length) throw failures[0];
    // Legacy upload nodes can retain the default image kind after receiving a video.
    // Hydration has the actual file MIME; keep every renderer/preview on that kind.
    for(const node of hydrated?.nodes || []) {
      if(!['input-image','video-input','preview'].includes(node.type))continue;
      const kind=mediaKinds.get(String(node.content || ''));
      const settings=node.settings as Record<string,unknown>|undefined;
      if(!kind || kind==='image' && !settings?.mediaType && !node.previewType)continue;
      if(settings?.mediaType!==kind)node.settings={...settings,mediaType:kind};
      if(node.previewType && node.previewType!==kind)node.previewType=kind;
    }
    function serialize(value: unknown): unknown {
      if (typeof value === 'string') return reverse.get(value) || value;
      if (Array.isArray(value)) return value.map(serialize);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,serialize(item)]));
    }
    return { scene:hydrated, assetRefs:[...assetIds], serialize:(value:StudioScene)=>serialize(value) as StudioScene,
      dispose:()=>{for (const url of created) URL.revokeObjectURL(url);} };
  } catch (error) { for (const url of created) URL.revokeObjectURL(url); throw error; }
  finally { (await cache)?.close(); }
}

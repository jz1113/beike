import { createElement } from 'react';
import { uniqueCanvasProjectTitle } from '../model/creativeWorkflowProjects';
import { openDB } from 'idb';
import type { MediaAttachment } from '@client/store/appStoreTypes';
import { apiFetch } from '@client/shared/api/apiClient';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { registerCanvasWorkspaceBridge } from '@client/shared/workspace/canvasWorkspace';
import { buildCanvasArchive, completeCanvasArchive, mapCanvasMedia, restoreStudioCachedMedia } from '../model/canvasArchive';
import type { CanvasArchive } from '../model/canvasArchive';
import { isCanvasNodeVisible } from '../model/canvasGraph';
import type { CanvasProject, StudioScene } from '../model/types';
import { canvasMemoryWorkflow } from '../model/videoWorkflowRecovery';
import { canvasAssetDatabase, canvasProjectStorage, hasCanvasReadFailure, hasCanvasSaveFailure, serializeCanvasProject } from './canvasProjectDefaults';
import { saveCanvasProjects, useCanvasStore } from './useCanvasStore';
import '../components/editor/canvasLoadingSurface.css';

export function CanvasLoadingSurface() {
  return createElement(
    'div',
    { className: 'canvas-loading-surface', role: 'status', 'aria-busy': 'true' },
    createElement('span', { className: 'canvas-loading-label' }, '正在载入画布'),
    createElement('span', { className: 'canvas-loading-indicator', 'aria-hidden': 'true' }),
  );
}

export async function openCloudDraft(id: string, signal: AbortSignal): Promise<string> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('画布草稿链接无效');
  const response = await apiFetch(`/api/canvas/drafts/${id}`, { signal, cache: 'no-store' });
  if (response.status === 401 || response.status === 404) throw new Error('找不到草稿，请确认已登录贝壳并使用创建草稿的工作区。');
  if (!response.ok) throw new Error('读取线上草稿失败，请重试。');
  const { project } = (await response.json()) as { project: CanvasProject };
  if (!project?.id.startsWith(`cloud-canvas-${id}-r`) || !project.studioScene) throw new Error('线上草稿格式无效');
  signal.throwIfAborted();
  await saveCanvasProjects();
  signal.throwIfAborted();
  if (!useCanvasStore.getState().projects.some(item => item.id === project.id)) {
    useCanvasStore.setState(state => ({ projects: [project, ...state.projects] }));
    await saveCanvasProjects();
  }
  signal.throwIfAborted();
  return project.id;
}

async function openCanvasAssets(projectId: string) {
  const name = canvasAssetDatabase(projectId);
  if (!(await indexedDB.databases()).some(item => item.name === name)) return;
  return openDB(name);
}

export async function readCanvasAsset(projectId: string, id: string): Promise<Blob | undefined> {
  const db = await openCanvasAssets(projectId);
  try { return db?.objectStoreNames.contains('assets') ? (await db.get('assets', id))?.blob as Blob | undefined : undefined; }
  finally { db?.close(); }
}

export async function exportCanvasProject(project: CanvasProject, progress: (message: string) => void): Promise<Blob> {
  let cache:ReturnType<typeof openCanvasAssets> | undefined;
  const durable = serializeCanvasProject(project);
  const archiveTarget = durable.studioScene ? { ...durable, nodes: [], edges: undefined } : durable;
  try {
    return await buildCanvasArchive(archiveTarget, async id => {
      const db=await (cache ??= openCanvasAssets(project.id));
      return db?.objectStoreNames.contains('assets') ? (await db.get('assets',id))?.blob : undefined;
    }, fetchMediaBlob, progress);
  } finally { (await cache)?.close(); }
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
    const db = await openDB(canvasAssetDatabase(project.id), 1, { upgrade(database) {
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
    await canvasProjectStorage.setItem('beike_canvas_projects_store', {
      state:{projects,activeProjectId},version:0,
    });
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
      const assetId=assetIds.get(String(node.content||''));
      if(kind==='video'&&assetId&&!node._contentAssetId&&node.type!=='preview')node._contentAssetId=assetId;
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
    return { scene:hydrated, assetRefs:[...assetIds], serialize:<T>(value:T)=>serialize(value) as T,
      dispose:()=>{for (const url of created) URL.revokeObjectURL(url);} };
  } catch (error) { for (const url of created) URL.revokeObjectURL(url); throw error; }
  finally { (await cache)?.close(); }
}

function clipText(value: string | undefined, max: number): string | undefined {
  const clipped = (value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  return clipped || undefined;
}

function currentProject() {
  const canvasState = useCanvasStore.getState();
  return canvasState.projects.find((item) => item.id === canvasState.activeProjectId);
}

registerCanvasWorkspaceBridge({
  subscribe: (listener) => useCanvasStore.subscribe(listener),
  getSelection: () => {
    const canvasState = useCanvasStore.getState();
    const project = currentProject();
    const nodes = project?.nodes.filter(isCanvasNodeVisible) ?? [];
    return {
      activeNodeId: nodes.some(node => node.id === canvasState.activeNodeId) ? canvasState.activeNodeId : null,
      activeProject: project
        ? { id: project.id, workflow: canvasMemoryWorkflow(project), title: project.title, nodes }
        : undefined,
    };
  },
  getSnapshot: () => {
    const canvasState = useCanvasStore.getState();
    const project = currentProject();
    if (!project) {
      return {
        workspaceType: 'canvas',
        title: '未打开画布',
        summary: '当前没有已打开的画布项目。',
        nodeCount: 0,
      };
    }
    const visibleNodes = project.nodes.filter(isCanvasNodeVisible);
    const nodeTypes = visibleNodes.reduce<Record<string, number>>((counts, node) => {
      counts[node.type] = (counts[node.type] || 0) + 1;
      return counts;
    }, {});
    const activeNode = canvasState.activeNodeId
      ? visibleNodes.find((node) => node.id === canvasState.activeNodeId)
      : undefined;
    const nodes = visibleNodes
      .filter((node) => node.id !== activeNode?.id)
      .slice(-8)
      .map((node) => ({
        type: node.type,
        title: clipText(node.title || node.content, 100),
        status: node.status,
      }));
    return {
      workspaceType: 'canvas',
      title: project.title,
      summary: `画布中有 ${visibleNodes.length} 个可见节点。`,
      projectId: project.id,
      nodeCount: visibleNodes.length,
      nodeTypes,
      selectedNode: activeNode
        ? {
            type: activeNode.type,
            title: clipText(activeNode.title || activeNode.content, 120),
            status: activeNode.status,
          }
        : undefined,
      nodes,
    };
  },
  getAttachments: (): MediaAttachment[] => {
    const canvasState = useCanvasStore.getState();
    const project = currentProject();
    const node = project?.nodes.find((item) => item.id === canvasState.activeNodeId);
    if (!node || !isCanvasNodeVisible(node) || !['image', 'video', 'drawing'].includes(node.type)) return [];
    const isVideo = node.type === 'video' || node.generationKind === 'video';
    const url = isVideo ? node.videoUrl || node.imageUrl : node.imageUrl || node.videoUrl;
    if (!url) return [];
    const title = clipText(
      node.title || node.content || (isVideo ? '画布视频节点' : '画布图片节点'),
      48,
    );
    return [{
      id: `canvas-node-${node.id}`,
      type: isVideo ? 'video' : 'image',
      url,
      thumbnailUrl: isVideo ? node.imageUrl : undefined,
      name: `画布引用 · ${title || (isVideo ? '视频节点' : '图片节点')}`,
    }];
  },
});

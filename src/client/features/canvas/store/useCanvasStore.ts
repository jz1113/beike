import { deleteDB } from 'idb';
import { openDB } from 'idb';
import {
  canvasProjectStorage,
  canvasSaveError,
  canvasAssetDatabase,
  finishCanvasHydration,
  hasCanvasReadFailure,
  hasCanvasSaveFailure,
  hasStudioContent,
  isBuiltInCanvasProject,
  normalizeCanvasProjects,
  serializeCanvasProject,
  withBuiltInCanvasProjects,
} from './canvasProjectDefaults';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export type { CanvasProject, CanvasNode, CanvasEdge, NodeRunHistory } from '../model/types';
import type { CanvasProject, CanvasNode, CanvasEdge, NodeRunHistory, StudioScene } from '../model/types';
import { appendNodeRun, rollbackNodeRun } from '../model/canvasGraph';
import { studioSceneToCanvasGraph, syncCanvasGraphToStudioScene } from '../model/studioSceneAdapter';
import { reconcileStudioReferenceChanges } from '../model/studioHostRuntime';
import { createVideoWorkflowProject, type VideoWorkflowKind } from '../model/videoWorkflowProjects';
import {
  cloneCanvasProject,
  createNativeCommerceProject,
  isNativeCommerceKind,
  uniqueCanvasProjectTitle,
  type NativeCommerceKind,
} from '../model/creativeWorkflowProjects';

type CanvasWorkflowKind = VideoWorkflowKind | NativeCommerceKind;

/** Local asset IDs keep their graph references; their project-scoped files need an independent copy. */
async function copyCanvasMedia(sourceId: string, targetId: string): Promise<void> {
  const sourcePrefix = `beike.studio.${sourceId}.`;
  const targetPrefix = `beike.studio.${targetId}.`;
  if (typeof indexedDB.databases !== 'function') throw new Error('当前浏览器无法复制本地画布素材');
  for (const item of await indexedDB.databases()) {
    if (!item.name?.startsWith(sourcePrefix)) continue;
    const source = await openDB(item.name);
    let target: Awaited<ReturnType<typeof openDB>> | undefined;
    try {
      target = await openDB(targetPrefix + item.name.slice(sourcePrefix.length), source.version, {
        upgrade(db) {
          for (const name of source.objectStoreNames) {
            const store = source.transaction(name).objectStore(name);
            const copy = db.createObjectStore(name, { keyPath: store.keyPath, autoIncrement: store.autoIncrement });
            for (const indexName of store.indexNames) {
              const index = store.index(indexName);
              copy.createIndex(indexName, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
            }
          }
        },
      });
      for (const name of source.objectStoreNames) {
        const read = source.transaction(name);
        const [keys, values] = await Promise.all([read.store.getAllKeys(), read.store.getAll()]);
        await read.done;
        const write = target.transaction(name, 'readwrite');
        for (let index = 0; index < keys.length; index++) {
          if (write.store.keyPath === null) await write.store.put(values[index], keys[index]);
          else await write.store.put(values[index]);
        }
        await write.done;
      }
    } finally { source.close(); target?.close(); }
  }
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith(sourcePrefix)) storage.setItem(targetPrefix + key.slice(sourcePrefix.length), storage.getItem(key)!);
    }
  }
}

function createWorkflowProject(kind: CanvasWorkflowKind, id: string, now: number) {
  const project = isNativeCommerceKind(kind)
    ? createNativeCommerceProject(kind, id, now)
    : createVideoWorkflowProject(kind, id, now);
  if (project.studioScene) {
    const graph = studioSceneToCanvasGraph(project.studioScene);
    project.nodes = graph.nodes;
    project.edges = graph.edges;
    project.viewport = project.viewport ?? graph.viewport;
  }
  return project;
}

function withSyncedStudioScene(project: CanvasProject): CanvasProject {
  if (!project.studioScene && !project.nodes.length) return project;
  const nextScene = syncCanvasGraphToStudioScene(project);
  return {
    ...project,
    studioScene: project.studioScene
      ? reconcileStudioReferenceChanges(project.studioScene, nextScene)
      : nextScene,
  };
}

interface CanvasStoreState {
  projects: CanvasProject[];
  activeProjectId: string | null;
  /** 当前画布正在查看的节点，仅用于工作区联动，不持久化为项目内容。 */
  activeNodeId: string | null;
  selectProject: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  createProject: (title?: string, workflow?: CanvasWorkflowKind) => CanvasProject;
  updateProjectTitle: (id: string, title: string) => void;
  updateViewport: (id: string, viewport: NonNullable<CanvasProject['viewport']>) => void;
  duplicateProject: (id: string) => Promise<CanvasProject>;
  addNode: (projectId: string, node: Omit<CanvasNode, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  patchNodes: (projectId: string, patches: Record<string, Partial<CanvasNode>>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
  addEdge: (projectId: string, edge: Omit<CanvasEdge, 'id'> & { id?: string }) => void;
  addEdges: (projectId: string, edges: Array<Omit<CanvasEdge, 'id'> & { id?: string }>) => void;
  deleteEdge: (projectId: string, edgeId: string) => void;
  recordNodeRun: (projectId: string, nodeId: string, run: Omit<NodeRunHistory, 'id' | 'createdAt'>) => void;
  switchNodeRun: (projectId: string, nodeId: string, runIndex: number) => void;
  replaceGraph: (projectId: string, nodes: CanvasNode[], edges?: CanvasEdge[]) => void;
  syncStudioScene: (projectId: string, scene: StudioScene) => void;
}

export const useCanvasStore = create<CanvasStoreState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      activeNodeId: null,

      selectProject: (id) => set({ activeProjectId: id, activeNodeId: null }),
      selectNode: (id) => set({ activeNodeId: id }),

      createProject: (customTitle, workflow) => {
        if(!customTitle?.trim() && !workflow) {
          const draft=get().projects.find(project=>project.draft && !project.nodes.length && !hasStudioContent(project.studioScene));
          if(draft){set({activeProjectId:draft.id});return draft;}
        }
        const timestamp = Date.now();
        const id = `canvas-proj-${crypto.randomUUID()}`;
        const newProject: CanvasProject = workflow ? createWorkflowProject(workflow, id, timestamp) : {
          id,
          title: customTitle?.trim() || '未命名项目',
          draft:!customTitle?.trim(),
          subtitle: '画布 · 刚刚修改',
          thumbnail: undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
          nodes: [],
        };

        newProject.title = uniqueCanvasProjectTitle(newProject.title, get().projects);
        set((state) => ({
          projects: [newProject, ...state.projects],
          activeProjectId: newProject.id,
        }));

        return newProject;
      },

      updateViewport: (id, viewport) => {
        if (![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) || viewport.zoom < 0.1 || viewport.zoom > 2.5) return;
        set(state => ({projects:state.projects.map(project => {
          if (project.id !== id) return project;
          if (project.viewport?.x === viewport.x && project.viewport.y === viewport.y && project.viewport.zoom === viewport.zoom) return project;
          const next = { ...project, viewport: { ...viewport } };
          return project.studioScene
            ? { ...next, studioScene: { ...project.studioScene, view: next.viewport } }
            : withSyncedStudioScene(next);
        })}));
      },

      updateProjectTitle: (id, title) => {
        if (!title.trim()) return;
        const cleanTitle = uniqueCanvasProjectTitle(title, get().projects, id);
        if(!cleanTitle)return;
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, title: cleanTitle, draft:false, updatedAt: Date.now(), subtitle: '画布 · 刚刚修改' } : p,
          ),
        }));
      },

      duplicateProject: async (id) => {
        if (hasCanvasReadFailure()) throw new Error('请先重试读取本机项目');
        const source = get().projects.find(project => project.id === id);
        if (!source) throw new Error('原项目不存在');
        const copy = cloneCanvasProject(serializeCanvasProject(source), `canvas-proj-${crypto.randomUUID()}`);
        await copyCanvasMedia(id, copy.id);
        set(state => { copy.title = uniqueCanvasProjectTitle(copy.title, state.projects); return { projects: [copy, ...state.projects] }; });
        return copy;
      },

      addNode: (projectId, nodeData) => {
        const newNode: CanvasNode = {
          ...nodeData,
          id: nodeData.id || `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: nodeData.createdAt || Date.now(),
        };

        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const updatedNodes = [...p.nodes, newNode];
            const firstImage = updatedNodes.find((n) => (n.type === 'image' && n.imageUrl) || (n.type === 'video' && (n.imageUrl || n.videoUrl)))?.imageUrl;
            return withSyncedStudioScene({
              ...p,
              nodes: updatedNodes,
              title:p.draft ? (newNode.title?.trim().slice(0,30) || '创作画布') : p.title,
              draft:false,
              thumbnail: firstImage || p.thumbnail,
              updatedAt: Date.now(),
              subtitle: '画布 · 刚刚修改',
            });
          }),
        }));
      },

      updateNode: (projectId, nodeId, patch) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const updatedNodes = p.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n));
            const firstImage = updatedNodes.find((n) => (n.type === 'image' && n.imageUrl) || (n.type === 'video' && (n.imageUrl || n.videoUrl)))?.imageUrl;
            return withSyncedStudioScene({
              ...p,
              updatedAt: Date.now(),
              nodes: updatedNodes,
              thumbnail: firstImage || p.thumbnail,
            });
          }),
        }));
      },

      patchNodes: (projectId, patches) => set(state => ({projects:state.projects.map(project => project.id === projectId ? withSyncedStudioScene({...project, updatedAt:Date.now(), nodes:project.nodes.map(node => patches[node.id] ? {...node,...patches[node.id]} : node)}) : project)})),

      deleteNode: (projectId, nodeId) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return withSyncedStudioScene({
              ...p,
              updatedAt: Date.now(),
              nodes: p.nodes.filter((n) => n.id !== nodeId).map(n => n.referenceNodeIds?.includes(nodeId) ? {...n, referenceNodeIds: n.referenceNodeIds.filter(id => id !== nodeId)} : n),
              edges: (p.edges || []).filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
            });
          }),
          activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        }));
      },

      addEdge: (projectId, edgeData) => {
        get().addEdges(projectId, [edgeData]);
      },

      addEdges: (projectId, edgeList) => {
        if (!edgeList.length) return;
        const now = Date.now();
        const newEdges: CanvasEdge[] = edgeList.map((edgeData, idx) => ({
          ...edgeData,
          id: edgeData.id || `edge-${edgeData.sourceNodeId}-${edgeData.targetNodeId}-${(now + idx).toString(36)}`,
          createdAt: edgeData.createdAt || now,
        }));
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const pairKeys = new Set(newEdges.map(e => `${e.sourceNodeId}->${e.targetNodeId}`));
            const edges = [
              ...(p.edges || []).filter(e => !pairKeys.has(`${e.sourceNodeId}->${e.targetNodeId}`)),
              ...newEdges,
            ];
            const sourcesByTarget = new Map<string, string[]>();
            for (const edge of newEdges) {
              const list = sourcesByTarget.get(edge.targetNodeId) || [];
              list.push(edge.sourceNodeId);
              sourcesByTarget.set(edge.targetNodeId, list);
            }
            const nodes = p.nodes.map(n => {
              const incoming = sourcesByTarget.get(n.id);
              if (incoming) {
                const refs = Array.from(new Set([...(n.referenceNodeIds || []), ...incoming]));
                return { ...n, referenceNodeIds: refs };
              }
              return n;
            });
            return withSyncedStudioScene({ ...p, edges, nodes, updatedAt: now });
          }),
        }));
      },

      deleteEdge: (projectId, edgeId) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const targetEdge = (p.edges || []).find(e => e.id === edgeId);
            const edges = (p.edges || []).filter(e => e.id !== edgeId);
            let nodes = p.nodes;
            if (targetEdge) {
              const stillConnected = edges.some(e => e.sourceNodeId === targetEdge.sourceNodeId && e.targetNodeId === targetEdge.targetNodeId);
              if (!stillConnected) {
                nodes = nodes.map(n => n.id === targetEdge.targetNodeId ? {
                  ...n,
                  referenceNodeIds: (n.referenceNodeIds || []).filter(id => id !== targetEdge.sourceNodeId),
                } : n);
              }
            }
            return withSyncedStudioScene({ ...p, edges, nodes, updatedAt: Date.now() });
          }),
        }));
      },

      recordNodeRun: (projectId, nodeId, run) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return withSyncedStudioScene({
              ...p,
              updatedAt: Date.now(),
              nodes: p.nodes.map(n => {
                if (n.id !== nodeId) return n;
                const patch = appendNodeRun(n, run);
                return { ...n, ...patch };
              }),
            });
          }),
        }));
      },

      switchNodeRun: (projectId, nodeId, runIndex) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return withSyncedStudioScene({
              ...p,
              updatedAt: Date.now(),
              nodes: p.nodes.map(n => {
                if (n.id !== nodeId) return n;
                const patch = rollbackNodeRun(n, runIndex);
                return patch ? { ...n, ...patch } : n;
              }),
            });
          }),
        }));
      },

      replaceGraph: (projectId, nodes, edges) => {
        set(state => ({ projects: state.projects.map(project => project.id === projectId
          ? withSyncedStudioScene({ ...project, nodes, edges, updatedAt: Date.now() })
          : project) }));
      },

      syncStudioScene: (projectId, scene) => {
        if (!Array.isArray(scene?.nodes) || !Array.isArray(scene.connections)) return;
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const reconciled = reconcileStudioReferenceChanges(p.studioScene, scene);
            const graph = studioSceneToCanvasGraph(reconciled);
            return {
              ...p,
              studioScene: reconciled,
              nodes: graph.nodes,
              edges: graph.edges,
              viewport: graph.viewport,
              draft: p.draft && !hasStudioContent(reconciled),
              updatedAt: Date.now(),
            };
          }),
        }));
      },
    }),
    {
      name: 'beike_canvas_projects_store',
      onRehydrateStorage: () => (state, error) => { if (!error) finishCanvasHydration(state?.projects); },
      merge:(persisted,current)=>{
        const saved = persisted as {projects?:CanvasProject[]; activeProjectId?: string | null} | undefined;
        return {
          ...current,
        projects:normalizeCanvasProjects(withBuiltInCanvasProjects(saved?.projects || [])),
        activeProjectId: saved?.activeProjectId ?? current.activeProjectId,
        activeNodeId: null,
        };
      },
      storage: canvasProjectStorage,
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

export async function saveCanvasProjects(): Promise<void> {
  if (hasCanvasReadFailure()) await useCanvasStore.persist.rehydrate();
  if (hasCanvasReadFailure()) throw new Error('无法读取本机项目，请稍后重试');
  if (!useCanvasStore.persist.hasHydrated()) throw new Error('项目仍在读取，请稍后重试');
  const { projects, activeProjectId } = useCanvasStore.getState();
  await canvasProjectStorage.setItem('beike_canvas_projects_store', { state: { projects, activeProjectId }, version: 0 });
  if (hasCanvasSaveFailure()) throw new Error(canvasSaveError() || '项目保存失败，请检查本机存储空间后重试');
}

/** Failed deletion keeps its project available for another attempt. */
export async function deleteCanvasProject(id: string): Promise<void> {
  if (isBuiltInCanvasProject(id)) throw new Error('系统内置演示画布无法删除');
  // Ensure a legacy project has been migrated before removing it and its backup entry.
  await saveCanvasProjects();
  const { projects, activeProjectId } = useCanvasStore.getState();
  const index = projects.findIndex(project => project.id === id);
  if (index === -1) return;
  useCanvasStore.setState({
    projects: projects.filter(project => project.id !== id),
    activeProjectId: activeProjectId === id ? null : activeProjectId,
  });
  try {
    await saveCanvasProjects();
  } catch (error) {
    useCanvasStore.setState(state => {
      const remaining = [...state.projects];
      if (!remaining.some(project => project.id === id)) remaining.splice(index, 0, projects[index]);
      return { projects: remaining, activeProjectId: state.activeProjectId ?? activeProjectId };
    });
    throw error;
  }
  // The project record is committed first. An open tab may delay cache deletion.
  void deleteDB(canvasAssetDatabase(id)).catch(error => console.warn('无法清理画布素材缓存', error));
}

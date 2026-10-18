import {normalizeCanvasProjects} from './canvasProjectDefaults';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { canvasStorage, finishCanvasHydration } from './canvasPersistence';
export type { CanvasProject, CanvasNode, CanvasEdge, NodeRunHistory } from '../model/types';
import type { CanvasProject, CanvasNode, CanvasEdge, NodeRunHistory } from '../model/types';
import { appendNodeRun, rollbackNodeRun } from '../model/canvasGraph';

interface CanvasStoreState {
  projects: CanvasProject[];
  activeProjectId: string | null;
  /** 当前画布正在查看的节点，仅用于工作区联动，不持久化为项目内容。 */
  activeNodeId: string | null;
  selectProject: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  createProject: (title?: string) => CanvasProject;
  updateProjectTitle: (id: string, title: string) => void;
  deleteProject: (id: string) => void;
  addNode: (projectId: string, node: Omit<CanvasNode, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  patchNodes: (projectId: string, patches: Record<string, Partial<CanvasNode>>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
  addEdge: (projectId: string, edge: Omit<CanvasEdge, 'id'> & { id?: string }) => void;
  deleteEdge: (projectId: string, edgeId: string) => void;
  recordNodeRun: (projectId: string, nodeId: string, run: Omit<NodeRunHistory, 'id' | 'createdAt'>) => void;
  switchNodeRun: (projectId: string, nodeId: string, runIndex: number) => void;
}

export const useCanvasStore = create<CanvasStoreState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      activeNodeId: null,

      selectProject: (id) => set({ activeProjectId: id, activeNodeId: null }),
      selectNode: (id) => set({ activeNodeId: id }),

      createProject: (customTitle) => {
        if(!customTitle?.trim()) {
          const draft=get().projects.find(project=>project.draft && !project.nodes.length);
          if(draft){set({activeProjectId:draft.id});return draft;}
        }
        const timestamp = Date.now();
        const newProject: CanvasProject = {
          id: `canvas-proj-${crypto.randomUUID()}`,
          title: customTitle?.trim() || '未命名项目',
          draft:!customTitle?.trim(),
          subtitle: '画布 · 刚刚修改',
          thumbnail: undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
          nodes: [],
        };

        set((state) => ({
          projects: [newProject, ...state.projects],
          activeProjectId: newProject.id,
        }));

        return newProject;
      },

      updateProjectTitle: (id, title) => {
        const cleanTitle = title.trim();
        if(!cleanTitle)return;
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, title: cleanTitle, draft:false, updatedAt: Date.now(), subtitle: '画布 · 刚刚修改' } : p,
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
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
            return {
              ...p,
              nodes: updatedNodes,
              title:p.draft ? (newNode.title?.trim().slice(0,30) || '创作画布') : p.title,
              draft:false,
              thumbnail: firstImage || p.thumbnail,
              updatedAt: Date.now(),
              subtitle: '画布 · 刚刚修改',
            };
          }),
        }));
      },

      updateNode: (projectId, nodeId, patch) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const updatedNodes = p.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n));
            const firstImage = updatedNodes.find((n) => (n.type === 'image' && n.imageUrl) || (n.type === 'video' && (n.imageUrl || n.videoUrl)))?.imageUrl;
            return {
              ...p,
              updatedAt: Date.now(),
              nodes: updatedNodes,
              thumbnail: firstImage || p.thumbnail,
            };
          }),
        }));
      },

      patchNodes: (projectId, patches) => set(state => ({projects:state.projects.map(project => project.id === projectId ? {...project, updatedAt:Date.now(), nodes:project.nodes.map(node => patches[node.id] ? {...node,...patches[node.id]} : node)} : project)})),

      deleteNode: (projectId, nodeId) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              updatedAt: Date.now(),
              nodes: p.nodes.filter((n) => n.id !== nodeId).map(n => n.referenceNodeIds?.includes(nodeId) ? {...n, referenceNodeIds: n.referenceNodeIds.filter(id => id !== nodeId)} : n),
              edges: (p.edges || []).filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
            };
          }),
          activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        }));
      },

      addEdge: (projectId, edgeData) => {
        const newEdge: CanvasEdge = {
          ...edgeData,
          id: edgeData.id || `edge-${edgeData.sourceNodeId}-${edgeData.targetNodeId}-${Date.now().toString(36)}`,
          createdAt: edgeData.createdAt || Date.now(),
        };
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const edges = [...(p.edges || []).filter(e => !(e.sourceNodeId === newEdge.sourceNodeId && e.targetNodeId === newEdge.targetNodeId)), newEdge];
            const nodes = p.nodes.map(n => {
              if (n.id === newEdge.targetNodeId) {
                const refs = Array.from(new Set([...(n.referenceNodeIds || []), newEdge.sourceNodeId]));
                return { ...n, referenceNodeIds: refs };
              }
              return n;
            });
            return { ...p, edges, nodes, updatedAt: Date.now() };
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
            return { ...p, edges, nodes, updatedAt: Date.now() };
          }),
        }));
      },

      recordNodeRun: (projectId, nodeId, run) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              updatedAt: Date.now(),
              nodes: p.nodes.map(n => {
                if (n.id !== nodeId) return n;
                const patch = appendNodeRun(n, run);
                return { ...n, ...patch };
              }),
            };
          }),
        }));
      },

      switchNodeRun: (projectId, nodeId, runIndex) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              updatedAt: Date.now(),
              nodes: p.nodes.map(n => {
                if (n.id !== nodeId) return n;
                const patch = rollbackNodeRun(n, runIndex);
                return patch ? { ...n, ...patch } : n;
              }),
            };
          }),
        }));
      },
    }),
    {
      name: 'beike_canvas_projects_store',
      onRehydrateStorage: () => (_state, error) => { if (!error) finishCanvasHydration(); },
      merge:(persisted,current)=>{
        const saved = persisted as {projects?:CanvasProject[]; activeProjectId?: string | null} | undefined;
        return {
          ...current,
        projects:normalizeCanvasProjects(saved?.projects || []),
        activeProjectId: saved?.activeProjectId ?? current.activeProjectId,
        activeNodeId: null,
        };
      },
      storage: createJSONStorage(() => canvasStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

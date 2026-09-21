import {normalizeCanvasProjects} from './canvasProjectDefaults';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { canvasStorage } from './canvasPersistence';
export type { CanvasProject, CanvasNode } from '../types';
import type { CanvasProject, CanvasNode } from '../types';

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
          id: (nodeData as any).id || `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: (nodeData as any).createdAt || Date.now(),
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
            };
          }),
          activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        }));
      },
    }),
    {
      name: 'beike_canvas_projects_store',
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

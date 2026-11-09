import { openDB } from 'idb';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { createNativeCommerceProject, normalizeCanvasProjectTitles, upgradeNativeCommerceProject } from '../model/creativeWorkflowProjects';
import { createVideoWorkflowProject, upgradeVideoWorkflowProject } from '../model/videoWorkflowProjects';
import { normalizeRetiredImageTool, studioSceneToCanvasGraph } from '../model/studioSceneAdapter';
import type {CanvasProject, StudioScene} from '../model/types';

const legacyCommerceVideoId = 'canvas-proj-0ce0a1ff-d832-4e8c-bdbc-4958e0173073';
const builtInProjects = [
  { id: 'canvas-proj-ae2b76ea-4b54-486d-b93b-553972331709', title: '电商视频 · 新版', kind: 'depth-copy' },
  { id: 'canvas-proj-a714dcc3-884f-4d7e-8506-75bb9f236d51', title: '封面生成', kind: 'poster' },
  { id: 'canvas-proj-48b418d5-2107-4be4-aecf-15550440a32a', title: '电商图文', kind: 'workshop' },
] as const;
const retiredSalesProjectId = 'canvas-proj-70fc9c00-d162-423f-b5bf-4d6be5860b0c';

export function isBuiltInCanvasProject(id: string): boolean {
  return id === retiredSalesProjectId || id === legacyCommerceVideoId || builtInProjects.some(project => project.id === id);
}

let generatedSeedIds = new Set<string>();

export function withBuiltInCanvasProjects(projects: CanvasProject[]): CanvasProject[] {
  const missing = builtInProjects.filter(demo => !projects.some(project => project.id === demo.id));
  generatedSeedIds = new Set(missing.map(demo => demo.id));
  const now = Date.now();
  return [...projects, ...missing.map(({ id, title, kind }) => ({
    ...(kind === 'depth-copy' ? createVideoWorkflowProject(kind, id, now) : createNativeCommerceProject(kind, id, now)),
    title,
  }))];
}

let connection: ReturnType<typeof openDB> | undefined;
const database = () =>
  (connection ??= openDB('beike-canvas-projects', 1, {
    upgrade(db) {
      db.createObjectStore('projects');
      db.createObjectStore('meta');
    },
  }).catch(error => {
    connection = undefined;
    throw error;
  }));
let pending: Promise<void> = Promise.resolve();
let writeVersion = 0;
let saveFailed = false;
let saveError: unknown;
export const canvasSaveError = () => saveError instanceof Error ? saveError.message : undefined;
let readFailed = false;
let hydrated = false;
type CanvasSnapshot = StorageValue<{ projects: CanvasProject[]; activeProjectId?: string | null }>;
type CanvasManifest = { ids: string[]; version?: number; revisions?: Record<string, string> };
const initialSeeds = new WeakSet<CanvasProject>();
let baseline = new Map<string, CanvasProject>();
let revisions: Record<string, string> | undefined;
const projectSerializers = new Map<string, (project: CanvasProject) => CanvasProject>();
export function setCanvasProjectSerializer(id: string, serialize?: (project: CanvasProject) => CanvasProject) {
  if (serialize) projectSerializers.set(id, serialize);
  else projectSerializers.delete(id);
}
export function serializeCanvasProject(project: CanvasProject): CanvasProject {
  return projectSerializers.get(project.id)?.(project) ?? project;
}

export const finishCanvasHydration = (projects?: CanvasProject[]) => {
  if (revisions && projects) {
    baseline = new Map(projects.filter(project => baseline.has(project.id)).map(project => [project.id, project]));
  }
  for (const project of projects ?? []) {
    if (generatedSeedIds.has(project.id)) initialSeeds.add(project);
  }
  hydrated = true;
};
export const hasCanvasSaveFailure = () => saveFailed;
export const hasCanvasReadFailure = () => readFailed;
function reportFailure(error?: unknown) {
  saveError = error;
  saveFailed = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('canvas-save-error'));
}
async function checkLegacyMedia(projects: CanvasProject[]) {
  const probes = new Map<string, CanvasProject['nodes']>();
  for (const project of projects) {
    for (const node of project.nodes || []) {
      const url = node.audioUrl || node.videoUrl || node.imageUrl;
      if (typeof url !== 'string' || !url.startsWith('blob:')) continue;
      const nodes = probes.get(url) || [];
      nodes.push(node);
      probes.set(url, nodes);
    }
  }
  const entries = probes.entries();
  // Bound browser work on old libraries, and probe a shared Blob URL only once.
  await Promise.all(
    Array.from({ length: Math.min(6, probes.size) }, async () => {
      for (const [url, nodes] of entries) {
        let available = false;
        try {
          const response = await fetch(url);
          available = response.ok;
          void response.body?.cancel().catch(() => {});
        } catch {
          /* Legacy object URLs often expire when the tab closes. */
        }
        if (!available) for (const node of nodes) node.missingMedia = true;
      }
    }),
  );
}
function removeDeletedProjectsFromLegacyBackup(name: string, removed: string[]) {
  const backup = localStorage.getItem(name);
  if (!backup) return;
  let parsed: CanvasSnapshot;
  try { parsed = JSON.parse(backup); }
  catch { return; }
  const projects = parsed?.state?.projects;
  if (!Array.isArray(projects)) return;
  const remaining = projects.filter(project => !removed.includes(project.id));
  if (remaining.length === projects.length) return;
  const activeProjectId = parsed.state.activeProjectId;
  localStorage.setItem(name, JSON.stringify({
    ...parsed,
    state: {
      ...parsed.state,
      projects: remaining,
      activeProjectId: activeProjectId && removed.includes(activeProjectId) ? null : activeProjectId,
    },
  }));
}

/** Projects are stored asynchronously; the legacy migration backup excludes deleted projects. */
export const canvasProjectStorage: PersistStorage<CanvasSnapshot['state']> = {
  async getItem(name) {
    try {
      const db = await database();
      // Read the index and its records in one transaction so another tab cannot
      // delete a project between reading the manifest and reading that project.
      const tx = db.transaction(['meta', 'projects'], 'readonly');
      const manifest: CanvasManifest | undefined = await tx.objectStore('meta').get(name);
      if (manifest) {
        const projects: CanvasProject[] = await Promise.all(manifest.ids.map(id => tx.objectStore('projects').get(id)));
        await tx.done;
        if (projects.some(project => !project)) throw new Error('项目数据不完整');
        await checkLegacyMedia(projects);
        revisions = manifest.revisions ?? {};
        baseline = new Map(projects.map(project => [project.id, project]));
        readFailed = false;
        return { state: { projects }, version: manifest.version };
      }
      await tx.done;
      revisions = undefined;
      baseline = new Map();
      const backup = localStorage.getItem(name);
      const parsed = backup ? JSON.parse(backup) : null;
      if (parsed) await checkLegacyMedia(parsed.state?.projects || []);
      readFailed = false;
      return parsed;
    } catch {
      readFailed = true;
      reportFailure();
      return null;
    }
  },
  async setItem(name, value) {
    // Route/selection updates can happen before IndexedDB hydration. Never persist that empty initial state.
    if (!hydrated || readFailed) return;
    const version = ++writeVersion;
    const serializers = new Map(projectSerializers);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('canvas-save-start'));
    pending = pending.catch(() => {}).then(async () => {
      if (version !== writeVersion) return;
      const next = new Map(value.state.projects.map(project => [project.id, project]));
      const removed = [...baseline.keys()].filter(id => !next.has(id));
      if (removed.some(isBuiltInCanvasProject)) throw new Error('系统内置演示画布无法删除');
      const changed = value.state.projects.filter(project => baseline.get(project.id) !== project);
      if (removed.length || changed.length) {
        const db = await database();
        const tx = db.transaction(['meta', 'projects'], 'readwrite');
        const meta = tx.objectStore('meta');
        const old: CanvasManifest | undefined = await meta.get(name);
        const ids = new Set(old?.ids);
        const currentRevisions = { ...old?.revisions };
        const writes = changed.filter(project => !(initialSeeds.has(project) && !baseline.has(project.id) && ids.has(project.id)));
        for (const id of [...removed, ...writes.map(project => project.id)]) {
          if (ids.has(id) !== baseline.has(id) || currentRevisions[id] !== revisions?.[id]) {
            await tx.done;
            throw new Error('画布已在另一个窗口修改。请先导出此窗口的编辑，再重新打开画布。');
          }
        }
        const projects = tx.objectStore('projects');
        const nextRevisions = { ...revisions };
        if (removed.length) removeDeletedProjectsFromLegacyBackup(name, removed);
        for (const id of removed) {
          await projects.delete(id);
          ids.delete(id);
          delete currentRevisions[id];
          delete nextRevisions[id];
        }
        for (const project of writes) {
          await projects.put(serializers.get(project.id)?.(project) ?? project, project.id);
          ids.add(project.id);
          currentRevisions[project.id] = nextRevisions[project.id] = crypto.randomUUID();
        }
        await meta.put({ ids: [...ids], revisions: currentRevisions, version: value.version }, name);
        await tx.done;
        revisions = nextRevisions;
      }
      baseline = next;
      saveFailed = false;
      saveError = undefined;
      if (version === writeVersion && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('canvas-save-complete'));
    });
    try {
      // A newer automatic save can supersede this write while it is queued.
      // Explicit callers must still wait until that latest snapshot reaches disk.
      let writing: Promise<void>;
      do {
        writing = pending;
        await writing;
      } while (writing !== pending);
    } catch (error) {
      reportFailure(error);
    }
  },
  async removeItem(name) {
    await pending.catch(() => {});
    const db = await database();
    await db.delete('meta', name);
  },
};

/** 仅用于滤掉早期内置 Unsplash 演示项目，不再作为运行时素材来源。 */
const LEGACY_PROJECTS: CanvasProject[] = [
  {
    id: 'project-preset-1',
    title: '未命名项目',
    subtitle: '画布 · 1天前修改',
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000,
    nodes: [
      {
        id: 'node-1',
        type: 'image',
        title: '魔幻角色多视角分镜',
        imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
        x: 100,
        y: 120,
        width: 320,
        height: 240,
        createdAt: Date.now(),
      },
      {
        id: 'node-2',
        type: 'note',
        title: '分镜灵感便签',
        content: '主色调以深邃星光与晨曦微金为主，强调景深层级与人物表情生动度。',
        x: 460,
        y: 120,
        width: 260,
        height: 180,
        createdAt: Date.now(),
      },
    ],
  },
  {
    id: 'project-preset-2',
    title: '未命名项目',
    subtitle: '画布 · 1天前修改',
    thumbnail: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000,
    nodes: [
      {
        id: 'node-3',
        type: 'image',
        title: '三视图设定稿',
        imageUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
        x: 140,
        y: 100,
        width: 380,
        height: 260,
        createdAt: Date.now(),
      },
    ],
  },
];


export function hasStudioContent(scene?: StudioScene): boolean {
  return !!scene && [scene.nodes, scene.connections, scene.groups, scene.strokes, scene.textBoxes].some(list => list?.length > 0);
}

/** 使用可再次打开的图片地址，跳过音视频正文和页面临时 blob。 */
export function studioCover(scene?: StudioScene): string | undefined {
  for (const node of scene?.nodes ?? []) {
    const settings = node.settings as Record<string,unknown> | undefined;
    if (node.videoUrl || node.type === 'gen-video' || ['audio','video'].includes(String(node.previewType ?? settings?.mediaType))) {
      continue;
    }
    const images = settings?.generatedImages ?? node.generatedImages;
    const selected = Array.isArray(images) ? images[Number(settings?.selectedImageIndex)] : undefined;
    const candidates = Array.isArray(images)
      ? images.flatMap(item => [item?.thumbUrl, item?.fullUrl])
      : [];
    if (selected) candidates.unshift(selected.thumbUrl, selected.fullUrl);
    candidates.push(node.imageUrl);
    if (['gen-image', 'input-image', 'preview'].includes(node.type)) {
      candidates.push(node.content);
    }
    const cover = candidates.find(value => typeof value === 'string' && /^(?:https?:\/\/|\/storage\/|data:image\/)/i.test(value));
    if (typeof cover === 'string') return cover;
  }
}

export function normalizeCanvasProjects(projects:CanvasProject[]) {
  const normalized = projects.filter(project=> !LEGACY_PROJECTS.some(legacy=>{
    if(hasStudioContent(project.studioScene) || project.id!==legacy.id || project.title!==legacy.title || project.nodes.length!==legacy.nodes.length)return false;
    return project.nodes.every((node,index)=>{
      const expected=legacy.nodes[index];
      const keys=new Set([...Object.keys(node),...Object.keys(expected)]);
      return [...keys].every(key=>key==='createdAt' || JSON.stringify(node[key as keyof typeof node])===JSON.stringify(expected[key as keyof typeof expected]));
    });
  })).map(project => {
    const rest = { ...upgradeNativeCommerceProject(upgradeVideoWorkflowProject(project)) } as CanvasProject & { productionDraft?: unknown };
    if (rest.id === legacyCommerceVideoId && rest.title === '视频复刻') rest.title = '电商视频';
    delete rest.productionDraft;
    rest.nodes = rest.nodes.map(node => {
      const subtype = String(node.studioSubType);
      if (subtype === 'custom-agent') return { ...node, studioSubType: undefined };
      if (subtype !== 'inpaint-crop' && subtype !== 'inpaint-stitch') return node;
      const migrated: typeof node & { inpaintMode?: unknown } = {
        ...node,
        type: node.imageUrl ? 'image' : 'note',
        studioSubType: undefined,
        studioRaw: node.studioRaw && normalizeRetiredImageTool(node.studioRaw),
      };
      delete migrated.inpaintMode;
      return migrated;
    });
    // Imported workflow text may use content; Studio renders its saved text from settings.text.
    if (rest.studioScene) rest.studioScene = { ...rest.studioScene, nodes: rest.studioScene.nodes.map(saved => {
      const node = normalizeRetiredImageTool(saved);
      if (node.type === 'custom-agent') return { ...node, type: 'text-node' };
      const settings = node.settings as Record<string, unknown> | undefined;
      return node.type === 'text-node' && node.id.startsWith(`${rest.id}-step-`) && typeof node.content === 'string' && settings?.text === undefined
        ? { ...node, settings: { ...settings, text: node.content, aiGenerated: true } } : node;
    }) };
    if (rest.studioScene?.nodes.length && !rest.nodes.length) {
      const graph = studioSceneToCanvasGraph(rest.studioScene);
      rest.nodes = graph.nodes;
      rest.edges = graph.edges;
      rest.viewport = rest.viewport ?? graph.viewport;
    }
    const title = rest.title?.trim() || '';
    // 早期草稿可能被错误写入单个数字（如 "1"）。无节点时这不是有效名称，统一回到未命名状态。
    const isUntitled = !title || title === '未命名项目' || title === '新建画布' || (!rest.nodes.length && /^\d+$/.test(title));
    if (!isUntitled) return rest;

    const firstNodeTitle = rest.nodes.find(node => node.title?.trim())?.title?.trim().slice(0, 30);
    return {
      ...rest,
      title: firstNodeTitle || '未命名项目',
      draft: !rest.nodes.length && !hasStudioContent(rest.studioScene),
    };
  });
  const visible = normalizeCanvasProjectTitles(normalized.filter(project => project.id !== retiredSalesProjectId));
  const byId = new Map(visible.map(project => [project.id, project]));
  return normalized.map(project => byId.get(project.id) ?? project);
}
export const visibleCanvasProjects = (projects:CanvasProject[]) => normalizeCanvasProjects(projects)
  .filter(project => project.id !== retiredSalesProjectId)
  .filter(project => !project.draft || project.nodes.length > 0 || hasStudioContent(project.studioScene))
  .sort((a,b) => b.updatedAt - a.updatedAt);

export const canvasAssetDatabase = (id: string) => `beike.studio.${id}.QiaodoumayiAssetCache`;

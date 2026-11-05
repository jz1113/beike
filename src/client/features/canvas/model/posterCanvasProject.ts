import { businessCanvasNodeLayout } from './businessCanvasLayout';
import type { CanvasProject } from './types';

export const posterCanvasStages = {
  'poster-template': '封面模板',
  'poster-input': '商品与标题',
  'poster-production': '封面生成',
  'poster-export': '封面交付',
} as const;
export type PosterCanvasStage = keyof typeof posterCanvasStages;
const stages = Object.keys(posterCanvasStages) as PosterCanvasStage[];
const hints = ['投喂参考封面并保存模板，或选择已有模板。模板库跨项目复用。',
  '导入商品图与标题，检查生产清单。支持表格、文件和粘贴导入。',
  '配置模型与画质，开始生成或重试。关闭面板后继续等待任务。',
  '检查成品，下载单张封面、原始场景或打包交付。'];

export function createPosterCanvasProject(id: string, now: number): CanvasProject {
  const nodes = stages.map((stage, index) => ({
    id: `${id}-${stage}`, type: 'text-node', nodeName: `${index + 1}. ${posterCanvasStages[stage]}`,
    ...businessCanvasNodeLayout('poster', stage),
    settings: { aiGenerated: true, beikeInlineVersion: 3, beikeAutoHeight: businessCanvasNodeLayout('poster', stage).height, beikeBusinessStage: stage, beikeBusinessState: 'idle', text: hints[index] },
  }));
  return { id, title: '封面画布', createdAt: now, updatedAt: now, draft: false, nodes: [], poster: { version: 2 },
    studioScene: { nodes, connections: stages.slice(1).map((stage, index) => ({ id: `${id}-${stages[index]}-${stage}`, from: `${id}-${stages[index]}`, to: `${id}-${stage}` })),
      groups: [], strokes: [], textBoxes: [], view: { x: 30, y: 45, zoom: 0.8 } } };
}

/** Upgrade only the earlier two-node schema; intentionally removed v2 nodes stay removed. */
export function upgradePosterCanvasProject(project: CanvasProject): CanvasProject {
  if (project.poster?.version !== 1 || !project.studioScene) return project;
  const defaults = createPosterCanvasProject(project.id, project.createdAt).studioScene!;
  const nodes = [...project.studioScene.nodes];
  const ids = new Map<string, string>();
  for (const node of defaults.nodes) {
    const stage = (node.settings as Record<string, unknown>).beikeBusinessStage;
    const existing = nodes.find(row => (row.settings as Record<string, unknown>)?.beikeBusinessStage === stage);
    if (!existing) nodes.push(node);
    ids.set(node.id, existing?.id || node.id);
  }
  const oldFrom = ids.get(`${project.id}-poster-template`), oldTo = ids.get(`${project.id}-poster-production`);
  const connections = project.studioScene.connections.filter(edge => !(edge.from === oldFrom && edge.to === oldTo));
  for (const edge of defaults.connections) {
    const from = ids.get(edge.from)!, to = ids.get(edge.to)!;
    if (!connections.some(row => row.from === from && row.to === to)) connections.push({ ...edge, from, to });
  }
  return { ...project, poster: { ...project.poster, version: 2 }, studioScene: { ...project.studioScene, nodes, connections } };
}

export function posterCanvasBlockReasons(project: CanvasProject): Partial<Record<PosterCanvasStage, string>> {
  const blocked: Partial<Record<PosterCanvasStage, string>> = {};
  for (let index = 1; index < stages.length; index++) {
    const from = stages[index - 1], to = stages[index];
    const sources = project.studioScene?.nodes.filter(node => (node.settings as Record<string, unknown>)?.beikeBusinessStage === from) || [];
    const targets = project.studioScene?.nodes.filter(node => (node.settings as Record<string, unknown>)?.beikeBusinessStage === to) || [];
    if (!sources.length || !targets.length || !targets.every(target => sources.some(source => project.studioScene?.connections.some(edge => edge.from === source.id && edge.to === target.id)))) {
      blocked[to] = `请恢复「${posterCanvasStages[from]} → ${posterCanvasStages[to]}」的节点与连线。`;
    }
    if (blocked[from]) blocked[to] ||= blocked[from];
  }
  return blocked;
}

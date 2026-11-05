import { businessCanvasNodeLayout } from './businessCanvasLayout';
import { workshopCanvasStages, workshopCanvasLinks, type WorkshopCanvasProjection, type WorkshopCanvasStage } from '@shared/domain/workshop/workshopCanvas';
import type { CanvasProject, StudioScene } from './types';

export function createWorkshopCanvasProject(id: string, now: number): CanvasProject {
  const keys = Object.keys(workshopCanvasStages) as Array<keyof typeof workshopCanvasStages>;
  const nodes = keys.map((stage, index) => ({ id: `${id}-${stage}`, type: 'text-node', nodeName: `${index + 1}. ${workshopCanvasStages[stage]}`,
    ...businessCanvasNodeLayout('workshop', stage),
    settings: { aiGenerated: true, beikeInlineVersion: 3, beikeAutoHeight: businessCanvasNodeLayout('workshop', stage).height, beikeBusinessStage: stage, text: '直接在节点内配置参数并运行。\n本节点沿用本项目的商品、模型和已保存任务。' } }));
  return { id, title: '电商图文画布', createdAt: now, updatedAt: now, draft: false, nodes: [], edges: [], workshop: {},
    studioScene: { nodes, connections: workshopCanvasLinks.map(([from, to]) => ({ id: `${id}-${from}-${to}`, from: `${id}-${from}`, to: `${id}-${to}` })),
      groups: [], textBoxes: [], strokes: [], view: { x: 35, y: 55, zoom: 0.8 } } };
}

export function workshopCanvasBlockReasons(project: CanvasProject): Partial<Record<WorkshopCanvasStage, string>> {
  const scene = project.studioScene;
  const blocked: Partial<Record<WorkshopCanvasStage, string>> = {};
  for (const [from, to] of workshopCanvasLinks) {
    const sources = scene?.nodes.filter(node => (node.settings as Record<string, unknown> | undefined)?.beikeBusinessStage === from) || [];
    const targets = scene?.nodes.filter(node => (node.settings as Record<string, unknown> | undefined)?.beikeBusinessStage === to) || [];
    if (!sources.length || !targets.length || !targets.every(target => sources.some(source => scene?.connections.some(edge => edge.from === source.id && edge.to === target.id)))) {
      blocked[to] = `请先恢复「${workshopCanvasStages[from]} → ${workshopCanvasStages[to]}」的节点与连线，再运行此节点。`;
    }
  }
  // Missing upstream links also block descendants, including generation and delivery.
  for (let pass = 0; pass < workshopCanvasLinks.length; pass++) for (const [from, to] of workshopCanvasLinks) {
    if (blocked[from]) blocked[to] ||= blocked[from];
  }
  return blocked;
}

/** Update only managed summaries and result cards; keep user positions, links and notes. */
export function projectWorkshopCanvas(project: CanvasProject, projection: WorkshopCanvasProjection): CanvasProject {
  if (!project.studioScene || !project.workshop) return project;
  const scene = project.studioScene;
  const nodes: StudioScene['nodes'] = scene.nodes.map(node => {
    const settings = node.settings as Record<string, unknown> | undefined;
    const stage = settings?.beikeBusinessStage as keyof typeof workshopCanvasStages;
    const state = projection.stages[stage];
    return state ? { ...node, settings: { ...settings, beikeBusinessState: state.state, text: state.summary } } : node;
  });
  projection.outputs.forEach((output, index) => {
    if (project.workshop?.hiddenOutputIds?.includes(output.id)) return;
    const id = `${project.id}-output-${output.id}`;
    const old = nodes.findIndex(node => node.id === id || (node.settings as Record<string, unknown> | undefined)?.beikeBusinessOutputId === output.id);
    const content = output.url ? { type: 'input-image', content: output.url, settings: { mediaType: 'image', beikeBusinessOutput: true, beikeBusinessOutputId: output.id } }
      : { type: 'text-node', settings: { aiGenerated: true, text: output.text, beikeBusinessOutput: true, beikeBusinessOutputId: output.id } };
    if (old >= 0) nodes[old] = { ...nodes[old], ...content, nodeName: output.title };
    else nodes.push({ id, x: 80 + index % 4 * 330, y: 900 + Math.floor(index / 4) * 340, width: 300, height: 280, nodeName: output.title, ...content });
  });
  return { ...project, workshop: { ...project.workshop, batchId: projection.batchId }, studioScene: { ...scene, nodes }, updatedAt: Date.now() };
}

/** Hide removed result cards while keeping the backing batch and original files. Undo restores them. */
export function applyWorkshopCanvasScene(project: CanvasProject, scene: StudioScene, previous?: StudioScene): CanvasProject {
  const business = project.workshop || project.sales || project.poster;
  if (!business || !previous) return { ...project, studioScene: scene };
  const outputIDs = (value: StudioScene) => value.nodes.flatMap(node => {
    const id = (node.settings as Record<string, unknown> | undefined)?.beikeBusinessOutputId;
    return typeof id === 'string' ? [id] : [];
  });
  const current = new Set(outputIDs(scene));
  const hidden = new Set([...(business.hiddenOutputIds || []), ...outputIDs(previous).filter(id => !current.has(id))]);
  for (const id of current) hidden.delete(id);
  return { ...project, studioScene: scene, ...(project.workshop ? { workshop: { ...project.workshop, hiddenOutputIds: [...hidden] } } : project.sales ? { sales: { ...project.sales, hiddenOutputIds: [...hidden] } } : { poster: { ...project.poster!, hiddenOutputIds: [...hidden] } }) };
}

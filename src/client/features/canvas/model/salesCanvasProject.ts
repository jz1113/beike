import { businessCanvasNodeLayout } from './businessCanvasLayout';
import { salesCanvasLinks, salesCanvasStages, type SalesCanvasProjection, type SalesCanvasStage } from '@shared/domain/sales/salesCanvas';
import type { CanvasProject } from './types';

export function createSalesCanvasProject(id: string, now: number, draft?: unknown): CanvasProject {
  const nodes = (Object.keys(salesCanvasStages) as SalesCanvasStage[]).map((stage, index) => ({
    id: `${id}-${stage}`, type: 'text-node', nodeName: `${index + 1}. ${salesCanvasStages[stage]}`,
    ...businessCanvasNodeLayout('sales', stage),
    settings: { aiGenerated: true, beikeInlineVersion: 3, beikeAutoHeight: businessCanvasNodeLayout('sales', stage).height, beikeBusinessStage: stage, text: '直接在节点内配置参数并运行。\n本项目独立保存商品、脚本、声音和任务回执。创建或复制不会自动生成。' },
  }));
  return { id, title: '电商视频画布', createdAt: now, updatedAt: now, draft: false, nodes: [], sales: { draftId: id, draft },
    studioScene: { nodes, connections: salesCanvasLinks.map(([from, to]) => ({ id: `${id}-${from}-${to}`, from: `${id}-${from}`, to: `${id}-${to}` })), groups: [], strokes: [], textBoxes: [], view: { x: 30, y: 45, zoom: 0.8 } } };
}

export function salesCanvasBlockReasons(project: CanvasProject): Partial<Record<SalesCanvasStage, string>> {
  const scene = project.studioScene;
  const blocked: Partial<Record<SalesCanvasStage, string>> = {};
  for (const [from, to] of salesCanvasLinks) {
    const sources = scene?.nodes.filter(node => (node.settings as Record<string, unknown>)?.beikeBusinessStage === from) || [];
    const targets = scene?.nodes.filter(node => (node.settings as Record<string, unknown>)?.beikeBusinessStage === to) || [];
    if (!sources.length || !targets.length || !targets.every(target => sources.some(source => scene?.connections.some(edge => edge.from === source.id && edge.to === target.id)))) blocked[to] = `请恢复「${salesCanvasStages[from]} → ${salesCanvasStages[to]}」的节点与连线，再运行此节点。`;
  }
  for (let pass = 0; pass < salesCanvasLinks.length; pass++) for (const [from, to] of salesCanvasLinks) if (blocked[from]) blocked[to] ||= blocked[from];
  return blocked;
}

export function projectSalesCanvas(project: CanvasProject, projection: SalesCanvasProjection): CanvasProject {
  if (!project.sales || !project.studioScene) return project;
  const nodes = project.studioScene.nodes.map(node => {
    const stage = (node.settings as Record<string, unknown>)?.beikeBusinessStage as SalesCanvasStage;
    const state = projection.stages[stage];
    return state ? { ...node, settings: { ...(node.settings as object), beikeBusinessState: state.state, text: state.summary } } : node;
  });
  projection.outputs.forEach((output, index) => {
    if (project.sales?.hiddenOutputIds?.includes(output.id)) return;
    const old = nodes.findIndex(node => (node.settings as Record<string, unknown>)?.beikeBusinessOutputId === output.id);
    const content = output.mediaType === 'text' ? { type: 'text-node', settings: { aiGenerated: true, text: output.text, beikeBusinessOutput: true, beikeBusinessOutputId: output.id } }
      : { type: 'input-image', content: output.url, settings: { mediaType: output.mediaType, beikeBusinessOutput: true, beikeBusinessOutputId: output.id } };
    if (old >= 0) nodes[old] = { ...nodes[old], ...content, nodeName: output.title };
    else {
      const slot = ['sales-raw', 'sales-voice', 'sales-final', 'sales-subtitles'].indexOf(output.id);
      nodes.push({ id: `${project.id}-output-${output.id}`, x: 80 + (slot < 0 ? index + 4 : slot) * 350, y: 1800, width: 320, height: 300, nodeName: output.title, ...content });
    }
  });
  return { ...project, sales: { ...project.sales, draftId: project.id, draft: projection.draft }, studioScene: { ...project.studioScene, nodes }, updatedAt: Date.now() };
}

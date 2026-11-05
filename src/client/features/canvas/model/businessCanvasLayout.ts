import type { CanvasProject } from './types';

type Kind = 'sales' | 'workshop' | 'poster';
const layouts: Record<Kind, Record<string, [number, number, number, number]>> = {
  sales: {
    'sales-collect': [80,100,380,500], 'sales-summary': [540,100,420,470], 'sales-storyboard': [1040,100,440,560],
    'sales-voice': [1580,100,360,300], 'sales-video': [1580,490,400,520], 'sales-subtitles': [1580,1100,360,280], 'sales-export': [2080,490,400,440],
  },
  workshop: { collect: [80,100,400,470], images: [560,100,440,540], storyboard: [1080,100,480,580], generate: [1660,100,440,580], copy: [1660,780,400,420], export: [2200,440,400,480] },
  poster: { 'poster-template': [80,100,400,340], 'poster-input': [560,100,400,540], 'poster-production': [1040,100,440,510], 'poster-export': [1560,100,400,260] },
};
export function businessCanvasNodeLayout(kind: Kind, stage: string) {
  const [x,y,width,height] = layouts[kind][stage] || [80,100,400,480];
  return { x,y,width,height };
}

/** One-time layout migration; later user moves, resizes and removals stay intact. */
export function upgradeBusinessCanvasLayout(project: CanvasProject): CanvasProject {
  if (!project.studioScene || !(project.sales || project.workshop || project.poster)) return project;
  const kind = project.sales ? 'sales' : project.workshop ? 'workshop' : 'poster';
  let changed = false;
  const nodes = project.studioScene.nodes.map(node => {
    const settings = node.settings as Record<string, unknown> | undefined;
    if (typeof settings?.beikeBusinessStage !== 'string' || settings.beikeInlineVersion === 3) return node;
    changed = true;
    return { ...node, ...businessCanvasNodeLayout(kind, settings.beikeBusinessStage), settings: { ...settings, beikeInlineVersion: 3, beikeAutoHeight: businessCanvasNodeLayout(kind, settings.beikeBusinessStage).height } };
  });
  return changed ? { ...project, studioScene: { ...project.studioScene, nodes, view: { x: 35, y: 70, zoom: 0.8 } } } : project;
}

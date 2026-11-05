import type { CanvasProject } from './types';

export type CanvasProjectOrder = 'updated' | 'created' | 'title';
export type CanvasProjectPeriod = 'all' | 'week' | 'month';

export function filterCanvasProjects(projects: CanvasProject[], options: { query: string; order: CanvasProjectOrder; period: CanvasProjectPeriod }, now = Date.now()) {
  const query = options.query.trim().toLocaleLowerCase();
  const days = options.period === 'week' ? 7 : options.period === 'month' ? 30 : Infinity;
  return projects.filter(project => (!query || project.title.toLocaleLowerCase().includes(query)) && project.updatedAt >= now - days * 86400000)
    .sort((a, b) => options.order === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : (options.order === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
}

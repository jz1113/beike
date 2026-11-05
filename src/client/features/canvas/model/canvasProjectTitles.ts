import type { CanvasProject } from './types';

export function uniqueCanvasProjectTitle(title:string, projects:Pick<CanvasProject,'id'|'title'>[], excludeId?:string):string {
  const base=(title || '').trim().slice(0,40)||'未命名画布';
  const used=new Set(projects.filter(project=>project.id!==excludeId).map(project=>(project.title || '').trim().normalize('NFKC').toLocaleLowerCase()));
  if(!used.has(base.normalize('NFKC').toLocaleLowerCase()))return base;
  for(let index=2;;index++) {
    const suffix=` · ${String(index).padStart(2,'0')}`, candidate=base.slice(0,40-suffix.length)+suffix;
    if(!used.has(candidate.normalize('NFKC').toLocaleLowerCase()))return candidate;
  }
}

export function normalizeCanvasProjectTitles(projects:CanvasProject[]):CanvasProject[] {
  const aliases:Record<string,string>={'电商视频画布':'商品短片','电商图文画布':'商品图文','封面画布':'商品封面','W3 视频复刻 · 电商视频':'视频复刻 · 四图替换','深度视频复刻 · 电商视频':'视频复刻 · 深度动作'};
  const mapped=projects.map(project=>{
    const title=Object.hasOwn(aliases,project.title)?aliases[project.title]:(project.title?.trim()?project.title:'未命名画布');
    return title===project.title?project:{...project,title};
  });
  const kept:CanvasProject[]=[];
  return mapped.map(project=>{
    const duplicate=kept.some(previous=>previous.title.trim().normalize('NFKC').toLocaleLowerCase()===(project.title || '').trim().normalize('NFKC').toLocaleLowerCase());
    const next=duplicate?{...project,title:uniqueCanvasProjectTitle(project.title,[...mapped.filter(row=>row.id!==project.id),...kept])}:project;
    kept.push(next);return next;
  });
}

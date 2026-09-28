import type {CanvasProject} from '../model/types';

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


export function normalizeCanvasProjects(projects:CanvasProject[]) {
  return projects.filter(project=> !LEGACY_PROJECTS.some(legacy=>{
    if(project.id!==legacy.id || project.title!==legacy.title || project.nodes.length!==legacy.nodes.length)return false;
    return project.nodes.every((node,index)=>{
      const expected=legacy.nodes[index];
      const keys=new Set([...Object.keys(node),...Object.keys(expected)]);
      return [...keys].every(key=>key==='createdAt' || JSON.stringify(node[key as keyof typeof node])===JSON.stringify(expected[key as keyof typeof expected]));
    });
  })).map(project => {
    const rest = { ...project } as CanvasProject & { productionDraft?: unknown };
    delete rest.productionDraft;
    const title = rest.title?.trim() || '';
    // 早期草稿可能被错误写入单个数字（如 "1"）。无节点时这不是有效名称，统一回到未命名状态。
    const isUntitled = !title || title === '未命名项目' || title === '新建画布' || (!rest.nodes.length && /^\d+$/.test(title));
    if (!isUntitled) return rest;

    const firstNodeTitle = rest.nodes.find(node => node.title?.trim())?.title?.trim().slice(0, 30);
    return {
      ...rest,
      title: firstNodeTitle || '未命名项目',
      draft: !rest.nodes.length,
    };
  });
}
export const visibleCanvasProjects=(projects:CanvasProject[])=>normalizeCanvasProjects(projects).filter(project=>!project.draft || project.nodes.length>0);

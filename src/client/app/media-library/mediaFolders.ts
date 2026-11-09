import { PERSONA_AGES, PERSONA_GENDERS, personaGender, personaCategory, type PersonaCategory, type PersonaAge } from '@client/features/sales/model/salesActionViews';
import type { SalesSceneSpace } from '@client/features/sales/model/salesMaterialCatalog';

export function personaFolder(category: PersonaCategory) {
  const gender = personaGender(category);
  const age = category === gender ? 'young' : (category.split('_')[0] as PersonaAge);
  return ['人物', gender === 'male' ? '男' : '女', age === 'child' ? '儿童' : PERSONA_AGES[age]].join('/');
}

export const sceneFolder = (space: SalesSceneSpace) => (space === 'indoor' ? '场景/室内' : '场景/室外');

export const libraryCategories = [
  '场景/室内',
  '场景/室外',
  ...PERSONA_GENDERS.flatMap(({ id }) => (Object.keys(PERSONA_AGES) as PersonaAge[]).map((age) => personaFolder(personaCategory(id, age)))),
  '声音/人声',
  '声音/BGM',
  '动作',
];

const folderOrder = new Map<string, number>();
for (const leaf of libraryCategories) {
  const parts = leaf.split('/');
  parts.forEach((_, index) => {
    const path = parts.slice(0, index + 1).join('/');
    if (!folderOrder.has(path)) folderOrder.set(path, folderOrder.size);
  });
}

export function compareLibraryFolders(a: string, b: string) {
  const rank = (folderOrder.get(a) ?? Infinity) - (folderOrder.get(b) ?? Infinity);
  return rank || a.localeCompare(b, 'zh-CN', { numeric: true });
}

interface FolderNode {path:string; parent:string; count:number; hasChildren:boolean}

export function indexMediaFolders<T extends { folders: readonly string[] }>(items: readonly T[], saved: string[]) {
  const folders = new Map<string, FolderNode>();
  function include(path:string) {
    let parent = '';
    for (const segment of path.split('/')) {
      if (!segment) continue;
      const current = parent ? parent+'/'+segment : segment;
      if (!folders.has(current)) folders.set(current, {path:current, parent, count:0, hasChildren:false});
      const branch = folders.get(parent);
      if (branch) branch.hasChildren = true;
      parent = current;
    }
  }
  for (const path of [...libraryCategories, ...saved]) include(path);
  for (const item of items) {
    const counted = new Set<string>();
    for (const path of item.folders) {
      if (!folders.has(path)) include(path);
      let node = folders.get(path);
      while (node && !counted.has(node.path)) {
        node.count++;
        counted.add(node.path);
        node = folders.get(node.parent);
      }
    }
  }
  const children = new Map<string, FolderNode[]>();
  for (const node of folders.values()) {
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node);
    children.set(node.parent,siblings);
  }
  const ordered = [];
  const pending = [...(children.get('') ?? [])].sort((a,b)=>compareLibraryFolders(b.path,a.path));
  while (pending.length) {
    const node = pending.pop()!;
    ordered.push(node);
    pending.push(...(children.get(node.path) ?? []).sort((a,b)=>compareLibraryFolders(b.path,a.path)));
  }
  return ordered;
}

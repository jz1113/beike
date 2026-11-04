import { compareLibraryFolders, libraryCategories } from './mediaCategories';
import type { LibraryEntry } from './mediaIndex';

interface FolderNode {path:string; parent:string; count:number; hasChildren:boolean}

export function indexMediaFolders(items:LibraryEntry[], saved:string[]) {
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

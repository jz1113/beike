import { CUSTOM_ASSET_STORAGE_KEY, loadCustomAssets, type CustomAssetItem } from '@client/shared/media/customAssetStorage';

export function saveCustomAssets(items: CustomAssetItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('beike:custom_assets_updated'));
  } catch {
    // 忽略本地存储写入失败
  }
}

export function addCustomAsset(
  input: Omit<CustomAssetItem, 'id' | 'createdAt' | 'updatedAt'>
): CustomAssetItem {
  const now = Date.now();
  const newItem: CustomAssetItem = {
    ...input,
    id: `asset-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  const list = loadCustomAssets();
  list.unshift(newItem);
  saveCustomAssets(list);
  return newItem;
}

export function deleteCustomAsset(id: string): boolean {
  try {
    const list:CustomAssetItem[] = JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
    localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY, JSON.stringify(list.filter(item => item.id !== id)));
    window.dispatchEvent(new Event('beike:custom_assets_updated'));
    return true;
  } catch {
    return false;
  }
}

/** 收藏记录只保存引用，导入的本机素材保留自己的来源记录。 */
export function collectCustomMedia(name:string, url:string, kind:NonNullable<CustomAssetItem['mediaKind']> | 'script', folder:string, collection = true, tags?:string[]) {
  if (collection && !readMediaFolders().includes(folder)) throw new Error('收藏文件夹已删除');
  const list:CustomAssetItem[] = JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
  if (!Array.isArray(list)) throw new Error('本机素材目录读取失败');
  const duplicate = list.some(item => (kind === 'script' ? item.scriptId : item.mediaUrl) === url && item.folder === folder);
  const now = Date.now();
  const item: CustomAssetItem = {id:crypto.randomUUID(), category:'file', name, folder, collection,
    ...(tags?.length ? {tags} : {}),
    ...(kind === 'script' ? {scriptId:url} : {mediaKind:kind, mediaUrl:url, coverUrl:kind === 'image' ? url : undefined}),
    createdAt:now, updatedAt:now};
  const key = libraryMediaKey({kind, url});
  const updated = list.map(record=>record.placementKey === key
    ? {...record, placementFolders:[...new Set([...(record.placementFolders ?? []),folder])]} : record);
  localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY, JSON.stringify(duplicate ? updated : [item,...updated]));
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
}

function isCollection(item:CustomAssetItem) {
  return item.collection ?? item.folder?.startsWith('我的文件夹/');
}

const FOLDER_KEY = 'beike.media_folders.v1';

export function readMediaFolders(): string[] {
  const list:unknown = JSON.parse(localStorage.getItem(FOLDER_KEY) || '[]');
  if (!Array.isArray(list)) throw new Error('素材文件夹读取失败');
  return list.filter((name):name is string => typeof name === 'string');
}

export const mediaFolderKinds:Record<string, 'image' | 'video' | 'audio' | 'script' | undefined> = {
  场景:'image', 人物:'image', 任务:'image', 生成参考:'image', 动作:'script', 声音:'audio',
};

function cleanFolderName(name:string) {
  const clean = name.trim();
  if (!clean || /[\\/]/.test(clean) || clean.length > 60) throw new Error('文件夹名称须为 1–60 个字符，且不能包含斜杠');
  return clean;
}

export function createMediaFolder(name:string, parent = '我的文件夹', existing:readonly string[] = []) {
  const clean=cleanFolderName(name);
  const path=parent+'/'+clean;
  const folders=readMediaFolders();
  if (existing.includes(path) || folders.includes(path)) throw new Error('已有同名文件夹');
  localStorage.setItem(FOLDER_KEY,JSON.stringify([...folders,path]));
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
  return path;
}

export function removeCollectedMedia(url:string,folder:string) {
  if (!readMediaFolders().includes(folder)) throw new Error('请选择收藏文件夹');
  const list:CustomAssetItem[]=JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
  const keySuffix = '|'+url;
  const remaining = list.flatMap(item=>{
    if (item.placementKey?.endsWith(keySuffix) && item.placementFolders?.includes(folder)) {
      const paths = item.placementFolders.filter(path=>path !== folder);
      return paths.length ? [{...item,placementFolders:paths}] : [];
    }
    return isCollection(item) && (item.scriptId ?? item.mediaUrl) === url && item.folder === folder ? [] : [item];
  });
  localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY,JSON.stringify(remaining));
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
}

export function deleteMediaFolder(path:string) {
  const folders = readMediaFolders();
  if (!folders.includes(path)) throw new Error('请选择已创建的文件夹');
  const assets:CustomAssetItem[] = JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
  if (!Array.isArray(assets)) throw new Error('本机素材目录读取失败');
  const removed = new Set(folders.filter(folder => folder === path || folder.startsWith(path+'/')));
  const remaining = assets.flatMap(item=>{
    if (item.placementKey) {
      const paths = (item.placementFolders ?? []).filter(folder=>!removed.has(folder));
      return paths.length ? [{...item,placementFolders:paths}] : [];
    }
    return isCollection(item) && removed.has(item.folder || '') ? [] : [item];
  });
  localStorage.setItem(FOLDER_KEY, JSON.stringify(folders.filter(folder => !removed.has(folder))));
  try {
    localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY, JSON.stringify(remaining));
  } catch (error) {
    localStorage.setItem(FOLDER_KEY, JSON.stringify(folders));
    throw error;
  }
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
}

/** 重命名或移动整棵自建分类树，原始媒体记录保持原位。 */
export function relocateMediaFolder(path:string, name:string, parent:string, existing:readonly string[]) {
  const folders = readMediaFolders();
  if (!folders.includes(path)) throw new Error('请选择已创建的分类');
  if (parent === path || parent.startsWith(path+'/')) throw new Error('不能移动到自身或子分类');
  const known = new Set([...existing,...folders,'我的文件夹']);
  if (!known.has(parent)) throw new Error('目标文件夹已不存在');
  const target = parent+'/'+cleanFolderName(name);
  if (target === path) return path;
  const inside = (value:string) => value === path || value.startsWith(path+'/');
  const outside = new Set([...known].filter(value=>!inside(value)));
  const moved = folders.filter(inside);
  for (const value of moved) {
    if (outside.has(target+value.slice(path.length))) throw new Error('目标文件夹下已有同名分类');
  }
  const assets:CustomAssetItem[] = JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
  if (!Array.isArray(assets)) throw new Error('本机素材目录读取失败');
  const kind = mediaFolderKinds[parent.split('/')[0]];
  const members = assets.filter(item=>!item.placementKey && isCollection(item) && item.folder && inside(item.folder));
  const placements = assets.filter(item=>item.placementFolders?.some(inside));
  const incompatible = members.some(item=>(item.scriptId ? 'script' : item.mediaKind) !== kind)
    || placements.some(item=>item.placementKey?.split('|')[0] !== kind);
  if (kind && kind !== mediaFolderKinds[path.split('/')[0]] && incompatible) {
    throw new Error('目标文件夹的素材类型与此分类不符，请选择其他文件夹');
  }
  const now = Date.now();
  const memberIds = new Set(members.map(item=>item.id));
  const nextAssets = assets.map(item=>{
    if (item.placementKey) return {...item,placementFolders:item.placementFolders?.map(folder=>inside(folder) ? target+folder.slice(path.length) : folder)};
    return memberIds.has(item.id) ? {...item, folder:target+item.folder!.slice(path.length), collection:true, updatedAt:now} : item;
  });
  localStorage.setItem(FOLDER_KEY,JSON.stringify(folders.map(value=>inside(value) ? target+value.slice(path.length) : value)));
  try {
    if (members.length || placements.length) localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY,JSON.stringify(nextAssets));
  } catch (error) {
    localStorage.setItem(FOLDER_KEY,JSON.stringify(folders));
    throw error;
  }
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
  return target;
}


export interface LibraryMediaPlacement {
  kind:'image'|'video'|'audio'|'script'; url:string; name:string; folders:string[];
}

export const libraryMediaKey = (item:Pick<LibraryMediaPlacement,'kind'|'url'>) => item.kind+'|'+item.url;

/** Preserve URL-based category moves when a source record receives a new file. */
export function preserveReplacedMediaPlacement(sourceKey:string, oldKey:string) {
  const list:CustomAssetItem[] = JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
  if (!Array.isArray(list)) throw new Error('本机素材目录读取失败');
  const changed = list.map(item => item.placementKey === oldKey
    ? {...item, placementSources:[...new Set([...(item.placementSources ?? []),sourceKey])]} : item);
  localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY, JSON.stringify(changed));
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
}

export function replaceCustomMediaFile(id:string, oldUrl:string, newUrl:string, kind:NonNullable<CustomAssetItem['mediaKind']>) {
  const list:CustomAssetItem[] = JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
  if (!Array.isArray(list)) throw new Error('本机素材目录读取失败');
  const item = list.find(item=>item.id === id && !item.placementKey && !item.scriptId);
  if (!item || (item.mediaUrl || item.coverUrl) !== oldUrl) throw new Error('素材已变化，请刷新后重试');
  const key=libraryMediaKey({kind,url:oldUrl});
  const changed=list.map(record=>record.id === id
    ? {...record,mediaUrl:newUrl,coverUrl:kind === 'image' ? newUrl : undefined,mediaKind:kind,fileSize:undefined,duration:undefined,updatedAt:Date.now()}
    : record.placementKey === key ? {...record,placementSources:[...new Set([...(record.placementSources ?? []),'local:'+id])]} : record);
  localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY,JSON.stringify(changed));
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
}

/** 整批分类调整一次写入；原始媒体和工作区资产仍由各来源管理。 */
export function moveLibraryMedia(items:readonly LibraryMediaPlacement[], source:string, target:string, existing:readonly string[]) {
  if (!items.length) throw new Error('请先选择素材');
  if (!new Set([...existing,...readMediaFolders()]).has(target)) throw new Error('目标分类已不存在');
  const required = mediaFolderKinds[target.split('/')[0]];
  if (required && items.some(item=>item.kind !== required)) throw new Error('所选素材的类型与目标分类不符');
  const list:CustomAssetItem[] = JSON.parse(localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY) || '[]');
  if (!Array.isArray(list)) throw new Error('本机素材目录读取失败');
  const placements = new Map(list.filter(item=>item.placementKey).map(item=>[item.placementKey!,item]));
  const changes = new Map<string,CustomAssetItem>();
  const now = Date.now();
  for (const item of items) {
    const key = libraryMediaKey(item);
    const previous = placements.get(key);
    const paths = previous?.placementFolders ?? item.folders;
    const matches = (path:string) => !source || path === source || path.startsWith(source+'/');
    if (!paths.some(matches)) throw new Error('素材分类已变化，请刷新后重试');
    const folders = [...new Set([...paths.filter(path=>!matches(path)),target])];
    changes.set(key,{id:previous?.id ?? crypto.randomUUID(),category:'file',name:item.name,
      placementKey:key,placementFolders:folders,createdAt:previous?.createdAt ?? now,updatedAt:now});
  }
  const collectedAtTarget = new Set<string>();
  const remaining = list.flatMap(record=>{
    if (record.placementKey) return changes.has(record.placementKey) ? [] : [record];
    if (!isCollection(record)) return [record];
    const media = items.find(item=>item.kind === 'script'
      ? record.scriptId === item.url : !record.scriptId && (record.mediaUrl || record.coverUrl) === item.url && (!record.mediaKind || record.mediaKind === item.kind));
    if (!media) return [record];
    const inSource = !source || record.folder === source || record.folder?.startsWith(source+'/');
    if (!inSource && record.folder !== target) return [record];
    const key = libraryMediaKey(media);
    if (collectedAtTarget.has(key)) return [];
    collectedAtTarget.add(key);
    return [{...record,folder:target,collection:true,updatedAt:now}];
  });
  localStorage.setItem(CUSTOM_ASSET_STORAGE_KEY,JSON.stringify([...remaining,...changes.values()]));
  window.dispatchEvent(new Event('beike:custom_assets_updated'));
}

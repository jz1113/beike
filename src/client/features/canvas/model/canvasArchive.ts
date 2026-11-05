import JSZip from 'jszip';
import type { CanvasProject, StudioScene } from './types';
import { cloneCanvasProject } from './cloneCanvasProject';

export const canvasArchiveLimit = 500 * 1024 * 1024;
export interface CanvasArchiveAsset { id: string; blob: Blob }
export interface CanvasArchive { project: CanvasProject; assets: CanvasArchiveAsset[] }
type Progress = (message: string) => void;
const mediaKey = /^(?:content|thumbnail|.*url|.*images|.*videos|.*image|.*video|files|references)$/i;
const assetKey = /assetids?$/i;
const mediaAddress = /^(?:https?:\/\/|blob:|data:(?:image|video|audio)\/|local-asset:\/\/|\/storage\/|\/api\/assets\/storage\/)/i;

/** Visit media fields, including every version/recipe, without treating prompts as downloads. */
export async function mapCanvasMedia(value: unknown, map: (url: string) => Promise<string>, key = ''): Promise<unknown> {
  if (typeof value === 'string') return mediaKey.test(key) && mediaAddress.test(value) ? map(value) : value;
  if (Array.isArray(value)) return Promise.all(value.map(item => mapCanvasMedia(item, map, key)));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = Object.create(null);
  const textNode = /^(text-node|prompt|note|text|label)$/.test(String((value as {type?:unknown}).type || ''));
  for (const [field, item] of Object.entries(value)) result[field] = textNode && field === 'content' ? item : await mapCanvasMedia(item, map, field);
  return result;
}

function assetIds(value: unknown, result = new Set<string>(), key = ''): Set<string> {
  if (typeof value === 'string' && assetKey.test(key) && value) result.add(value);
  else if (Array.isArray(value)) value.forEach(item => assetIds(item, result, key));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([field, item]) => assetIds(item, result, field));
  return result;
}

/** Native ZIPs can omit content and keep only a cache ID; restore a durable URL before rendering. */
function restoreCachedReferences(value: unknown, available: Set<string>): unknown {
  if (Array.isArray(value)) return value.map(item=>restoreCachedReferences(item,available));
  if (!value || typeof value !== 'object') return value;
  const object = Object.fromEntries(Object.entries(value).map(([key,item])=>[key,restoreCachedReferences(item,available)]));
  const settings = object.settings as Record<string,unknown> | undefined;
  const id = [object.assetId,object._contentAssetId,settings?._localCacheAssetId,settings?._assetId,settings?._contentAssetId,object.id]
    .find(candidate=>typeof candidate==='string' && available.has(candidate));
  if (typeof id === 'string') {
    const ref=`local-asset://${encodeURIComponent(id)}`;
    for (const key of ['content','url','originalUrl','fullUrl','imageUrl','videoUrl','audioUrl']) {
      if (typeof object[key]==='string' && (!object[key] || object[key].startsWith('blob:'))) object[key]=ref;
    }
    if (!object.content && /^(input-image|gen-image|gen-video|video-input|preview)$/.test(String(object.type))) object.content=ref;
  }
  return object;
}

export async function buildCanvasArchive(project: CanvasProject, readAsset: (id: string) => Promise<Blob | undefined>,
  fetchMedia: (url: string) => Promise<Blob>, progress: Progress = () => {}): Promise<Blob> {
  validateProject(project);
  const zip = new JSZip();
  const assets: Record<string, { fileName: string; mimeType: string; size: number }> = Object.create(null);
  const urls = new Map<string, Promise<string>>();
  let bytes = 0;
  async function add(id: string, blob: Blob) {
    if (assets[id]) return;
    if (!blob.size || !/^(image|video|audio)\//.test(blob.type)) throw new Error('素材文件无效，请重新导入素材后重试');
    bytes += blob.size;
    if (bytes > canvasArchiveLimit) throw new Error('项目素材超过 500 MB，请拆分项目后导出');
    const fileName = `assets/${Object.keys(assets).length}.bin`;
    assets[id] = { fileName, mimeType: blob.type, size: blob.size };
    zip.file(fileName, await blob.arrayBuffer());
    progress(`已打包 ${Object.keys(assets).length} 个素材`);
  }
  for (const id of assetIds(project)) {
    const blob = await readAsset(id);
    if (blob) await add(id, blob);
  }
  const packed = await mapCanvasMedia(restoreCachedReferences(project,new Set(Object.keys(assets))), url => {
    let pending = urls.get(url);
    if (!pending) {
      pending = (async () => {
        const local = url.startsWith('local-asset://');
        const id = local ? decodeURIComponent(url.slice(14)) : `archive-${crypto.randomUUID()}`;
        if (!assets[id]) {
          const blob = local ? await readAsset(id) : await fetchMedia(url);
          if (!blob) throw new Error('找不到项目中的本机素材，请恢复素材后重新导出');
          await add(id, blob);
        }
        return `local-asset://${encodeURIComponent(id)}`;
      })();
      urls.set(url, pending);
    }
    return pending;
  });
  zip.file('project.json', JSON.stringify(packed));
  zip.file('manifest.json', JSON.stringify({ format: 'beike-canvas', version: 1, assets }));
  progress('正在生成项目备份…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  if (blob.size > canvasArchiveLimit) throw new Error('项目备份超过 500 MB，请拆分项目后导出');
  return blob;
}

function validateNativeProject(raw: Record<string,unknown>): CanvasProject {
  if(typeof raw.id!=='string' || !raw.id || typeof raw.title!=='string' || !Array.isArray(raw.nodes))
    throw new Error('旧画布项目格式无效，请选择完整项目备份');
  const nodes=raw.nodes as CanvasProject['nodes'];
  const types=new Set(['image','video','audio','file','drawing','prompt','note','group','frame','compare','save','preview']);
  const ids=new Set<string>();
  for(const node of nodes){
    if(!node || typeof node.id!=='string' || !node.id || ids.has(node.id) || !types.has(node.type)
      || ![node.x,node.y,node.width,node.height].every(Number.isFinite) || node.width<=0 || node.height<=0)
      throw new Error('旧画布节点数据无效、重复或尺寸不完整');
    ids.add(node.id);
  }
  for(const node of nodes) if(node.referenceNodeIds!==undefined && (!Array.isArray(node.referenceNodeIds)
    || node.referenceNodeIds.some(id=>!ids.has(id)))) throw new Error('旧画布参考引用了不存在的节点');
  if(raw.edges!==undefined && !Array.isArray(raw.edges)) throw new Error('旧画布连线数据无效');
  const edges=(raw.edges || []) as NonNullable<CanvasProject['edges']>, edgeIds=new Set<string>();
  for(const edge of edges){
    if(!edge || typeof edge.id!=='string' || !edge.id || edgeIds.has(edge.id) || !ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId))
      throw new Error('旧画布连线无效、重复或引用了不存在的节点');
    edgeIds.add(edge.id);
  }
  const viewport=raw.viewport as CanvasProject['viewport'];
  if(viewport!==undefined && (!viewport || ![viewport.x,viewport.y,viewport.zoom].every(Number.isFinite) || viewport.zoom<0.1 || viewport.zoom>2.5))
    throw new Error('旧画布视口数据无效');
  return {...raw,nodes,edges,viewport:viewport ?? (nodes.length ? undefined : {x:0,y:0,zoom:1})} as unknown as CanvasProject;
}

function validateProject(value: unknown): CanvasProject {
  if (!value || typeof value !== 'object') throw new Error('项目文件格式无效，请选择完整的项目备份');
  const raw = value as Record<string, unknown>;
  const legacy = !raw.studioScene && Array.isArray(raw.connections);
  if(!raw.studioScene && !legacy){
    const source=validateNativeProject(raw);
    const title=source.title.trim().slice(0,40) || '恢复的画布';
    const project=cloneCanvasProject(source,`canvas-proj-${crypto.randomUUID()}`);
    project.title=title;
    return project;
  }
  const scene = (legacy ? { nodes: raw.nodes, connections: raw.connections, groups: raw.groups || [],
    textBoxes: raw.canvasTextBoxes || [], strokes: raw.canvasDoodleStrokes || [], view: raw.view || {x:0,y:0,zoom:1} } : raw.studioScene) as StudioScene | undefined;
  if (!Array.isArray(raw.nodes) || !scene || !Array.isArray(scene.nodes) || !Array.isArray(scene.connections)
    || !Array.isArray(scene.groups) || !Array.isArray(scene.textBoxes) || !Array.isArray(scene.strokes)
    || !scene.view || ![scene.view.x, scene.view.y, scene.view.zoom].every(Number.isFinite) || scene.view.zoom <= 0) {
    throw new Error('项目缺少完整的节点、连线或视口数据，请重新导出');
  }
  const ids = new Set<string>();
  for (const node of scene.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || typeof node.type !== 'string' || ids.has(node.id)) throw new Error('项目节点数据无效或重复');
    ids.add(node.id);
  }
  const edges = new Set<string>();
  for (const edge of scene.connections) {
    if (!edge || typeof edge.id !== 'string' || !edge.id || edges.has(edge.id) || !ids.has(edge.from) || !ids.has(edge.to)) throw new Error('项目连线无效、重复或引用了不存在的节点');
    edges.add(edge.id);
  }
  const title = String(raw.title || raw.projectName || '恢复的画布').trim().slice(0,40) || '恢复的画布';
  const source: CanvasProject = { id:String(raw.id || 'archive'), title, createdAt:0, updatedAt:0,
    nodes:legacy?[]:raw.nodes as CanvasProject['nodes'], edges:legacy?undefined:raw.edges as CanvasProject['edges'],
    thumbnail:typeof raw.thumbnail==='string'?raw.thumbnail:undefined,studioScene:scene,
    poster: raw.poster && typeof raw.poster === 'object' && [1, 2].includes(Number((raw.poster as Record<string, unknown>).version)) ? { version: Number((raw.poster as Record<string, unknown>).version) as 1 | 2,
      hiddenOutputIds: Array.isArray((raw.poster as Record<string, unknown>).hiddenOutputIds) ? (raw.poster as { hiddenOutputIds: unknown[] }).hiddenOutputIds.filter((id): id is string => typeof id === 'string') : undefined } : undefined,
    nativeCommerce: raw.nativeCommerce && typeof raw.nativeCommerce === 'object' && ['sales','workshop','poster'].includes(String((raw.nativeCommerce as Record<string, unknown>).kind)) ? { kind: (raw.nativeCommerce as { kind: 'sales' | 'workshop' | 'poster' }).kind, version: 1,
      legacyScene: (raw.nativeCommerce as Record<string, unknown>).legacyScene ? validateProject({ nodes: [], studioScene: (raw.nativeCommerce as Record<string, unknown>).legacyScene }).studioScene : undefined } : undefined,
    sales: raw.sales && typeof raw.sales === 'object' && !Array.isArray(raw.sales) ? { draft: (raw.sales as Record<string, unknown>).draft,
      hiddenOutputIds: Array.isArray((raw.sales as Record<string, unknown>).hiddenOutputIds) ? (raw.sales as { hiddenOutputIds: unknown[] }).hiddenOutputIds.filter((id): id is string => typeof id === 'string') : undefined } : undefined,
    workshop: raw.workshop && typeof raw.workshop === 'object' ? {
      batchId: typeof (raw.workshop as Record<string, unknown>).batchId === 'string' ? (raw.workshop as { batchId: string }).batchId : undefined,
      sourceBatchId: typeof (raw.workshop as Record<string, unknown>).sourceBatchId === 'string' ? (raw.workshop as { sourceBatchId: string }).sourceBatchId : undefined,
      hiddenOutputIds: Array.isArray((raw.workshop as Record<string, unknown>).hiddenOutputIds) ? ((raw.workshop as { hiddenOutputIds: unknown[] }).hiddenOutputIds).filter((id): id is string => typeof id === 'string') : undefined,
    } : undefined };
  const project = cloneCanvasProject(source, `canvas-proj-${crypto.randomUUID()}`);
  project.title = title;
  return project;
}

async function parseCanvasArchive(file: Blob, progress: Progress): Promise<CanvasArchive> {
  if (!file.size || file.size > canvasArchiveLimit) throw new Error('请选择小于 500 MB 的完整项目备份');
  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
  let project: CanvasProject;
  const assets: CanvasArchiveAsset[] = [];
  if (signature[0] === 80 && signature[1] === 75) {
    progress('正在校验项目备份…');
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const json = zip.file('project.json');
    if (!json) throw new Error('备份缺少 project.json，请选择完整项目 ZIP');
    project = validateProject(JSON.parse(await json.async('string')));
    const manifest = zip.file('manifest.json');
    const metadata = manifest ? JSON.parse(await manifest.async('string')) : {};
    if (metadata.format === 'beike-canvas' && metadata.version !== 1) throw new Error('备份版本暂不支持，请使用兼容版本重新导出');
    let total = 0;
    for (const [id, raw] of Object.entries(metadata.assets || {})) {
      const item = raw as {fileName?: string; mimeType?: string; size?: number};
      const entry = item && typeof item.fileName === 'string' && zip.file(item.fileName);
      if (!entry || !/^(image|video|audio)\//.test(item.mimeType || '')) throw new Error('备份中的素材缺失或类型无效，请重新导出');
      const buffer = await entry.async('arraybuffer');
      total += buffer.byteLength;
      if (total > canvasArchiveLimit) throw new Error('项目素材超过 500 MB');
      if (!buffer.byteLength || (typeof item.size === 'number' && item.size !== buffer.byteLength)) throw new Error('备份中的素材不完整，请重新导出');
      assets.push({ id, blob: new Blob([buffer], {type:item.mimeType}) });
      progress(`已校验 ${assets.length} 个素材`);
    }
  } else {
    project = validateProject(JSON.parse(new TextDecoder().decode(bytes)));
  }
  const ids = new Set(assets.map(asset => asset.id));
  project = restoreCachedReferences(project,ids) as CanvasProject;
  await mapCanvasMedia(project, async url => {
    if (url.startsWith('blob:')) throw new Error('备份包含已失效的临时素材地址，请重新导出完整项目 ZIP');
    if (url.startsWith('local-asset://') && !ids.has(decodeURIComponent(url.slice(14)))) throw new Error('备份缺少本机素材，请选择包含素材的完整项目 ZIP');
    return url;
  });
  return { project, assets };
}

export async function readCanvasArchive(file: Blob, progress: Progress = () => {}): Promise<CanvasArchive> {
  try { return await parseCanvasArchive(file,progress); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('备份内容无法解析，请选择完整项目 ZIP 或 JSON');
    if (error instanceof Error && /corrupt|end of data|end of central|zip file|CRC32|unsupported compression/i.test(error.message)) {
      throw new Error('备份文件损坏或不完整，请重新选择完整项目 ZIP');
    }
    throw error;
  }
}

async function nativeArchiveMedia(project: CanvasProject, assets: CanvasArchiveAsset[]): Promise<CanvasArchive> {
  // The native editor consumes URLs directly. Inline media survives refresh and works
  // in previews, downloads, copied nodes and references without temporary blob URLs.
  const blobs=new Map(assets.map(asset=>[asset.id,asset.blob]));
  const urls=new Map<string,Promise<string>>();
  const restored=await mapCanvasMedia(project,ref=>{
    if(!ref.startsWith('local-asset://')) return Promise.resolve(ref);
    let url=urls.get(ref);
    if(!url){
      url=(async()=>{
        const blob=blobs.get(decodeURIComponent(ref.slice(14)));
        if(!blob)throw new Error('备份缺少本机素材，请选择包含素材的完整项目 ZIP');
        const bytes=new Uint8Array(await blob.arrayBuffer()),parts:string[]=[];
        for(let offset=0;offset<bytes.length;offset+=24576)parts.push(btoa(String.fromCharCode(...bytes.subarray(offset,offset+24576))));
        return `data:${blob.type};base64,${parts.join('')}`;
      })();
      urls.set(ref,url);
    }
    return url;
  }) as CanvasProject;
  return {project:restored,assets:[]};
}

/** Older JSON exports may contain URLs. Cache them before reporting a successful recovery. */
export async function completeCanvasArchive(archive: CanvasArchive, fetchMedia: (url:string)=>Promise<Blob>): Promise<CanvasArchive> {
  const added: CanvasArchiveAsset[] = [];
  const pending = new Map<string,Promise<string>>();
  let bytes = archive.assets.reduce((sum,asset)=>sum+asset.blob.size,0);
  const project = await mapCanvasMedia(archive.project,url=>{
    if (url.startsWith('local-asset://')) return Promise.resolve(url);
    let task=pending.get(url);
    if (!task) {
      task=(async()=>{
        const blob=await fetchMedia(url);
        if (!blob.size || !/^(image|video|audio)\//.test(blob.type)) throw new Error('无法恢复完整素材，请重新选择完整项目备份');
        bytes+=blob.size;
        if (bytes>canvasArchiveLimit) throw new Error('项目素材超过 500 MB');
        const id=`archive-${crypto.randomUUID()}`;
        added.push({id,blob});return `local-asset://${id}`;
      })();
      pending.set(url,task);
    }
    return task;
  }) as CanvasProject;
  const assets=[...archive.assets,...added];
  return project.studioScene ? {project,assets} : nativeArchiveMedia(project,assets);
}

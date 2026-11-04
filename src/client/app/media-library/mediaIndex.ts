import type { SalesLibraryChoice } from '@client/features/sales/model/salesWorkspace';
import type { StoredSalesScript } from '@client/features/sales/api/salesScripts';
import { personaFolder, sceneFolder } from './mediaCategories';
import { classifyPersonaGroup } from '@client/features/sales/model/salesPersonaClassification';
import { readSceneViews, SCENE_VIEWS } from '@client/features/sales/model/salesSceneViews';
import type { GlobalAssetStore } from '@client/shared/api/assetLibraryCache';
import { classifySceneSpace, salesMaterialCards } from '@client/features/sales/model/salesMaterialCatalog';
import type { SalesStudioAssetCatalog } from '@client/features/sales/api/salesProduction';
import { libraryMediaKey, type CustomAssetItem } from '@client/features/assets/model/customAssetStore';
import type { CanvasProject } from '@client/features/canvas/model/types';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { isTaskVideoReference } from '@client/shared/media/mediaHelper';

export type MediaKind = 'image' | 'video' | 'audio';
export interface PendingMediaInsert {projectId:string; requestId:string; item:Pick<LibraryMedia,'name'|'kind'|'url'>}
export interface MediaView { label:string; url:string }
export type MediaSourceType = 'local' | 'sound' | 'scene' | 'persona' | 'action' | 'script';
export interface MediaSource { type:MediaSourceType; id:string; name:string; folder:string }
export interface LibraryMedia { classificationMoved?:boolean; salesChoices?:SalesLibraryChoice[]; sources?:MediaSource[]; views?:MediaView[]; url:string; kind:MediaKind; name:string; folders:string[]; keywords:string[]; cover?:string }

export type ScriptEntry = Omit<LibraryMedia,'kind'> & {kind:'script'; record:StoredSalesScript};
export type LibraryEntry = LibraryMedia | ScriptEntry;

export function mediaKind(value: string): MediaKind | undefined {
  const mime = /^(?:data:)?(image|video|audio)\//i.exec(value);
  if (mime) return mime[1].toLowerCase() as MediaKind;
  const path = value.split(/[?#]/)[0];
  if (/\.(png|jpe?g|webp|avif|gif|svg|bmp)$/i.test(path)) return 'image';
  if (/\.(mp4|webm|mov|m4v|mkv)$/i.test(path)) return 'video';
  if (/\.(mp3|aac|m4a|wav|flac|ogg|opus)$/i.test(path)) return 'audio';
}
const groups = {character:'角色',product:'商品',voice:'音色',file:'文件'};
const mediaAddress = /^(https?:\/\/|\/api\/sales\/bgm\/|\/storage\/|data:(image|video|audio)\/)/i;

export function indexLibrary(local:CustomAssetItem[], tasks:GenerationTask[], projects:CanvasProject[], sales:SalesStudioAssetCatalog | null, shared:GlobalAssetStore | null, scripts:readonly StoredSalesScript[] = []) {
  const items = new Map<string,LibraryMedia>();
  function add(raw:unknown, kind:MediaKind | undefined, name:string, folder:string, tags:string[] = [], cover?:string, source?:Pick<MediaSource,'type'|'id'>) {
    if (typeof raw !== 'string' || !kind || !mediaAddress.test(raw)) return;
    if (/^\/storage\/[^/]+\/azhuo\/refs\/sales-script\/\d{6}\//.test(raw)) return;
    let identity = raw;
    if (typeof window !== 'undefined' && /^https?:\/\//i.test(raw)) {
      const address = new URL(raw);
      if (address.origin === window.location.origin) identity = address.pathname + address.search + address.hash;
    }
    const key = kind+'|'+identity;
    const existing = items.get(key);
    if (existing) {
      if (!existing.folders.includes(folder)) existing.folders.push(folder);
      existing.keywords.push(name,...tags);
    } else items.set(key,{url:raw,kind,name,folders:[folder],keywords:tags.slice(),cover});
    const item = items.get(key)!;
    if (source) {
      const sources = item.sources ??= [];
      if (!sources.some(entry => entry.type === source.type && entry.id === source.id)) sources.push({...source, folder, name});
    }
    return item;
  }
  function link(item:LibraryMedia | undefined, type:SalesLibraryChoice['type'], id:string, title:string) {
    if (!item) return;
    const choices = item.salesChoices ??= [];
    if (!choices.some(choice => choice.type === type && choice.id === id)) choices.push({type,id,title});
  }
  const scriptCollections = new Map<string,MediaSource[]>();
  for (const item of local) {
    if (item.placementKey) continue;
    if (item.scriptId && item.folder) {
      const sources = scriptCollections.get(item.scriptId) ?? [];
      sources.push({type:'local', id:item.id, name:item.name, folder:item.folder});
      scriptCollections.set(item.scriptId,sources);
      continue;
    }
    const url = item.mediaUrl || item.coverUrl || '';
    add(url,item.mediaKind || mediaKind(url) || (item.category === 'voice' ? 'audio' : item.category !== 'file' ? 'image' : undefined),
      item.name,item.folder || '本机资产/'+groups[item.category],item.tags,item.coverUrl !== url ? item.coverUrl : undefined, {type:'local',id:item.id});
  }
  for (const task of tasks) {
    if (task.mediaType === 'agent') continue;
    const name = task.title || task.prompt || '生成作品';
    for (const url of new Set([task.referenceImageUrl,...(task.referenceImages ?? []),...(task.images ?? [])])) {
      if (url && !isTaskVideoReference(task, url) && (!mediaKind(url) || mediaKind(url) === 'image')) add(url,'image',name+' · 参考素材','任务/参考图片');
    }
  }
  const sharedScenes = new Map(shared?.scenes.map(scene => [scene.id, scene]));
  const sceneIds = new Set<string>();
  for (const scene of sales?.scenes ?? []) {
    const sharedScene = sharedScenes.get(scene.id);
    const cover = sharedScene?.coverUrl;
    const {views, extraImages} = readSceneViews(cover && cover !== scene.coverUrl
      ? {...scene, sourceImages:[...scene.sourceImages, cover]} : scene);
    const candidates = [
      ...SCENE_VIEWS.map(({id,label}) => ({label, url:views[id]})),
      ...extraImages.map((url,i) => ({label:'参考图 '+(i+1), url})),
    ];
    const seen = new Set<string>();
    const angles = candidates.filter(({url}) => {
      if (!mediaAddress.test(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    if (!angles.length) continue;
    const item = add(angles[0].url,'image',scene.title,sceneFolder(classifySceneSpace(scene)),[scene.lighting,scene.tags], undefined, {type:'scene',id:scene.id});
    if (item) {
      link(item,'scene',scene.id,scene.title);
      sceneIds.add(scene.id);
      item.views = [...(item.views ?? []), ...angles.filter(angle => !item.views?.some(view => view.url === angle.url))];
      item.keywords.push(...angles.map(view => view.label));
    }
  }
  const personaFolders = new Map<string,string>();
  if (sales) for (const card of salesMaterialCards({...sales, scenes:[]})) {
    if (card.kind === 'action') continue;
    let folder = '人物';
    if (card.kind === 'persona' && card.personaGroup) {
      folder = personaFolder(card.personaGroup);
      personaFolders.set(card.id, folder);
    }
    if (card.kind === 'sound') folder = card.soundType === 'bgm' ? '声音/BGM' : '声音/人声';
    const source = card.editable === false ? undefined : {type:card.kind,id:card.id};
    const media = [
      add(card.video,'video',card.title,folder,card.tags,card.image,source),
      add(card.audio,'audio',card.title,folder,card.tags,undefined,source),
      ...(!card.video && !card.audio ? [add(card.image,'image',card.title,folder,card.tags,undefined,source)] : []),
      ...(card.sourceImages ?? []).map(url => add(url,'image',card.title,folder,card.tags,undefined,source)),
    ];
    const type = card.kind === 'sound' ? card.soundType : card.kind;
    if (type) for (const item of media) link(item,type,card.id,card.title);
  }
  if (shared) {
    for (const key of ['personas','scenes'] as const) for (const record of shared[key]) {
      const name = record.title || record.name || '素材';
      const tags = record.tags || '';
      const description = record.description || '';
      let folder: string;
      if (key === 'scenes') {
        if (sceneIds.has(record.id)) continue;
        folder = sceneFolder(classifySceneSpace({title:name, description, tags, spatialType:record.spatialType || '', category:record.category || ''}));
      } else {
        folder = personaFolders.get(record.id) ?? personaFolder(classifyPersonaGroup({
          name, description, tags, dimensions:typeof record.dimensions === 'string' ? record.dimensions : undefined,
        }));
      }
      const type = key === 'scenes' ? 'scene' : 'persona';
      add(record.coverUrl,'image',name,folder,tags.split(/[,，]/),undefined,{type,id:record.id});
    }
  }
  for (const project of projects) {
    const folder = '画布项目/'+project.title;
    for (const node of project.nodes) {
      const url = node.videoUrl || node.audioUrl || node.imageUrl;
      add(url,node.videoUrl ? 'video' : node.audioUrl ? 'audio' : 'image',node.title || '画布素材',folder);
    }
    for (const node of project.studioScene?.nodes ?? []) {
      if (node.type === 'text-node') continue;
      const settings = (node.settings ?? {}) as Record<string,unknown>;
      const title = String(node.nodeName || '画布素材');
      const kind = node.videoUrl || settings.mediaType === 'video' || node.previewType === 'video' ? 'video'
        : settings.audioUrl || settings.mediaType === 'audio' || node.previewType === 'audio' ? 'audio' : 'image';
      add(node.videoUrl || settings.audioUrl || node.imageUrl || node.content,kind,title,folder);
      if (Array.isArray(settings.generationVersions)) for (const version of settings.generationVersions) {
        if (!version) continue;
        add(version.originalUrl || version.content, version.mediaType === 'video' ? 'video' : 'image', title, folder);
      }
      const outputs = settings.generatedImages ?? node.generatedImages;
      if (Array.isArray(outputs)) for (const output of outputs) add(output?.fullUrl || output?.url,kind,title,folder);
    }
  }
  const actions:ScriptEntry[] = scripts.map(record => {
    const beats = record.script.shots.flatMap(shot => shot.beats);
    const collections = scriptCollections.get(record.id) ?? [];
    return {kind:'script', url:record.id, record, name:record.title, folders:['动作', ...collections.map(source=>source.folder)],
      keywords:[record.script.overview, record.script.taxonomy.subCategory, ...beats.map(beat => beat.referenceActionRaw)],
      sources:[{type:'script',id:record.id,name:record.title,folder:'动作'}, ...collections],
      salesChoices:record.status === 'verified' ? [{type:'script',id:record.id,title:record.title}] : undefined};
  });
  const placements = new Map(local.filter(item=>item.placementKey).map(item=>[item.placementKey,item.placementFolders]));
  return [...items.values(), ...actions].map(item=>{
    const paths = placements.get(libraryMediaKey(item));
    return paths?.length ? {...item,folders:paths,classificationMoved:true} : item;
  });

}

import type { StoredSalesScript } from '@client/features/sales/api/salesScripts';
import { personaFolder, sceneFolder } from './mediaFolders';
import { classifyPersonaGroup, readSceneViews, SCENE_VIEWS } from '@client/features/sales/model/salesActionViews';
import type { GlobalAssetStore } from '@client/shared/api/assetLibraryCache';
import { classifySceneSpace, salesMaterialCards } from '@client/features/sales/model/salesMaterialCatalog';
import type { SalesStudioAssetCatalog } from '@client/features/sales/api/salesMaterials';
import { libraryMediaKey } from '@client/features/assets/model/customAssetStore';
import { type CustomAssetItem } from '@client/shared/media/customAssetStorage';
import type { CanvasProject } from '@client/features/canvas/model/types';
import type { GenerationTask } from '@client/store/appStoreTypes';

export type MediaKind = 'image' | 'video' | 'audio';
export interface PendingMediaInsert {projectId:string; requestId:string; item:Pick<LibraryMedia,'name'|'kind'|'url'|'cover'>}
export interface MediaView { label:string; url:string }
export type MediaSourceType = 'local' | 'sound' | 'scene' | 'persona' | 'action' | 'script';
export interface MediaSource { type:MediaSourceType; id:string; name:string; folder:string }
export interface LibraryMedia { classificationMoved?:boolean; sources?:MediaSource[]; views?:MediaView[]; url:string; kind:MediaKind; name:string; folders:string[]; keywords:string[]; cover?:string }

export type ScriptEntry = Omit<LibraryMedia,'kind'> & {kind:'script'; record:StoredSalesScript};
export type LibraryEntry = LibraryMedia | ScriptEntry;
export type ActionDepthKind = '深度视频' | '仅分镜';
export type ActionStyleKind = '律动展示' | '口播讲解' | '细节特写';

export function classifyActionScript(record: StoredSalesScript): { depth: ActionDepthKind; style: ActionStyleKind } {
  const depth: ActionDepthKind = record.depthVideoUrl ? '深度视频' : '仅分镜';
  const { format, voiceMode, taxonomy } = record.script;
  const corpus = [record.title, record.script.overview, taxonomy.subCategory, taxonomy.styleCategory].join(' ');
  const style: ActionStyleKind =
    format === 'hands' || format === 'product' || /手部|特写|细节测评|微距/.test(corpus)
      ? '细节特写'
      : voiceMode === 'speech' || voiceMode === 'voiceover' || voiceMode === 'mixed' || /口播|讲解|卖点|测评/.test(corpus)
        ? '口播讲解'
        : '律动展示';
  return { depth, style };
}

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

function cleanMediaTitle(value: string) {
  return value
    .replace(/^三视图[-_·\s]*/u, '')
    .replace(/^场景(?=\s*\d)/u, '室内')
    .trim() || value;
}

export function indexLibrary(local:CustomAssetItem[], _tasks:GenerationTask[], _projects:CanvasProject[], sales:SalesStudioAssetCatalog | null, shared:GlobalAssetStore | null, scripts:readonly StoredSalesScript[] = []) {
  const items = new Map<string,LibraryMedia>();
  function add(raw:unknown, kind:MediaKind | undefined, rawName:string, folder:string, tags:string[] = [], cover?:string, source?:Pick<MediaSource,'type'|'id'>) {
    if (typeof raw !== 'string' || !kind || !mediaAddress.test(raw)) return;
    if (/^\/storage\/[^/]+\/azhuo\/refs\/sales-script\/\d{6}\//.test(raw)) return;
    const name = cleanMediaTitle(rawName);
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
      if (rawName !== name) existing.keywords.push(rawName);
    } else items.set(key,{url:raw,kind,name,folders:[folder],keywords:rawName !== name ? [rawName, ...tags] : tags.slice(),cover});
    const item = items.get(key)!;
    if (source) {
      const sources = item.sources ??= [];
      if (!sources.some(entry => entry.type === source.type && entry.id === source.id)) sources.push({...source, folder, name});
    }
    return item;
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
  const sharedScenes = new Map(shared?.scenes.map(scene => [scene.id, scene]));
  const sceneIds = new Set<string>();
  for (const scene of sales?.scenes ?? []) {
    const sharedScene = sharedScenes.get(scene.id);
    const cover = sharedScene?.coverUrl;
    const {views, extraImages} = readSceneViews(cover && cover !== scene.coverUrl
      ? {...scene, sourceImages:[...scene.sourceImages, cover]} : scene);
    const sheetUrl = typeof views.sheet === 'string' ? views.sheet.trim() : '';
    const hasFullNineGrid = SCENE_VIEWS.slice(1).every(({id}) => Boolean(views[id]));
    const candidates = sheetUrl
      ? [{label: '九宫格场景', url: sheetUrl}]
      : [
        ...(hasFullNineGrid ? SCENE_VIEWS.slice(1) : SCENE_VIEWS).map(({id,label}) => ({label, url:views[id]})),
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
    add(card.video,'video',card.title,folder,card.tags,card.image,source);
    add(card.audio,'audio',card.title,folder,card.tags,undefined,source);
    if (!card.video && !card.audio) add(card.image,'image',card.title,folder,card.tags,undefined,source);
    (card.sourceImages ?? []).forEach(url => add(url,'image',card.title,folder,card.tags,undefined,source));
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
  const actions:ScriptEntry[] = scripts.map(record => {
    const beats = record.script.shots.flatMap(shot => shot.beats);
    const collections = scriptCollections.get(record.id) ?? [];
    return {kind:'script', url:record.id, record, name:record.title, folders:['动作', ...collections.map(source=>source.folder)],
      keywords:[record.script.overview, record.script.taxonomy.subCategory, ...beats.map(beat => beat.referenceActionRaw)],
      sources:[{type:'script',id:record.id,name:record.title,folder:'动作'}, ...collections]};
  });
  const placements = new Map(local.filter(item=>item.placementKey).map(item=>[item.placementKey,item.placementFolders]));
  const sourcePlacements = new Map(local.flatMap(item=>(item.placementSources ?? []).map(source=>[source,item.placementFolders] as const)));
  return [...items.values(), ...actions].map(item=>{
    const paths = placements.get(libraryMediaKey(item)) ?? item.sources?.map(source=>sourcePlacements.get(source.type+':'+source.id)).find(paths=>paths?.length);
    return paths?.length ? {...item,folders:paths,classificationMoved:true} : item;
  });

}

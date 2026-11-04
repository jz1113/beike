import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { collectCustomMedia, createMediaFolder, deleteMediaFolder, libraryMediaKey, moveLibraryMedia, relocateMediaFolder, removeCollectedMedia, type LibraryMediaPlacement } from './customAssetStore';

beforeEach(()=>{
  const values = new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>values.set(key,value)});
  vi.stubGlobal('window',new EventTarget());
});
afterEach(()=>vi.unstubAllGlobals());
const image:LibraryMediaPlacement={kind:'image',url:'/storage/a.png',name:'场景',folders:['场景/室内','我的文件夹/收藏']};
const script:LibraryMediaPlacement={kind:'script',url:'script-1',name:'动作',folders:['动作']};
const read=()=>JSON.parse(localStorage.getItem('beike.custom_assets') || '[]');
const paths=(item:LibraryMediaPlacement)=>read().find((row:{placementKey?:string})=>row.placementKey===libraryMediaKey(item))?.placementFolders;

it('moves multiple media in one write, preserves unrelated memberships and deduplicates the destination',()=>{
  const target=createMediaFolder('目标','场景');
  collectCustomMedia('原图',image.url,'image','导入素材',false);
  const original=read()[0];
  const other={...image,url:'/storage/b.png',folders:['场景/室内',target]};
  const write=vi.spyOn(localStorage,'setItem');
  moveLibraryMedia([image,other],'场景',target,[target]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(paths(image)).toEqual(['我的文件夹/收藏',target]);
  expect(paths(other)).toEqual([target]);
  expect(read()[0]).toEqual(original);
  moveLibraryMedia([{...image,folders:['场景/室内']}],target,'场景/室外',['场景/室外']);
  expect(paths(image)).toEqual(['我的文件夹/收藏','场景/室外']);
});

it('moves mixed kinds from All Folders to a custom category and treats scripts as records',()=>{
  const target=createMediaFolder('项目参考');
  moveLibraryMedia([image,script],'',target,[target]);
  expect(paths(image)).toEqual([target]);
  expect(paths(script)).toEqual([target]);
});

it('rejects incompatible, missing or stale destinations/source memberships without partial writes',()=>{
  const target=createMediaFolder('室外','场景');
  expect(()=>moveLibraryMedia([image,script],'',target,[target])).toThrow('类型');
  expect(read()).toEqual([]);
  expect(()=>moveLibraryMedia([image],'不存在',target,[target])).toThrow('分类已变化');
  expect(()=>moveLibraryMedia([image],'','已删除',[])).toThrow('不存在');
  moveLibraryMedia([image],'',target,[target]);
  const before=localStorage.getItem('beike.custom_assets');
  expect(()=>moveLibraryMedia([image],'场景/室内','场景/室外',['场景/室外'])).toThrow('分类已变化');
  expect(localStorage.getItem('beike.custom_assets')).toBe(before);
});

it('updates moved media when their target category is renamed, relocated or deleted',()=>{
  const target=createMediaFolder('夜景','场景');
  moveLibraryMedia([image],'',target,[target]);
  const renamed=relocateMediaFolder(target,'傍晚','场景',['场景']);
  expect(paths(image)).toEqual([renamed]);
  expect(()=>relocateMediaFolder(renamed,'傍晚','声音',['声音'])).toThrow('类型');
  const moved=relocateMediaFolder(renamed,'傍晚','我的文件夹',[]);
  expect(paths(image)).toEqual([moved]);
  deleteMediaFolder(moved);
  expect(paths(image)).toBeUndefined();
});

it('keeps collecting and removing moved media consistent with their effective folders',()=>{
  const target=createMediaFolder('A');
  const another=createMediaFolder('B');
  collectCustomMedia(image.name,image.url,'image',another);
  moveLibraryMedia([image],'',target,[target]);
  collectCustomMedia(image.name,image.url,'image',another);
  expect(paths(image)).toEqual([target,another]);
  removeCollectedMedia(image.url,another);
  expect(paths(image)).toEqual([target]);
  removeCollectedMedia(image.url,target);
  expect(paths(image)).toBeUndefined();
});

it('leaves the whole batch untouched if storage is full',()=>{
  const target=createMediaFolder('目标');
  const before=localStorage.getItem('beike.custom_assets');
  localStorage.setItem=vi.fn(()=>{throw new Error('存储空间不足');});
  expect(()=>moveLibraryMedia([image,script],'',target,[target])).toThrow('存储空间不足');
  expect(localStorage.getItem('beike.custom_assets')).toEqual(before);
});

it('keeps collection-only media available when the former category is deleted after moving',()=>{
  const source=createMediaFolder('来源');
  const target=createMediaFolder('目标');
  collectCustomMedia(image.name,image.url,'image',source);
  const originalId=read()[0].id;
  moveLibraryMedia([{...image,folders:[source]}],source,target,[target]);
  deleteMediaFolder(source);
  expect(read().find((item:{id:string})=>item.id===originalId)).toMatchObject({folder:target,mediaUrl:image.url});
  expect(paths(image)).toEqual([target]);
});

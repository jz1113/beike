import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectCustomMedia, createMediaFolder, deleteMediaFolder, readMediaFolders, removeCollectedMedia, relocateMediaFolder } from './customAssetStore';

beforeEach(()=>{
  const values = new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>values.set(key,value)});
  vi.stubGlobal('window',new EventTarget());
});
afterEach(()=>vi.unstubAllGlobals());

it('creates persistent children under the requested parent and rejects sibling or preset collisions',()=>{
  const existing=['场景/室内','场景/室外'];
  expect(()=>createMediaFolder('室内','场景',existing)).toThrow('同名');
  const path=createMediaFolder(' 夜景 ','场景',existing);
  expect(path).toBe('场景/夜景');
  expect(()=>createMediaFolder('夜景','场景')).toThrow('同名');
  expect(()=>createMediaFolder('A/B',path)).toThrow('斜杠');
  expect(readMediaFolders()).toEqual([path]);
  expect(createMediaFolder('夜景')).toBe('我的文件夹/夜景');
});

it('removes a category subtree while preserving the original and similarly named siblings',()=>{
  const parent=createMediaFolder('夜景','场景');
  const child=createMediaFolder('街道',parent);
  const sibling=createMediaFolder('夜景二','场景');
  const url='/storage/night.png';
  collectCustomMedia('原图',url,'image','导入素材',false);
  for(const folder of [parent,child,sibling]) collectCustomMedia('收藏',url,'image',folder);
  removeCollectedMedia(url,parent);
  deleteMediaFolder(parent);
  expect(readMediaFolders()).toEqual([sibling]);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)).toEqual([
    expect.objectContaining({folder:sibling}),expect.objectContaining({folder:'导入素材'}),
  ]);
  expect(()=>collectCustomMedia('收藏',url,'image',child)).toThrow('已删除');
});


it('renames and moves descendants and image/script collections, preserving originals and siblings',()=>{
  const source=createMediaFolder('参考');
  const child=createMediaFolder('细节',source);
  const sibling=createMediaFolder('参考二');
  collectCustomMedia('图片','/storage/source.png','image',child);
  collectCustomMedia('脚本','script-1','script',source);
  collectCustomMedia('原图','/storage/original.png','image',child,false);
  const original=JSON.parse(localStorage.getItem('beike.custom_assets')!)[0];
  const renamed=relocateMediaFolder(source,'灵感','我的文件夹',readMediaFolders());
  expect(readMediaFolders()).toEqual([renamed,renamed+'/细节',sibling]);
  const target=relocateMediaFolder(renamed,'灵感',sibling,readMediaFolders());
  expect(readMediaFolders()).toEqual([target,target+'/细节',sibling]);
  const assets=JSON.parse(localStorage.getItem('beike.custom_assets')!);
  expect(assets[0]).toEqual(original);
  expect(assets[1]).toMatchObject({folder:target,scriptId:'script-1'});
  expect(assets[2]).toMatchObject({folder:target+'/细节',mediaUrl:'/storage/source.png'});
  deleteMediaFolder(target);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)).toEqual([original]);
});

it('rejects self/descendant moves, invalid names, unknown destinations and duplicate built-in categories without writes',()=>{
  const source=createMediaFolder('夜景','场景');
  const child=createMediaFolder('街道',source);
  const before=localStorage.getItem('beike.media_folders.v1');
  const known=[source,child,'场景','场景/室内'];
  for(const parent of [source,child]) expect(()=>relocateMediaFolder(source,'夜景',parent,known)).toThrow('自身或子分类');
  expect(()=>relocateMediaFolder(source,'室内','场景',known)).toThrow('同名');
  expect(()=>relocateMediaFolder(source,'A/B','场景',known)).toThrow('斜杠');
  expect(()=>relocateMediaFolder(source,'A','不存在',known)).toThrow('不存在');
  expect(()=>relocateMediaFolder('场景/室内','A','场景',known)).toThrow('已创建');
  expect(localStorage.getItem('beike.media_folders.v1')).toEqual(before);
});

it('keeps legacy collections removable after moving out of My Folders and prevents incompatible media moves',()=>{
  const source=createMediaFolder('老收藏');
  localStorage.setItem('beike.custom_assets',JSON.stringify([{id:'legacy',folder:source,mediaKind:'image',mediaUrl:'/storage/a.png'}]));
  expect(()=>relocateMediaFolder(source,'老收藏','声音',['声音'])).toThrow('类型');
  const target=relocateMediaFolder(source,'老收藏','场景',['场景']);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)[0]).toMatchObject({folder:target,collection:true});
  removeCollectedMedia('/storage/a.png',target);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)).toEqual([]);
});

it('rolls back the folder tree if saving updated memberships fails',()=>{
  const source=createMediaFolder('夜景','场景');
  collectCustomMedia('图片','/storage/a.png','image',source);
  const before=localStorage.getItem('beike.custom_assets');
  const write=localStorage.setItem;
  localStorage.setItem=vi.fn((key:string,value:string)=>{
    if(key==='beike.custom_assets') throw new Error('存储空间不足');
    write(key,value);
  });
  expect(()=>relocateMediaFolder(source,'白天','场景',['场景'])).toThrow('存储空间不足');
  expect(readMediaFolders()).toEqual([source]);
  expect(localStorage.getItem('beike.custom_assets')).toEqual(before);
});

import { expect, it } from 'vitest';
import { indexMediaFolders } from './mediaFolders';

it('counts a card once per ancestor even when it belongs to two child folders',()=>{
  const folders = indexMediaFolders([{url:'/storage/1.png',kind:'image',name:'场景',keywords:[],
    folders:['场景/室内','我的文件夹/A','我的文件夹/B']}],['我的文件夹/空']);
  const counts = Object.fromEntries(folders.map(({path,count}) => [path,count]));
  expect(counts).toMatchObject({'场景':1,'场景/室内':1,'场景/室外':0,'我的文件夹':1,'我的文件夹/A':1,'我的文件夹/B':1,'我的文件夹/空':0});
});

it('shows nested custom categories directly after their parent, before the next built-in branch',()=>{
  const paths=indexMediaFolders([],['场景/室内/厨房','场景/夜景','动作/转场']).map(node=>node.path);
  expect(paths.slice(0,6)).toEqual(['场景','场景/室内','场景/室内/厨房','场景/室外','场景/夜景','人物']);
  expect(paths).toContain('动作/转场');
});

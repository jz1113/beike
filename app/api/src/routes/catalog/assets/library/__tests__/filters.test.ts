import {test,expect} from 'vitest';
import {prisma} from '@beike/server-kit/prisma';
import {executeLibraryGet} from '../libraryQueries';
test('keyword and category are combined',async()=>{
 await prisma.sceneAsset.create({data:{id:'foreign-category',title:'独特测试匹配',description:'audit',lighting:'daylight',category:'luxury_modern'}});
 const response=await executeLibraryGet(new Request('http://localhost/api/catalog/assets/library?type=scene&category=chinese_style&keyword='+encodeURIComponent('独特测试匹配')));const body=await response.json();expect(body.items.map((i:any)=>i.id)).not.toContain('foreign-category');
});

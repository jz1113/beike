import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@beike/server-kit/prisma';
import { executeLibraryPost, executeLibraryPut } from '../libraryMutations';
import { executeLibraryGet } from '../libraryQueries';
const request = (body: unknown) => new Request('http://localhost/library', { method:'POST', body:JSON.stringify(body) });
const post = async (body: unknown) => (await executeLibraryPost(request(body))).json();
it('manages two-level categories and preserves IDs, favorites, and usage when reclassifying an album', async () => {
  const name = randomUUID();
  const result = await post({action:'save-product-category',name});
  const parent = result.categories.find((c:any)=>c.name===name);
  const childResult = await post({action:'save-product-category',name:'子类',parentId:parent.id});
  const child = childResult.categories.find((c:any)=>c.parentId===parent.id);
  expect((await post({action:'save-product-category',name:'三级',parentId:child.id})).success).toBe(false);
  const a = await post({assetType:'full_prompt',data:{title:name,albumName:name,sourceImages:'["a","b"]',reversePromptZh:'needle',productCategoryIds:JSON.stringify([parent.id])}});
  const b = await post({assetType:'full_prompt',data:{title:name,albumName:name,sourceImages:'["different"]',reversePromptZh:'other'}});
  expect(a.item.albumId).not.toBe(b.item.albumId);
  await executeLibraryPut(request({assetType:'full_prompt',id:a.item.id,data:{isFavorite:true,usageCount:7}}));
  expect((await post({action:'classify-albums',albumIds:[a.item.albumId],productCategoryId:child.id})).success).toBe(true);
  const response = await executeLibraryGet(new Request(`http://localhost/library?type=full_prompt&productCategoryId=${parent.id}&keyword=needle&pageSize=1`));
  const filtered = await response.json(); expect(filtered.total).toBe(1); expect(filtered.items[0]).toMatchObject({id:a.item.id,isFavorite:true,usageCount:7,productCategoryIds:JSON.stringify([child.id])});
  const update = await executeLibraryPut(request({assetType:'full_prompt',id:a.item.id,data:{title:'edited',albumId:a.item.albumId,productCategoryIds:JSON.stringify([child.id]),isUniversal:false,albumName:name}}));
  expect(update.ok).toBe(true);
});
it('filters universal and uncategorized materials before paging and counts', async () => {
  const c = await prisma.assetProductCategory.create({data:{name:randomUUID()}});
  const name = randomUUID();
  const universal = await post({assetType:'persona',data:{name,isUniversal:true}});
  const specific = await post({assetType:'persona',data:{name,productCategoryIds:JSON.stringify([c.id])}});
  await post({assetType:'persona',data:{name}});
  const read = async (query:string) => (await executeLibraryGet(new Request(`http://localhost/library?type=persona&keyword=${name}&${query}`))).json();
  expect((await read(`productCategoryId=${c.id}`)).total).toBe(2);
  expect((await read(`productCategoryId=${c.id}&includeUniversal=false`)).items.map((r:any)=>r.id)).toEqual([specific.item.id]);
  expect((await read('productCategoryId=unclassified')).total).toBe(1);
  await post({action:'classify-assets',assetType:'persona',ids:[universal.item.id],productCategoryIds:[c.id],isUniversal:false});
  expect((await read(`productCategoryId=${c.id}&includeUniversal=false`)).total).toBe(2);
});
it('restores album links, category hierarchy, universal flags and statistics from v3 backups', async () => {
  const name = randomUUID();
  const restored = await post({action:'bulk-import',productCategories:[{id:'old-parent',name,position:0},{id:'old-child',name:'子类',parentId:'old-parent',position:0}],albums:[{id:'old-album',name,productCategoryId:'old-child'}],items:[
    {assetType:'full_prompt',data:{title:name,reversePromptZh:'text',albumId:'old-album',productCategoryIds:'["old-child"]',isFavorite:true,usageCount:8}},
    {assetType:'persona',data:{name,description:'人设',albumId:'old-album',productCategoryIds:'["old-parent","old-child"]',isUniversal:true}},
  ]});
  expect(restored.success).toBe(true);
  const [full, persona] = restored.items;
  expect(full.albumId).toBe(persona.albumId); expect(full.albumId).not.toBe('old-album');
  expect(full.isFavorite).toBe(true);expect(full.usageCount).toBe(8);expect(persona.isUniversal).toBe(true);
  const album = await prisma.promptAlbum.findUniqueOrThrow({where:{id:full.albumId}});
  expect(full.productCategoryIds).toBe(JSON.stringify([album.productCategoryId]));
});

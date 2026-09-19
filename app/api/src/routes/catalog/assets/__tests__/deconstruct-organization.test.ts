import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@beike/server-kit/prisma';
import { persistDeconstructedAssets } from '../../../../services/deconstruct/saveAssets';
vi.mock('@beike/server-kit/imageConverter', () => ({
  createCompactThumbnailDataUrl: async (url: string) => url,
  createCompactSourceImagesJson: async (urls: string[]) => JSON.stringify(urls),
}));
it('saves each source slot, isolates names across sources, and keeps user metadata on retry', async () => {
  const category = await prisma.assetProductCategory.create({data:{name:randomUUID()}});
  const options = {
    albumName: randomUUID(), imageUrls:['image:a','image:b'], isSingleImage:false, category:'chinese_style', productCategoryId:category.id,
    parsedResult:{}, perImageResults:[{image_index:1,title:'same',reverse_prompt_zh:'same text'}, {image_index:2,title:'same',reverse_prompt_zh:'same text'}],
  };
  const first = await persistDeconstructedAssets(options);
  expect(first.fullPrompts).toHaveLength(2);
  expect(first.fullPrompts[0].id).not.toBe(first.fullPrompts[1].id);
  await prisma.fullPromptAsset.update({where:{id:first.fullPrompts[0].id},data:{usageCount:6,isFavorite:true}});
  const retry = await persistDeconstructedAssets(options);
  expect(retry.fullPrompts[0]).toMatchObject({id:first.fullPrompts[0].id,usageCount:6,isFavorite:true,productCategoryIds:JSON.stringify([category.id]),category:'chinese_style'});
  const different = await persistDeconstructedAssets({...options,imageUrls:['different:a','different:b']});
  expect(different.fullPrompts[0].albumId).not.toBe(first.fullPrompts[0].albumId);
});

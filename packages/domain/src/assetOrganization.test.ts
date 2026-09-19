import { expect, it } from 'vitest';
import { categoryScope, groupPromptAlbums, matchesProductCategory } from './assetOrganization';
it('keeps unclassified distinct from universal and includes child categories', () => {
  const scope = categoryScope([{id:'jewelry', name:'首饰',parentId:null,position:0},{id:'earring',name:'耳饰',parentId:'jewelry',position:0}], 'jewelry');
  expect(matchesProductCategory({id:'a',productCategoryIds:'["earring"]'},'jewelry',scope)).toBe(true);
  expect(matchesProductCategory({id:'b',isUniversal:true},'unclassified',[])).toBe(false);
  expect(matchesProductCategory({id:'b',isUniversal:true},'jewelry',scope,false)).toBe(false);
  expect(matchesProductCategory({id:'c'},'unclassified',[])).toBe(true);
});
it('groups by stable identity, preserves order, and never merges unknown sources by name', () => {
  const groups = groupPromptAlbums([{id:'2',albumId:'a',sourceImageIndex:2},{id:'1',albumId:'a',sourceImageIndex:1},{id:'3',albumName:'same'},{id:'4',albumName:'same'}], [{id:'a',name:'案例',productCategoryId:'jewelry'}]);
  expect(groups).toHaveLength(3);
  expect(groups[0].items.map(i=>i.id)).toEqual(['1','2']);
});

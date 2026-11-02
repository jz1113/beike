import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import type { StoredSalesScript } from '../api/salesScripts';
import type { SalesMaterialCard } from './salesMaterialCatalog';
import { filterStandaloneSalesActions, salesReferenceLibraryView, standaloneSalesActions } from './salesReferenceLibrary';

const script: StoredSalesScript = {
  id: 'script-1', title: '转身', status: 'verified', videoUrl: '/source.mp4', depthVideoUrl: '/depth.mp4',
  videoHash: '', model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '',
  script: normalizeScriptTemplate({ title: '转身', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '转身展示{{商品}}' }] }] })!,
};
const action = (id: string, video = ''): SalesMaterialCard => ({ key: id, id, kind: 'action', title: '转身',
  description: '', tags: [], image: video ? '' : '/pose.jpg', audio: '', video, mediaType: video ? 'depth-video' : 'depth-image', badge: '深度素材' });

describe('unified script and action material library', () => {
  it('interleaves scripts and independent actions in ascending numeric title order without mutating the source lists', () => {
    const items = [{ ...script, id: 's12', title: '动作12' }, { ...script, id: 's2', title: '动作2' }];
    const cards = [{ ...action('a10'), title: '动作10' }, { ...action('a1'), title: '动作1' }, action('linked', '/depth.mp4')];
    const view = salesReferenceLibraryView(items, cards, [], { category: 'all', style: 'all', query: '' });
    expect(view.entries.map((entry) => [entry.kind, entry.item.title])).toEqual([
      ['action', '动作1'], ['script', '动作2'], ['action', '动作10'], ['script', '动作12'],
    ]);
    expect(view.count).toBe(4);
    expect(items.map((item) => item.title)).toEqual(['动作12', '动作2']);
    expect(cards.map((item) => item.id)).toEqual(['a10', 'a1', 'linked']);
  });
  it('collapses only explicitly linked videos, keeping same-name videos and images', () => {
    const original = action('original', '/source.mp4');
    const depth = action('depth', '/depth.mp4');
    const unrelated = action('unrelated', '/another.mp4');
    const image = action('image');
    expect(standaloneSalesActions([original, depth, unrelated, image], [script])).toEqual([unrelated, image]);
    expect(standaloneSalesActions([original, depth], [{ ...script, videoUrl: '', depthVideoUrl: '' }])).toEqual([original, depth]);
  });
  it('restores independent media when its script is removed or the association changes', () => {
    const depth = action('depth', '/depth.mp4');
    expect(standaloneSalesActions([depth], [])).toEqual([depth]);
    expect(standaloneSalesActions([depth], [{ ...script, depthVideoUrl: '/new.mp4' }])).toEqual([depth]);
  });
  it('keeps independent videos and images together while filtering category, search and style', () => {
    const video = { ...action('depth', '/depth.mp4'), categoryId: 'fashion' };
    const image = { ...action('image'), categoryId: 'deleted' };
    const categories = [{ id: 'fashion', name: '服饰' }];
    const filters = { category: 'all' as const, style: 'all', query: '' };
    expect(filterStandaloneSalesActions([video, image], filters, categories)).toEqual([video, image]);
    expect(filterStandaloneSalesActions([video, image], { ...filters, style: 'unstyled' }, categories)).toEqual([video, image]);
    expect(filterStandaloneSalesActions([video, image], { ...filters, category: 'category:fashion', query: ' 服饰 ' }, categories)).toEqual([video]);
    expect(filterStandaloneSalesActions([video, image], { ...filters, category: 'uncategorized' }, categories)).toEqual([image]);
    expect(filterStandaloneSalesActions([video], { ...filters, style: 'dancing' }, categories)).toEqual([]);
    expect(filterStandaloneSalesActions([video], { ...filters, category: 'draft_only' }, categories)).toEqual([]);
  });
  it('counts linked bundles once and includes script-only categories in facets', () => {
    const items = [{ ...script, script: { ...script.script, taxonomy: { ...script.script.taxonomy, categoryId: 'fashion', styleId: 'dance' } } }];
    const taxonomy = [{ id: 'fashion', name: '服饰', kind: 'category' as const }, { id: 'dance', name: '舞蹈', kind: 'style' as const }];
    const view = salesReferenceLibraryView(items, [action('linked', '/depth.mp4'), action('image')], taxonomy,
      { category: 'all', style: 'all', query: '' });
    expect(view.total).toBe(2);
    expect(view.count).toBe(2);
    expect(view.categories.map(({ value, count }) => [value, count])).toEqual([['all', 2], ['unclassified', 1], ['category:fashion', 1]]);
    expect(view.scripts).toEqual(items);
    expect(view.actions).toEqual([action('image')]);
    expect(view.styles.map(({ value, count }) => [value, count])).toEqual([['all', 2], ['dance', 1]]);
  });
  it('counts each alternative against the remaining filters and retains zero-result options', () => {
    const taxonomy = [{ id: 'fashion', name: '服饰', kind: 'category' as const }, { id: 'dance', name: '舞蹈', kind: 'style' as const }];
    const items = [{ ...script, script: { ...script.script, taxonomy: { ...script.script.taxonomy, categoryId: 'fashion', styleId: 'dance' } } }];
    const view = salesReferenceLibraryView(items, [action('image')], taxonomy,
      { category: 'category:fashion', style: 'unstyled', query: ' 转身 ' });
    expect(view.count).toBe(0);
    expect(view.total).toBe(2);
    expect(view.categories.find((item) => item.value === 'unclassified')?.count).toBe(1);
    expect(view.styles.map(({ value, count }) => [value, count])).toEqual([['all', 1], ['dance', 1]]);
  });
});

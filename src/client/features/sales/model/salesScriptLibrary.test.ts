import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { salesScriptTemplateSchema } from '@shared/contracts/salesScripts';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import type { StoredSalesScript } from '../api/salesScripts';
import { filterScriptCategory, filterScriptResults, scriptTaxonomyEntry } from './salesScriptLibrary';

const catalog: ScriptTaxonomyItem[] = [
  { id: 'category-knit', kind: 'category', name: '秋冬针织' },
  { id: 'category-skin', kind: 'category', name: '护肤测评' },
  { id: 'style-daily', kind: 'style', name: '日常记录' },
  { id: 'style-close', kind: 'style', name: '质感特写' },
];
function item(id: string, categoryId: string, styleId: string, categories: string[]): StoredSalesScript {
  return { id, title: id, status: 'verified', videoUrl: '', videoHash: '', model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '',
    script: normalizeScriptTemplate({ title: id, durationSec: 3, taxonomy: { categoryId, styleId, productCategory: categories[0], subCategory: '常用' }, reusable: { categories }, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '展示{{商品}}' }] }] })! };
}
const fashion = item('外套展示', 'category-knit', 'style-daily', ['fashion']);
const beauty = item('产品测评', 'category-skin', 'style-close', ['beauty', 'fashion']);

describe('user-owned script library taxonomy', () => {
  it('files scripts under custom IDs', () => {
    expect(filterScriptCategory([fashion, beauty], 'category:category-knit', catalog)).toEqual([fashion]);
    expect(filterScriptCategory([fashion, beauty], 'all', catalog)).toEqual([fashion, beauty]);
    expect(filterScriptCategory([fashion, beauty], 'category:unknown', catalog)).toEqual([]);
  });
  it('combines custom style, category-name search and shot filters', () => {
    const filters = { query: ' 护肤 ', style: 'style-close', shots: 'all' as const };
    expect(filterScriptResults([fashion, beauty], filters, catalog)).toEqual([beauty]);
    expect(filterScriptResults([fashion, beauty], { ...filters, style: 'style-daily' }, catalog)).toEqual([]);
    expect(filterScriptCategory([fashion, { ...beauty, status: 'draft' }], 'draft_only', catalog)).toHaveLength(1);
  });
  it('keeps legacy or deleted references unfiled without reviving predefined folders', () => {
    const legacy = item('旧脚本', '', '', ['fashion']);
    const orphan = item('旧归类脚本', 'deleted', 'deleted', ['beauty']);
    expect(filterScriptResults([fashion, legacy, orphan], { query: '', style: 'unstyled', shots: 'all' }, catalog)).toEqual([legacy, orphan]);
    expect(scriptTaxonomyEntry(fashion.script, 'category', [])).toBeUndefined();
    expect(filterScriptCategory([fashion, legacy, orphan], 'uncategorized', catalog)).toEqual([legacy, orphan]);
  });
  it('renames by stable ID without rewriting scripts and includes the new name in search', () => {
    const renamed = catalog.map((row) => row.id === 'category-knit' ? { ...row, name: '我的穿搭库' } : row);
    expect(scriptTaxonomyEntry(fashion.script, 'category', renamed)?.name).toBe('我的穿搭库');
    expect(filterScriptResults([fashion, beauty], { query: '我的穿搭库', style: 'all', shots: 'all' }, renamed)).toEqual([fashion]);
    expect(fashion.script.taxonomy.categoryId).toBe('category-knit');
  });
  it('preserves manual IDs through contracts and normalization while old scripts stay readable', () => {
    const saved = salesScriptTemplateSchema.parse(fashion.script);
    expect(normalizeScriptTemplate(saved)?.taxonomy).toMatchObject({ categoryId: 'category-knit', styleId: 'style-daily', productCategory: 'fashion' });
    expect(normalizeScriptTemplate({ title: '历史', durationSec: 3, shots: fashion.script.shots })?.taxonomy).toMatchObject({ categoryId: '', styleId: '' });
  });
});

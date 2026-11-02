import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import type { StoredSalesScript } from '../api/salesScripts';
import type { SalesMaterialCard } from '../model/salesMaterialCatalog';
import { SalesMaterialWorkspace } from './SalesMaterialWorkspace';
import { SalesScriptLibrary } from './SalesScriptLibrary';
import { SalesLibrarySelect } from './SalesLibrarySelect';

const script: StoredSalesScript = { id: 's1', title: '转身展示', videoUrl: '/source.mp4', depthVideoUrl: '/depth.mp4', videoHash: '', status: 'verified',
  script: normalizeScriptTemplate({ title: '转身展示', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '转身' }] }] })!,
  model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' };
const action: SalesMaterialCard = { key: 'a1', id: 'a1', kind: 'action', title: '独立深度', description: '', tags: [], image: '', audio: '', video: '/depth.mp4', badge: '深度视频', mediaType: 'depth-video' };

describe('simplified material library', () => {
  it('shows counts with a unit in filter options without repeating totals in closed controls', () => {
    const html = renderToStaticMarkup(createElement(SalesLibrarySelect, { value: 'all', label: '按风格筛选', onChange: () => {},
      showSelectedCount: false, countUnit: '组', options: [{ value: 'all', label: '全部风格', count: 1 }, { value: 'dance', label: '舞蹈', count: 1 }] }));
    const trigger = html.slice(html.indexOf('<button'), html.indexOf('</button>'));
    expect(trigger).toContain('全部风格');
    expect(trigger).not.toContain('sales-library-select-count');
    expect(html.match(/>1 组</g)).toHaveLength(2);
  });
  it('has one action entry containing the unified library', () => {
    const html = renderToStaticMarkup(createElement(SalesMaterialWorkspace, { section: 'script', onSectionChange: () => {}, promptContent: null, promptsUnsaved: false }, '统一列表'));
    expect(html).not.toContain('商品资产');
    expect(html).toContain('动作素材');
    expect(html).toContain('统一列表');
    expect(html).not.toContain('脚本与动作视频');
    expect(html).not.toContain('>动作资产<');
    const materialGroup = html.slice(html.indexOf('aria-label="素材资产"'), html.indexOf('aria-label="创作配置"'));
    expect(materialGroup.match(/class="sales-cat-item /g)).toHaveLength(4);
  });
  it('shows a linked bundle once and exposes link and delete actions for independent media', () => {
    const html = renderToStaticMarkup(createElement(SalesScriptLibrary, {
      embedded: true, items: [script], actionCards: [action, { ...action, key: 'a2', id: 'a2', video: '/another.mp4', title: '另一个动作' }],
      loading: false, taxonomyItems: [], taxonomyLoading: false, onManageTaxonomy: () => {}, onCreateTaxonomy: async () => null,
      onReview: () => {}, onArchive: () => {}, onDelete: () => {}, onRefresh: () => {},
      onReviewAction: () => {}, onDeleteAction: () => {}, onLinkAction: () => {}, onOpenImport: () => {},
    }));
    expect(html).not.toContain('<h2>动作素材</h2>');
    expect(html).not.toContain('导入一次，脚本与深度视频一起保存、一起复用。');
    expect(html).toContain('脚本 + 深度视频');
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(html).not.toContain('独立深度');
    expect(html).toContain('关联脚本');
    expect(html).toContain('aria-label="删除动作素材 另一个动作"');
    expect(html).toContain('aria-label="删除脚本 转身展示"');
    expect(html.match(/aria-label="管理分类与风格"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="管理商品类目"');
    expect(html).not.toContain('aria-label="管理风格"');
    expect(html).not.toContain('添加分类');
    expect(html).not.toContain('aria-label="新建商品类目"');
    expect(html).toContain('aria-label="搜索动作素材"');
    expect(html).toContain('aria-label="刷新素材库"');
    expect(html).not.toContain('aria-label="按素材分类筛选"');
    expect(html).not.toContain('aria-label="按素材类型筛选"');
    expect(html).not.toContain('全部素材');
    expect(html).not.toContain('全部分类');
    expect(html).not.toContain('新增风格');
  });
  it('keeps review states out of categories and retains empty categories with explicit counts', () => {
    const props = { embedded: true, items: [{ ...script, status: 'draft' as const, script: { ...script.script, taxonomy: { ...script.script.taxonomy, categoryId: 'fashion' } } }],
      loading: false, taxonomyItems: [{ id: 'fashion', kind: 'category' as const, name: '服饰' }, { id: 'empty', kind: 'category' as const, name: '空分类' }], taxonomyLoading: false, onManageTaxonomy: () => {},
      onReview: () => {}, onArchive: () => {}, onDelete: () => {}, onRefresh: () => {} };
    const categoryOptions = (html: string) => html.slice(html.indexOf('aria-label="动作商品类目导航"'), html.indexOf('</nav>'));
    const html = renderToStaticMarkup(createElement(SalesScriptLibrary, props));
    expect(html).toContain('待核对');
    expect(categoryOptions(html)).toContain('服饰');
    expect(categoryOptions(html)).not.toContain('待核对');
    expect(categoryOptions(html)).not.toContain('未分类');
    expect(categoryOptions(html)).not.toContain('全部分类');
    expect(categoryOptions(html)).toContain('0 组');
    const withUnfiled = renderToStaticMarkup(createElement(SalesScriptLibrary, { ...props, actionCards: [{ ...action, video: '/unlinked.mp4' }] }));
    expect(categoryOptions(withUnfiled)).not.toContain('未分类');
    expect(withUnfiled.match(/<article/g)).toHaveLength(2);
    expect(withUnfiled).toContain('独立深度');
  });
});

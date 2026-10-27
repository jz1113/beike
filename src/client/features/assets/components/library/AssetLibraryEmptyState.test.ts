import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { AssetLibraryEmptyState } from './AssetLibraryEmptyState';

const actions = { onClearFilters() {}, onBrowseAll() {}, onFeedReference() {} };

describe('素材库空状态', () => {
  it('给空分类提供投喂与浏览入口，不把分类导航当成筛选无结果', () => {
    const html = renderToStaticMarkup(createElement(AssetLibraryEmptyState, { tab: 'full_prompt', filtered: false, folderName: '珠宝首饰', ...actions }));
    expect(html).toContain('珠宝首饰还没有图组母本');
    expect(html).toContain('投喂参考图');
    expect(html).toContain('查看全部母本');
    expect(html).not.toContain('清除筛选');
  });

  it('筛选无结果时保留当前分类并提供清除筛选入口', () => {
    const html = renderToStaticMarkup(createElement(AssetLibraryEmptyState, { tab: 'full_prompt', filtered: true, folderName: '手机', ...actions }));
    expect(html).toContain('没有符合条件的图组母本');
    expect(html).toContain('清除筛选');
    expect(html).toContain('查看全部母本');
    expect(html).not.toContain('母本积累流程');
  });

  it('空图库与人物库都有开始积累素材的入口', () => {
    for (const tab of ['full_prompt', 'persona'] as const) {
      const html = renderToStaticMarkup(createElement(AssetLibraryEmptyState, { tab, filtered: false, ...actions }));
      expect(html).toContain('投喂参考图');
      expect(html).not.toContain('查看全部母本');
      expect(html).not.toContain('清除筛选');
    }
  });
});

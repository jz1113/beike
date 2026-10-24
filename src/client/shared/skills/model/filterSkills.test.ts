import { describe, expect, it } from 'vitest';
import { filterSkills, type SkillFilters } from './filterSkills';
import type { SkillItem } from './skillTypes';

const items: SkillItem[] = [
  { id: 'assistant:official', title: '历史脚本', description: '金榜题名', models: '', category: '一镜到底', presentation: 'creation', runtime: 'assistant', isOfficial: true, genres: ['视频'], tags: ['第一人称'] },
  { id: 'assistant:custom', title: '人物脚本', description: '连贯动作', models: 'Model-Video', category: '一镜到底', presentation: 'creation', runtime: 'assistant', author: '作者', tags: ['POV'] },
  { id: 'workshop:custom', title: '母本换品', description: '换品', models: '', category: '商品摄影', presentation: 'creation', runtime: 'workshop' },
  { id: 'assistant:agent', title: '关键词审核', description: '逐行判断', models: '', category: '数据审核', presentation: 'agent', runtime: 'assistant', isOfficial: true },
];
const filters: SkillFilters = { presentation: 'creation', runtime: 'all', scope: 'all', category: '全部', query: '' };
const favorites = new Set(['assistant:official', 'assistant:agent']);
const ids = (overrides: Partial<SkillFilters>) => filterSkills(items, { ...filters, ...overrides }, favorites).map(item => item.id);

describe('skill library navigation', () => {
  it('keeps owned, favorite and runtime scopes independent of presentation', () => {
    expect(ids({ scope: 'my' })).toEqual(['assistant:custom', 'workshop:custom']);
    expect(ids({ scope: 'favorite' })).toEqual(['assistant:official']);
    expect(ids({ presentation: 'agent', scope: 'favorite' })).toEqual(['assistant:agent']);
    expect(ids({ runtime: 'workshop' })).toEqual(['workshop:custom']);
  });
  it('finds tags, genres and configured models, ignoring case and extra whitespace', () => {
    expect(ids({ query: '  视频 第一人称  ' })).toEqual(['assistant:official']);
    expect(ids({ query: 'pov MODEL-video' })).toEqual(['assistant:custom']);
  });
  it('combines category and search without leaking other scopes', () => {
    expect(ids({ category: '一镜到底', query: '脚本' })).toEqual(['assistant:official', 'assistant:custom']);
    expect(ids({ category: '商品摄影', query: '脚本' })).toEqual([]);
    expect(ids({ scope: 'my', query: '历史' })).toEqual([]);
  });
});

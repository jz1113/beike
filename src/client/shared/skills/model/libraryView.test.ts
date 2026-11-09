import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSISTANT_SKILLS, groupAssistantSkillsByCategory } from '@shared/domain/assistant/skills';
import { filterSkills, librarySkillItem, skillCategories, skillPresentation, type SkillFilters } from './libraryView';
import { BUILTIN_SKILL_PREVIEWS, type SkillItem } from './skillTypes';

describe('unified skill library', () => {
  it('preserves platform and local creation provenance without classifying either as official', () => {
    for (const [kind, badge, url] of [['platform', '平台来源原版', 'https://example.com/skill'], ['local', '贝壳内置', '/skills']] as const) {
      const source = { kind, url, revision: 'v1', license: '未提供独立许可证', files: {} };
      const item = librarySkillItem({ kind: 'assistant', content: { id: 'source', name: '来源', description: '说明', prompt: '正文', isBuiltin: true, source, meta: { kind: 'creation', genres: ['图片'], tags: [] } } });
      expect(item).toMatchObject({ source, badge, presentation: 'creation', isBuiltin: true, isOfficial: false });
    }
  });

  it('keeps execution compatibility and identities separate from output labels', () => {
    const assistant = librarySkillItem({ kind: 'assistant', content: { id: 'same', name: 'assistant', description: '图片任务', prompt: '规则', meta: { genres: ['图片'], tags: [] }, libraryVersion: 'a' } });
    const workshop = librarySkillItem({ kind: 'workshop', content: { id: 'same', name: '珠宝', category: 'jewelry', promptSnippet: '换品规则', libraryVersion: 'b', isOfficial: true } });
    expect(assistant.id).not.toBe(workshop.id);
    expect(assistant.runtime).toBe('assistant');
    expect(workshop.runtime).toBe('workshop');
    expect(workshop.prompt).toBe('换品规则');
    expect(workshop.libraryVersion).toBe('b');
    expect(workshop.isOfficial).toBe(true);
  });

  it('classifies legacy creative packages without changing execution identities', () => {
    const base = { id: 'custom', name: '自定义', description: '说明', prompt: '中文正文' };
    expect(skillPresentation(base)).toBe('agent');
    const creation = librarySkillItem({ kind: 'assistant', content: { ...base, meta: { genres: ['视频'], tags: ['一镜到底'], coverUrl: '/cover.jpg', showcaseUrls: ['/sample.jpg'], defaultVideoModel: 'model-id' } } });
    expect(creation.presentation).toBe('creation');
    expect(creation.runtime).toBe('assistant');
    expect(creation.id).toBe('assistant:custom');
    expect(creation.showcaseUrls).toEqual(['/sample.jpg']);
    expect(creation.models).toBe('model-id');
    expect(skillPresentation({ ...base, meta: { kind: 'agent', genres: ['图片'], tags: [] } })).toBe('agent');
    expect(skillPresentation({ ...base, isBuiltin: true, meta: { genres: ['图片'], tags: [] } })).toBe('agent');
  });

  it('retains workshop reference previews and tolerates legacy invalid JSON', () => {
    const content = { id: 'workshop', name: '换品', category: 'product', promptSnippet: '规则', sampleImages: '["/one.jpg", null, "/two.jpg"]' };
    expect(librarySkillItem({ kind: 'workshop', content }).showcaseUrls).toEqual(['/one.jpg', '/two.jpg']);
    expect(librarySkillItem({ kind: 'workshop', content: { ...content, sampleImages: 'invalid' } }).showcaseUrls).toEqual([]);
  });

  it('exposes all encapsulated builtin Agent skills grouped into Codex categories', () => {
    expect(BUILTIN_ASSISTANT_SKILLS.length).toBe(15);
    const ids = BUILTIN_ASSISTANT_SKILLS.map((skill) => skill.id);
    const community = BUILTIN_ASSISTANT_SKILLS.find(skill => skill.source?.kind === 'community')!;
    expect(librarySkillItem({ kind: 'assistant', content: community })).toMatchObject({ isBuiltin: true, isOfficial: false });
    expect(ids).toEqual(expect.arrayContaining(['wan3-pe','sd2-pe','sd25-pe','h3-prompt-writing']));
    const grouped = groupAssistantSkillsByCategory(BUILTIN_ASSISTANT_SKILLS);
    expect(grouped.map(group=>group.category)).toEqual(expect.arrayContaining(['官方视频提示词','社区视频提示词']));
    expect(grouped.length).toBe(6);
    expect(grouped.reduce((sum, section) => sum + section.skills.length, 0)).toBe(BUILTIN_ASSISTANT_SKILLS.length);
  });
});

describe('bundled skill examples', () => {
  it.each(Object.keys(BUILTIN_SKILL_PREVIEWS))('connects %s to a durable result and a complete reusable input', id => {
    const skill = BUILTIN_ASSISTANT_SKILLS.find(skill => skill.id === id)!;
    const item = librarySkillItem({ kind: 'assistant', content: skill });
    const preview = BUILTIN_SKILL_PREVIEWS[id];
    expect(item.coverUrl).toBe(preview.cover);
    expect(item.example?.prompt.length).toBeGreaterThan(30);
    expect(item.example?.referenceImages.length).toBeGreaterThan(0);
    for (const url of [preview.cover, ...preview.example.referenceImages]) {
      expect(url).not.toMatch(/^(?:https?:|blob:)|\/tmp\//);
    }
    if (preview.cover.endsWith('.mp4')) expect(item.coverPosterUrl).toMatch(/\.jpg$/);
    expect(librarySkillItem({ kind: 'assistant', content: { ...skill, isBuiltin: false } }).example).toBeUndefined();
  });
});

const items: SkillItem[] = [
  { id: 'assistant:official', title: '历史脚本', description: '金榜题名', models: '', category: '一镜到底', presentation: 'creation', runtime: 'assistant', isOfficial: true, genres: ['视频'], tags: ['第一人称'] },
  { id: 'assistant:custom', title: '人物脚本', description: '连贯动作', models: 'Model-Video', category: '一镜到底', presentation: 'creation', runtime: 'assistant', author: '作者', tags: ['POV'] },
  { id: 'workshop:custom', title: '母本换品', description: '换品', models: '', category: '商品摄影', presentation: 'creation', runtime: 'workshop' },
  { id: 'assistant:agent', title: '词包审核', description: '逐行判断', models: '', category: '数据审核', presentation: 'agent', runtime: 'assistant', isOfficial: true },
];
const filters: SkillFilters = { presentation: 'creation', runtime: 'all', scope: 'all', category: '全部', query: '' };
const favorites = new Set(['assistant:official', 'assistant:agent']);
const ids = (overrides: Partial<SkillFilters>) => filterSkills(items, { ...filters, ...overrides }, favorites).map(item => item.id);

describe('skill library navigation', () => {
  it('uses one category level while keeping all tags searchable', () => {
    expect(skillCategories([
      { ...items[0], category: '自建分类', tags: ['营销广告', '专业影视', '营销广告', '', '全部'] },
      { ...items[1], category: '专业影视', tags: ['POV'] },
    ])).toEqual(['全部', '专业影视', '自建分类']);
    expect(skillCategories([])).toEqual(['全部']);
    expect(skillCategories([{ ...items[3], tags: ['社区原版'] }])).toEqual(['全部', '数据审核']);
    expect(ids({ category: 'POV' })).toEqual(['assistant:custom']);
  });
  it('keeps owned, favorite and runtime scopes independent of presentation', () => {
    expect(ids({ scope: 'my' })).toEqual(['assistant:custom', 'workshop:custom']);
    expect(ids({ scope: 'favorite' })).toEqual(['assistant:official']);
    expect(ids({ presentation: 'agent', scope: 'favorite' })).toEqual(['assistant:agent']);
    expect(ids({ runtime: 'workshop' })).toEqual(['workshop:custom']);
  });
  it('does not classify bundled community packages as user-created skills', () => {
    const community = { ...items[3], id: 'assistant:community', isOfficial: false, isBuiltin: true };
    expect(filterSkills([community], { ...filters, presentation: 'agent', scope: 'my' }, new Set())).toEqual([]);
    expect(filterSkills([community], { ...filters, presentation: 'agent' }, new Set())).toEqual([community]);
    expect(filterSkills([community], { ...filters, presentation: 'agent', scope: 'favorite' }, new Set([community.id]))).toEqual([community]);
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

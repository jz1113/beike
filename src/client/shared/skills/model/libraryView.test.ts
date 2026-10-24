import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSISTANT_SKILLS, groupAssistantSkillsByCategory } from '@shared/domain/assistant/skills';
import { librarySkillItem, skillPresentation } from './libraryView';

describe('unified skill library', () => {
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
    expect(BUILTIN_ASSISTANT_SKILLS.length).toBeGreaterThanOrEqual(13);
    const ids = BUILTIN_ASSISTANT_SKILLS.map((skill) => skill.id);
    expect(ids).toContain('prompt-reverse-engineer');
    expect(ids).toContain('fashion-video-sales');
    expect(ids).toContain('headline-poster-generator');
    expect(ids).toContain('video-teardown');
    expect(ids).toContain('product-social-collector');
    expect(ids).toContain('keyword-review-workflow');
    const grouped = groupAssistantSkillsByCategory(BUILTIN_ASSISTANT_SKILLS);
    expect(grouped.length).toBeGreaterThanOrEqual(4);
    expect(grouped.reduce((sum, section) => sum + section.skills.length, 0)).toBe(BUILTIN_ASSISTANT_SKILLS.length);
  });
});

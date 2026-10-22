import { describe, expect, it } from 'vitest';
import { librarySkillItem } from './libraryView';

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
});

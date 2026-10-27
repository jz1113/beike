import { describe, expect, it } from 'vitest';
import { COVER_SKILLS, coverSkillMemoryStatus } from './coverSkills';

describe('cover skills', () => {
  it('keeps generation and reverse rules readable', () => {
    expect(COVER_SKILLS.map((skill) => skill.id)).toEqual(['generate', 'deconstruct']);
    expect(COVER_SKILLS.map((skill) => skill.title)).toEqual(['封面', '样张反推']);
    expect(COVER_SKILLS.map((skill) => skill.flow)).toEqual([
      ['商品图', '标题', '封面'],
      ['参考封面', '待确认记忆', '采纳后可引用'],
    ]);
    for (const skill of COVER_SKILLS) {
      expect(skill.summary.length).toBeGreaterThan(0);
      expect(skill.summary.length).toBeLessThanOrEqual(40);
      expect(skill.appliesWhen.length).toBeGreaterThan(0);
      expect(skill.input.length).toBeGreaterThan(0);
      expect(skill.output.length).toBeGreaterThan(0);
    }
    const text = COVER_SKILLS.flatMap((skill) => [
      skill.title,
      skill.summary,
      skill.output,
      ...skill.sections.flatMap((section) => [section.heading, ...section.body]),
    ]).join('\n');
    expect(text).toContain('纠正优先');
    expect(text).toContain('待确认');
    expect(text).toContain('硬约束');
    expect(text).toContain('1 到 10 张');
    expect(text).not.toContain('只支持 3:4');
    expect(coverSkillMemoryStatus(0, 0)).toEqual({
      summary: '已采纳 0 条 · 待确认 0 条',
      note: '待确认不会参与生成。采纳与纠正自动保存经验版本；生成引用全局纠正和一张样张，反馈帮助选样。',
    });
    expect(coverSkillMemoryStatus(3, 2).summary).toBe('已采纳 3 条 · 待确认 2 条');
    expect(coverSkillMemoryStatus(3, 2).note).not.toMatch(/都会进入|全部已采纳/);
  });
});
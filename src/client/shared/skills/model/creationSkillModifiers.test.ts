import { describe, expect, it } from 'vitest';
import { BUILTIN_CREATION_SKILLS } from '@shared/domain/assistant/skills/builtinCreationSkills';
import {
  applyCreationSkillOverridesToPrompt,
  resolveCreationSkillModifiableSummary,
} from './creationSkillModifiers';

describe('creationSkillModifiers', () => {
  it('resolves first-person scholar modifiable slots and Image 4 upload guide', () => {
    const skill = BUILTIN_CREATION_SKILLS[0];
    const summary = resolveCreationSkillModifiableSummary(skill);
    expect(summary.uploadSlotLabel).toBe('改状元姓名给强指令');
    expect(summary.slots.map((s) => s.id)).toContain('protagonistName');
    const nameSlot = summary.slots.find((s) => s.id === 'protagonistName')!;
    expect(nameSlot.defaultValue).toBe('丁显');
    expect(nameSlot.buildInstruction('苏轼')).toContain('将脚本中所有主角状元姓名“丁显”全部替换为“苏轼”');
  });

  it('injects and updates strong override instructions without losing user notes', () => {
    const skill = BUILTIN_CREATION_SKILLS[0];
    const summary = resolveCreationSkillModifiableSummary(skill);
    const next = applyCreationSkillOverridesToPrompt(
      '#[skill:第一人称金榜题名（无配乐）] 画面增加晨雾感',
      '第一人称金榜题名（无配乐）',
      { protagonistName: '林殊' },
      summary.slots,
    );
    expect(next).toContain('#[skill:第一人称金榜题名（无配乐）]');
    expect(next).toContain('【强指令·修改状元姓名】');
    expect(next).toContain('林殊');
    expect(next).toContain('画面增加晨雾感');

    const reverted = applyCreationSkillOverridesToPrompt(
      next,
      '第一人称金榜题名（无配乐）',
      { protagonistName: '丁显' },
      summary.slots,
    );
    expect(reverted).not.toContain('【强指令·修改状元姓名】');
    expect(reverted).toContain('画面增加晨雾感');
  });
});

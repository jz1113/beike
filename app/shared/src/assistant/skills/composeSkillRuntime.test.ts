import { describe, expect, it } from 'vitest';
import { composeSkillRuntime } from './composeSkillRuntime';
import { BUILTIN_ASSISTANT_SKILLS, PROMPT_REVERSE_ENGINEER_SKILL_ID } from './builtin';

describe('composeSkillRuntime', () => {
  it('returns null for empty skill', () => {
    expect(composeSkillRuntime(null)).toBeNull();
    expect(composeSkillRuntime(undefined)).toBeNull();
  });

  it('assembles builtin reverse-engineer skill with references and tools', () => {
    const skill = BUILTIN_ASSISTANT_SKILLS.find((s) => s.id === PROMPT_REVERSE_ENGINEER_SKILL_ID)!;
    const runtime = composeSkillRuntime(skill);

    expect(runtime).not.toBeNull();
    expect(runtime!.skillId).toBe(PROMPT_REVERSE_ENGINEER_SKILL_ID);
    expect(runtime!.allowedTools).toEqual([
      'deconstruct_image',
      'query_asset_library',
      'get_prompt_asset_detail',
    ]);
    expect(runtime!.systemPrompt).toContain('【当前激活技能：提示词反推专家】');
    expect(runtime!.systemPrompt).toContain('多模态视觉大反推提示词工程规范');
    expect(runtime!.systemPrompt).toContain(skill.prompt.trim());
  });

  it('omits allowedTools when skill has no tools declared', () => {
    const runtime = composeSkillRuntime({
      id: 'custom',
      name: '自定义',
      description: '测试',
      prompt: '做某事',
    });
    expect(runtime!.allowedTools).toBeUndefined();
  });
});

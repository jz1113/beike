import { describe, expect, it } from 'vitest';
import { composeSkillRuntime } from './composeSkillRuntime';
import type { AssistantSkill } from './types';

function skill(partial: Partial<AssistantSkill> = {}): AssistantSkill {
  return {
    id: 'demo',
    name: '演示技能',
    description: '说明',
    prompt: '主指令',
    ...partial,
  };
}

describe('composeSkillRuntime', () => {
  it('appends supporting files after the main instructions', () => {
    const runtime = composeSkillRuntime(skill({
      files: [
        { path: 'examples.md', content: '样例正文' },
        { path: 'blank.md', content: '   ' },
      ],
      tools: ['query_asset_library'],
    }));
    expect(runtime?.systemPrompt.indexOf('主指令')).toBeLessThan(runtime?.systemPrompt.indexOf('## 附属文件：examples.md') ?? -1);
    expect(runtime?.systemPrompt).toContain('样例正文');
    expect(runtime?.systemPrompt).not.toContain('blank.md');
    expect(runtime?.allowedTools).toEqual(['query_asset_library']);
  });

  it('caps the injected skill text', () => {
    const runtime = composeSkillRuntime(skill({
      files: [{ path: 'big.md', content: '长'.repeat(30_000) }],
    }));
    expect(runtime?.systemPrompt.endsWith('…（技能内容已截断）')).toBe(true);
    expect(runtime?.systemPrompt.length).toBeLessThan(24_000 + 40);
  });
});

import { describe, expect, it } from 'vitest';
import { composeSkillRuntime } from './composeSkillRuntime';
import { composeSkillCatalog, SKILL_CATALOG_ENTRY_LIMIT, SKILL_CATALOG_PAYLOAD_LIMIT } from './skillCatalog';
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
  it('keeps long main instructions readable instead of clipping the final rule', () => {
    const prompt = '正文'.repeat(6000) + '\n最后必须检查交付';
    const input = skill({ prompt, tools: ['query_asset_library'] });
    const runtime = composeSkillRuntime(input)!;
    expect(runtime.systemPrompt.length).toBeLessThanOrEqual(12_000);
    expect(runtime.resources.find(file => file.path === 'SKILL.md')?.content).toBe(prompt);
    expect(runtime.allowedTools).toContain('read_skill_file');
    const entry = composeSkillCatalog([input])[0];
    expect(entry.resources?.find(file => file.path === 'SKILL.md')?.content).toBe(prompt);
    expect(entry.prompt).toContain('nextOffset');
  });

  it('lists supporting files and keeps their bodies out of the prompt', () => {
    const runtime = composeSkillRuntime(skill({
      files: [
        { path: 'examples.md', content: '样例正文' },
        { path: 'blank.md', content: '   ' },
      ],
      tools: ['query_asset_library'],
    }));
    expect(runtime?.systemPrompt).toContain('主指令');
    expect(runtime?.systemPrompt).toContain('examples.md');
    expect(runtime?.systemPrompt).toContain('read_skill_file');
    expect(runtime?.systemPrompt).not.toContain('样例正文');
    expect(runtime?.systemPrompt).not.toContain('blank.md');
    expect(runtime?.resources).toEqual([{ path: 'examples.md', content: '样例正文' }]);
    expect(runtime?.allowedTools).toEqual(['query_asset_library', 'read_skill_file']);
  });

  it('keeps a large attachment available without inflating the prompt', () => {
    const body = '长'.repeat(50_000);
    const runtime = composeSkillRuntime(skill({
      files: [{ path: 'big.md', content: body }],
    }));
    expect(runtime?.systemPrompt).toContain('big.md');
    expect(runtime?.systemPrompt).not.toContain(body);
    expect(runtime?.systemPrompt.length).toBeLessThan(2_000);
    expect(runtime?.resources[0]?.content.startsWith('长长长')).toBe(true);
    expect(runtime?.resources[0]?.content.endsWith('…（文件剩余部分未随技能包发送）')).toBe(true);
  });
});

describe('composeSkillCatalog', () => {
  it('keeps bodies inside the payload budget and leaves later skills as names', () => {
    const body = '长'.repeat(40_000);
    const skills = [1, 2, 3, 4].map((index) => skill({
      id: `s${index}`,
      name: `技能${index}`,
      description: index === 4 ? '后续用途' : '用途',
      prompt: '指令',
      files: [{ path: 'a.md', content: body }],
      tools: ['query_asset_library'],
    }));
    const catalog = composeSkillCatalog(skills);
    expect(catalog).toHaveLength(4);
    expect(catalog[0]?.prompt).toBe('指令');
    expect(catalog[0]?.resources?.[0]?.content.startsWith('长长长')).toBe(true);
    expect(catalog[3]?.prompt).toBeUndefined();
    expect(catalog[3]?.resources).toBeUndefined();
    expect(catalog[3]?.description).toBe('后续用途');
    const carried = catalog.reduce((total, entry) => total + (entry.prompt?.length || 0) + (entry.resources || []).reduce((sum, file) => sum + file.content.length, 0), 0);
    expect(carried).toBeLessThanOrEqual(SKILL_CATALOG_PAYLOAD_LIMIT);
  });

  it('stops after the entry limit', () => {
    const skills = Array.from({ length: SKILL_CATALOG_ENTRY_LIMIT + 4 }, (_, index) => skill({
      id: `id-${index}`,
      name: `技能${index}`,
      description: '用途',
      prompt: '短指令',
    }));
    expect(composeSkillCatalog(skills)).toHaveLength(SKILL_CATALOG_ENTRY_LIMIT);
  });
});

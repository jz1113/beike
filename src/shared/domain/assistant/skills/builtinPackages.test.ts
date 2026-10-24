import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSISTANT_SKILLS } from './builtin';
import { parseSkillFileContent } from './parseSkillFile';
import { composeSkillCatalog } from './skillCatalog';
import { resolveSkillKind } from './skillPurpose';
import { OPENAI_TOOLS } from '../tools/defs';

describe('maintained builtin packages', () => {
  const skills = BUILTIN_ASSISTANT_SKILLS.filter(skill => resolveSkillKind(skill) === 'agent');
  it('uses the same full instructions in the reader and runtime, with real tools', () => {
    expect(skills).toHaveLength(13);
    const toolNames = new Set(OPENAI_TOOLS.map(tool => tool.function.name));
    for (const skill of skills) {
      expect(parseSkillFileContent(skill.markdownDoc!, 'SKILL.md').skill.prompt, skill.id).toBe(skill.prompt);
      expect(skill.tools?.every(tool => toolNames.has(tool)), skill.id).toBe(true);
      expect(skill.files?.some(file => file.path.startsWith('references/') || file.path.startsWith('assets/')), skill.id).toBe(true);
    }
  });
  it('carries every builtin body and resource within the actual discovery budget', () => {
    const catalog = composeSkillCatalog(BUILTIN_ASSISTANT_SKILLS);
    expect(catalog).toHaveLength(skills.length);
    for (const skill of skills) {
      const entry = catalog.find(item => item.id === skill.id)!;
      expect(entry.prompt, skill.id).toBe(skill.prompt);
      for (const file of skill.files || []) {
        expect(entry.resources?.find(resource => resource.path === file.path)?.content, `${skill.id}/${file.path}`).toBe(file.content.trim());
      }
    }
  });
});

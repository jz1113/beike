import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENT_RUNTIME_SKILLS, BUILTIN_ASSISTANT_SKILLS } from './builtin';
import { resolveSkillKind } from './skillPurpose';
import { composeSkillCatalog } from './skillCatalog';
import { composeSkillRuntime } from './composeSkillRuntime';
import { parseSkillFileContent } from './parseSkillFile';
import type { AssistantSkill } from './types';

const base: AssistantSkill = { id: 'user', name: '视频技能', prompt: '完整正文', description: '任务描述' };

describe('runtime skills and creation templates', () => {
  it('explicitly separates all builtin runtime instructions from the concrete creation example', () => {
    expect(BUILTIN_AGENT_RUNTIME_SKILLS).toHaveLength(13);
    expect(BUILTIN_AGENT_RUNTIME_SKILLS.every(skill => skill.meta?.kind === 'agent')).toBe(true);
    expect(BUILTIN_ASSISTANT_SKILLS.filter(skill => resolveSkillKind(skill) === 'creation').map(skill => skill.id)).toEqual(['creation-first-person-scholar']);
    expect(composeSkillCatalog(BUILTIN_ASSISTANT_SKILLS).map(skill => skill.id)).toEqual(BUILTIN_AGENT_RUNTIME_SKILLS.map(skill => skill.id));
  });
  it('does not discover templates automatically, but preserves explicit use and supporting files', () => {
    const creation: AssistantSkill = { ...base, meta: { kind: 'creation', genres: ['视频'], tags: [] }, files: [{ path: 'shots.md', content: '分镜正文' }] };
    expect(composeSkillCatalog([creation, { ...base, id: 'runtime' }]).map(skill => skill.id)).toEqual(['runtime']);
    const runtime = composeSkillRuntime(creation);
    expect(runtime?.systemPrompt).toContain('本次选用的创作模板');
    expect(runtime?.systemPrompt).toContain('完整正文');
    expect(runtime?.resources).toEqual([{ path: 'shots.md', content: '分镜正文' }]);
  });
  it('does not let creation packages consume automatic runtime catalog slots', () => {
    const creations = Array.from({ length: 20 }, (_, index) => ({ ...base, id: `creation-${index}`, meta: { kind: 'creation' as const, genres: [], tags: [] } }));
    expect(composeSkillCatalog([...creations, base]).map(skill => skill.id)).toEqual(['user']);
  });
  it('treats explicit purpose independently of source, media labels and tool declarations', () => {
    expect(resolveSkillKind({ ...base, meta: { kind: 'agent', genres: ['视频'], tags: [] } })).toBe('agent');
    expect(resolveSkillKind({ ...base, isBuiltin: true, meta: { kind: 'creation', genres: [], tags: [] } })).toBe('creation');
    expect(resolveSkillKind({ ...base, tools: ['inspect_video_media'], meta: { genres: ['视频'], tags: [] } })).toBe('agent');
  });
  it('preserves declared purpose when importing Markdown or JSON', () => {
    for (const kind of ['agent', 'creation'] as const) {
      const markdown = `---\nname: 技能\ndescription: 说明\nkind: ${kind}\n---\n中文正文`;
      expect(parseSkillFileContent(markdown, 'SKILL.md').skill.meta?.kind).toBe(kind);
      expect(parseSkillFileContent(JSON.stringify({ ...base, meta: { kind, genres: [], tags: [] } }), 'skill.json').skill.meta?.kind).toBe(kind);
    }
  });
});

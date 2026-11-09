import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENT_RUNTIME_SKILLS, BUILTIN_ASSISTANT_SKILLS, resolveSkillAllowedTools } from './builtin';
import { collectSkillResources, composeSkillRuntime, skillRuntimeInstructions } from './composeSkillRuntime';
import { composeSkillCatalog, SKILL_CATALOG_ENTRY_LIMIT, SKILL_CATALOG_PAYLOAD_LIMIT } from './index';
import { parseSkillFileContent } from './parseSkillFile';
import { resolveSkillKind, type AssistantSkill } from './types';
import { shouldAnalyzeVideoDirectly } from '../mediaAnalysis';
import { OPENAI_TOOLS } from '../tools/defs';

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
  it('maps host tools without changing the upstream declarations or allowing unmapped tools', () => {
    const originalTools = ['platform_create_image'];
    const input = skill({ tools: originalTools, runtimeTools: ['trigger_generate'], files: [{ path: 'guide.md', content: '资料' }] });
    const runtime = composeSkillRuntime(input)!;
    expect(runtime.allowedTools).toEqual(['trigger_generate', 'read_skill_file']);
    expect(runtime.allowedTools).not.toContain('platform_create_image');
    expect(input.tools).toEqual(originalTools);
    expect(input.runtimeTools).toEqual(['trigger_generate']);
    expect(composeSkillRuntime(skill({ tools: ['query_asset_library'] }))?.allowedTools).toEqual(['query_asset_library']);
    expect(composeSkillRuntime(skill())?.allowedTools).toBeUndefined();
    expect(composeSkillRuntime(skill({ tools: ['trigger_generate'], runtimeTools: [] }))?.allowedTools).toEqual([]);
  });

  it('keeps host adaptation separate from original text and injects it only when selected', () => {
    const input = skill({ prompt: '原始技能指令', runtimeInstructions: '最终交付采用 image-prompt 代码块', meta: { kind: 'creation', genres: ['图片'], tags: [] } });
    const runtime = composeSkillRuntime(input)!;
    expect(runtime.systemPrompt).toContain('原始技能指令');
    expect(runtime.systemPrompt).toContain('【宿主执行适配】\n最终交付采用 image-prompt 代码块');
    expect(input.prompt).toBe('原始技能指令');
    expect(composeSkillCatalog([input])).toEqual([]);
  });

  it('preserves a 4000-character host adaptation when the full main text falls back to resources', () => {
    const adapter = '适'.repeat(4000);
    const input = skill({ prompt: '原'.repeat(9000), description: '说'.repeat(4000), runtimeInstructions: adapter });
    const runtime = composeSkillRuntime(input)!;
    expect(runtime.systemPrompt).toContain('【宿主执行适配】\n' + adapter);
    expect(runtime.systemPrompt.length).toBeLessThanOrEqual(12000);
    expect(runtime.resources.find(file => file.path === 'SKILL.md')?.content).toBe(input.prompt);
  });

  it('rejects blank, oversized or malformed host instructions rather than silently clipping adaptation', () => {
    for (const runtimeInstructions of ['', '  ', '长'.repeat(4001), 12 as unknown as string]) {
      expect(() => composeSkillRuntime(skill({ runtimeInstructions }))).toThrow('1–4000');
    }
  });

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

describe('builtin host tool permissions', () => {
  it('intersects client permissions with the explicit host mapping, preserving original declarations', () => {
    const item: AssistantSkill = { id: 'test-platform-tools', name: '测试', description: '测试', prompt: '测试正文', tools: ['upstream_image_tool'], runtimeTools: ['query_asset_library', 'inspect_video_media'] };
    BUILTIN_ASSISTANT_SKILLS.push(item);
    try {
      expect(resolveSkillAllowedTools(item.id)).toEqual(['query_asset_library', 'inspect_video_media']);
      expect(resolveSkillAllowedTools(item.id, ['query_asset_library', 'trigger_generate_batch', 'upstream_image_tool'])).toEqual(['query_asset_library']);
      expect(item.tools).toEqual(['upstream_image_tool']);
    } finally { BUILTIN_ASSISTANT_SKILLS.splice(BUILTIN_ASSISTANT_SKILLS.indexOf(item), 1); }
  });
});

describe('maintained builtin packages', () => {
  const skills = BUILTIN_ASSISTANT_SKILLS.filter(item => resolveSkillKind(item) === 'agent');
  it('uses the same full instructions in the reader and runtime, with real tools', () => {
    expect(skills.map(item => item.id).sort()).toEqual(['ai-video-prompt-writer', 'gemini-omni-flash-api', 'h3-prompt-writing', 'kling-3-prompting', 'scenario-grok-imagine-video', 'scenario-kling', 'scenario-veo', 'scenario-vidu', 'sd2-pe', 'sd25-pe', 'wan3-pe']);
    const toolNames = new Set(OPENAI_TOOLS.map(tool => tool.function.name));
    for (const item of skills) {
      expect(parseSkillFileContent(item.markdownDoc!, 'SKILL.md').skill.prompt, item.id).toBe(item.prompt);
      expect(item.tools?.every(tool => toolNames.has(tool)), item.id).toBe(true);
      expect(item.source?.url, item.id).toMatch(/^https:\/\//);
      expect(item.source?.files['SKILL.md'], item.id).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it('keeps every builtin discoverable by revision and every individual package readable without raising budgets', () => {
    const catalog = composeSkillCatalog(BUILTIN_ASSISTANT_SKILLS);
    expect(catalog).toHaveLength(skills.length);
    for (const item of skills) {
      const entry = catalog.find(row => row.id === item.id)!;
      expect(entry.builtinRevision, item.id).toBe(item.source?.revision);
      expect(entry.prompt, item.id).toBeUndefined();
      expect(entry.resources, item.id).toBeUndefined();
      expect(skillRuntimeInstructions(item).length, item.id).toBeLessThanOrEqual(12000);
      const resources = collectSkillResources(item);
      for (const file of item.files || []) {
        expect(resources.find(resource => resource.path === file.path)?.content, `${item.id}/${file.path}`).toBe(file.content.trim());
      }
    }
  });
});

const creations = BUILTIN_ASSISTANT_SKILLS.filter(item => item.meta?.kind === 'creation');
describe('Beike creation workflow integration', () => {
  it('retains creation purpose across export/import without consuming discovery slots', () => {
    expect(creations).toHaveLength(4);
    const discovery = composeSkillCatalog(BUILTIN_ASSISTANT_SKILLS);
    for (const item of creations) {
      expect(parseSkillFileContent(item.markdownDoc!, 'SKILL.md').skill.meta?.kind).toBe('creation');
      expect(discovery.some(entry => entry.id === item.id)).toBe(false);
      expect(item.source?.kind).toBe('local');
      const runtime = composeSkillRuntime(item)!;
      expect(runtime.systemPrompt).toContain(item.prompt);
      expect(runtime.systemPrompt.length).toBeLessThanOrEqual(12000);
      expect(runtime.allowedTools?.every(name => OPENAI_TOOLS.some(tool => tool.function.name === name))).toBe(true);
      expect(runtime.allowedTools).not.toContain('trigger_generate_batch');
    }
  });
  it('keeps video extraction tools enabled when the user explicitly selects the extraction workflow', () => {
    const item = creations.find(row => row.id === 'beike-prompt-extraction')!;
    const messages = [{ role: 'user', content: '提取这个视频的提示词', attachments: [{ type: 'video' }] }];
    expect(shouldAnalyzeVideoDirectly(messages, item.id)).toBe(false);
    expect(composeSkillRuntime(item)?.allowedTools).toEqual(expect.arrayContaining(['inspect_video_media', 'extract_video_storyboard', 'extract_video_detailed_frames']));
  });
});

const baseSkill: AssistantSkill = { id: 'user', name: '视频技能', prompt: '完整正文', description: '任务描述' };

describe('runtime skills and creation templates', () => {
  it('keeps explicit creation workflows out of automatic runtime discovery', () => {
    expect(BUILTIN_AGENT_RUNTIME_SKILLS).toHaveLength(11);
    expect(BUILTIN_AGENT_RUNTIME_SKILLS.every(item => item.meta?.kind === 'agent')).toBe(true);
    expect(BUILTIN_ASSISTANT_SKILLS.filter(item => resolveSkillKind(item) === 'creation')).toHaveLength(4);
    expect(composeSkillCatalog(BUILTIN_ASSISTANT_SKILLS).map(item => item.id)).toEqual(BUILTIN_AGENT_RUNTIME_SKILLS.map(item => item.id));
  });
  it('does not discover templates automatically, but preserves explicit use and supporting files', () => {
    const creation: AssistantSkill = { ...baseSkill, meta: { kind: 'creation', genres: ['视频'], tags: [] }, files: [{ path: 'shots.md', content: '分镜正文' }] };
    expect(composeSkillCatalog([creation, { ...baseSkill, id: 'runtime' }]).map(item => item.id)).toEqual(['runtime']);
    const runtime = composeSkillRuntime(creation);
    expect(runtime?.systemPrompt).toContain('本次选用的创作模板');
    expect(runtime?.systemPrompt).toContain('完整正文');
    expect(runtime?.resources).toEqual([{ path: 'shots.md', content: '分镜正文' }]);
  });
  it('does not let creation packages consume automatic runtime catalog slots', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...baseSkill, id: `creation-${index}`, meta: { kind: 'creation' as const, genres: [], tags: [] } }));
    expect(composeSkillCatalog([...items, baseSkill]).map(item => item.id)).toEqual(['user']);
  });
  it('treats explicit purpose independently of source, media labels and tool declarations', () => {
    expect(resolveSkillKind({ ...baseSkill, meta: { kind: 'agent', genres: ['视频'], tags: [] } })).toBe('agent');
    expect(resolveSkillKind({ ...baseSkill, isBuiltin: true, meta: { kind: 'creation', genres: [], tags: [] } })).toBe('creation');
    expect(resolveSkillKind({ ...baseSkill, tools: ['inspect_video_media'], meta: { genres: ['视频'], tags: [] } })).toBe('agent');
  });
  it('preserves declared purpose when importing Markdown or JSON', () => {
    for (const kind of ['agent', 'creation'] as const) {
      const markdown = `---\nname: 技能\ndescription: 说明\nkind: ${kind}\n---\n中文正文`;
      expect(parseSkillFileContent(markdown, 'SKILL.md').skill.meta?.kind).toBe(kind);
      expect(parseSkillFileContent(JSON.stringify({ ...baseSkill, meta: { kind, genres: [], tags: [] } }), 'skill.json').skill.meta?.kind).toBe(kind);
    }
  });
});

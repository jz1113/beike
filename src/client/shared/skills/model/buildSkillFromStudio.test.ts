import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { BUILTIN_ASSISTANT_SKILLS } from '@shared/domain/assistant/skills/builtin';
import { composeSkillRuntime } from '@shared/domain/assistant/skills/composeSkillRuntime';
import { applySkillFrontmatter, buildSkillFromStudio, studioStateFromSkill } from './buildSkillFromStudio';
import type { SkillStudioPayload } from './buildSkillFromStudio';
import { creationSkillFlow, creationSkillInputIssue, skillActivationPrompt } from './creationSkillFlows';
import { applyCreationSkillOverridesToPrompt, resolveCreationSkillModifiableSummary } from './creationSkillModifiers';
import type { SkillFileNode } from './skillFileTree';
import { normalizeSkillPackagePaths, parseLocalSkillFiles } from './skillPackageParser';

const skillFile: SkillFileNode = {
  id: 'skill-root-md',
  name: 'SKILL.md',
  type: 'file',
  content: `---
name: old-name
description: old desc
tools: query_asset_library
---

# 正文
请按结构输出`,
};

const payload: SkillStudioPayload = {
  title: '电商封面',
  description: '一句话介绍: 封面',
  genres: ['图片'],
  tags: ['营销广告'],
  defaultVideoModel: '',
  defaultImageModel: 'seedream',
  coverUrl: 'data:image/jpeg;base64,abc',
  showcaseUrls: [],
  promptGuide: '写清主体',
  assetGuide: '上传产品图',
  isPublic: false,
  files: [
    skillFile,
    { id: 'examples', name: 'examples.md', type: 'file', content: '示例' },
    { id: 'empty', name: 'empty.md', type: 'file', content: '   ' },
  ],
};

describe('buildSkillFromStudio', () => {
  it('keeps user frontmatter and writes the form name and description over it', () => {
    const { markdownDoc, body } = applySkillFrontmatter(skillFile.content || '', '电商封面', '一句话介绍: 封面');
    expect(body).toBe('# 正文\n请按结构输出');
    expect(markdownDoc).toContain('name: 电商封面');
    expect(markdownDoc).toContain('tools: query_asset_library');
    expect(markdownDoc).toContain('description: "一句话介绍: 封面"');
    expect(markdownDoc).not.toContain('old-name');
  });

  it('stores the instruction body, supporting files and studio meta', () => {
    const skill = buildSkillFromStudio(payload, { id: 'keep-me', createdAt: 10 });
    expect(skill.id).toBe('keep-me');
    expect(skill.createdAt).toBe(10);
    expect(skill.displayName).toBe('电商封面');
    expect(skill.prompt).toBe('# 正文\n请按结构输出');
    expect(skill.markdownDoc?.startsWith('---\n')).toBe(true);
    expect(skill.files).toEqual([{ path: 'examples.md', content: '示例' }]);
    expect(skill.meta).toMatchObject({
      genres: ['图片'],
      tags: ['营销广告'],
      coverUrl: 'data:image/jpeg;base64,abc',
      defaultImageModel: 'seedream',
      isPublic: false,
    });
    expect(skill.tools).toEqual(['query_asset_library']);
  });

  it('preserves an explicit Agent type through save and edit', () => {
    const skill = buildSkillFromStudio({ ...payload, kind: 'agent' });
    expect(skill.meta?.kind).toBe('agent');
    expect(skill.markdownDoc).toContain('kind: agent');
    expect(studioStateFromSkill(skill).draft.kind).toBe('agent');
  });

  it('round-trips a saved skill back into the studio', () => {
    const skill = buildSkillFromStudio(payload, { id: 'keep-me' });
    const state = studioStateFromSkill(skill);
    expect(state.files.find((file) => file.name === 'SKILL.md')?.content).toContain('# 正文');
    expect(state.files.find((file) => file.name === 'examples.md')?.content).toBe('示例');
    expect(state.draft.title).toBe('电商封面');
    expect(state.draft.tags).toEqual(['营销广告']);
    expect(state.draft.coverUrl).toBe('data:image/jpeg;base64,abc');
  });
});

const skills = BUILTIN_ASSISTANT_SKILLS.filter(skill => skill.meta?.kind === 'creation');
describe('creation skill activation flows', () => {
  it.each(skills)('$id opens with an editable brief and its own instructions, without fake template replacement fields', skill => {
    const flow = creationSkillFlow(skill.id)!;
    const prompt = skillActivationPrompt(skill.id, skill.displayName!, '');
    expect(prompt).toContain(flow.starter);
    expect(prompt).toContain(`#[skill:${skill.displayName}]`);
    expect(resolveCreationSkillModifiableSummary(skill).slots).toEqual([]);
    expect(composeSkillRuntime(skill)?.systemPrompt).toContain(skill.prompt);
    expect(creationSkillInputIssue(skill.id, prompt, false)).toBeTruthy();
    expect(creationSkillInputIssue(skill.id, prompt, true)).toBeUndefined();
    expect(JSON.stringify(skill)).not.toMatch(/独立实现|不是.{0,8}原始技能包|下载包受权限/);
  });
  it('replaces an old generated starter when switching, but preserves authored notes', () => {
    const old = skillActivationPrompt(skills[0].id, skills[0].displayName!, '');
    const next = skillActivationPrompt(skills[1].id, skills[1].displayName!, old);
    expect(next).toContain(creationSkillFlow(skills[1].id)!.starter);
    expect(next).not.toContain(creationSkillFlow(skills[0].id)!.starter);
    expect(skillActivationPrompt(skills[1].id, skills[1].displayName!, '#[skill:旧技能] 保留我写的雨夜故事')).toContain('保留我写的雨夜故事');
  });
  it('requires media for extraction and accepts text-only briefs for the other three', () => {
    for (const skill of skills) {
      const issue = creationSkillInputIssue(skill.id, '原创角色或商品的详细描述', false);
      expect(Boolean(issue)).toBe(skill.id === 'beike-prompt-extraction');
    }
    expect(creationSkillInputIssue('custom-skill', '', false)).toBeUndefined();
  });
  it('uses the chosen example exactly once and never stacks old skill tokens', () => {
    const id = 'beike-character-three-view';
    const example = creationSkillFlow(id)!.example;
    const prompt = skillActivationPrompt(id, '人物三视图', '#[skill:电影分镜] 旧草稿', `#[skill:人物三视图] ${example}`);
    expect(prompt.match(/#\[skill:/g)).toHaveLength(1);
    expect(prompt).toContain(example);
    expect(prompt).not.toContain('旧草稿');
  });
});

describe('creationSkillModifiers', () => {
  const scholarSkill = { id: 'custom-scholar', name: '第一人称金榜题名', description: '主角姓名（默认：丁显）', prompt: '丁显成为状元' };
  it('resolves first-person scholar modifiable slots and Image 4 upload guide', () => {
    const summary = resolveCreationSkillModifiableSummary(scholarSkill);
    expect(summary.uploadSlotLabel).toBe('改状元姓名给强指令');
    expect(summary.slots.map((s) => s.id)).toContain('protagonistName');
    const nameSlot = summary.slots.find((s) => s.id === 'protagonistName')!;
    expect(nameSlot.defaultValue).toBe('丁显');
    expect(nameSlot.buildInstruction('苏轼')).toContain('将脚本中所有主角状元姓名“丁显”全部替换为“苏轼”');
  });

  it('injects and updates strong override instructions without losing user notes', () => {
    const summary = resolveCreationSkillModifiableSummary(scholarSkill);
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

function packageMap(entries: Record<string, string>) {
  return new Map(Object.entries(entries));
}

describe('normalizeSkillPackagePaths', () => {
  it('strips a shared zip root and keeps nested paths', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({
      'myskill/SKILL.md': '# 技能',
      'myskill/references/a.md': '参考',
    }));
    expect(Array.from(normalized.keys()).sort()).toEqual(['SKILL.md', 'references/a.md']);
    expect(normalized.get('references/a.md')).toBe('参考');
  });

  it('does not strip a folder when the zip already has files at the root', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({
      'SKILL.md': '# 根技能',
      'references/a.md': '参考',
    }));
    expect(normalized.get('SKILL.md')).toBe('# 根技能');
    expect(normalized.get('references/a.md')).toBe('参考');
  });

  it('uses the folder that contains SKILL.md as the package root', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({
      'notes.txt': '包外',
      'pkg/SKILL.md': '# 包内',
      'pkg/guide.md': '说明',
    }));
    expect(Array.from(normalized.keys()).sort()).toEqual(['SKILL.md', 'guide.md']);
    expect(normalized.has('notes.txt')).toBe(false);
  });

  it('renames a single markdown file to SKILL.md instead of duplicating it', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({ 'foo.md': '# 单独文件' }));
    expect(Array.from(normalized.keys())).toEqual(['SKILL.md']);
    expect(normalized.get('SKILL.md')).toBe('# 单独文件');
  });
});

describe('parseLocalSkillFiles', () => {
  it('reads a zip package and skips binary entries', async () => {
    const zip = new JSZip();
    zip.file('myskill/SKILL.md', '# 从压缩包导入\n\n按这个流程做');
    zip.file('myskill/references/a.md', '参考');
    zip.file('myskill/LICENSE', 'MIT License\nCopyright upstream');
    zip.file('myskill/cover.png', new Uint8Array([1, 2, 3]));
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseLocalSkillFiles([new File([bytes], 'pack.zip')]);
    const names = parsed.files.flatMap((node) => node.type === 'folder' ? [node.name] : [node.name]);
    expect(names).toContain('SKILL.md');
    expect(names).toContain('references');
    expect(parsed.files.find(node => node.name === 'LICENSE')?.content).toBe('MIT License\nCopyright upstream');
    expect(parsed.warnings.some(warning => warning.includes('LICENSE'))).toBe(false);
    expect(parsed.warnings.some((warning) => warning.includes('cover.png'))).toBe(true);
    expect(parsed.draft.title.length).toBeGreaterThan(0);
  });

  it('rejects a text file over 256 KB', async () => {
    const file = new File([new Uint8Array(256 * 1024 + 1)], 'SKILL.md');
    await expect(parseLocalSkillFiles([file])).rejects.toThrow('超过 256 KB');
  });

  it('rejects a package over 1 MB', async () => {
    const files = Array.from({ length: 5 }, (_, index) => new File(
      [new Uint8Array(220 * 1024)],
      index === 0 ? 'SKILL.md' : `note-${index}.md`,
    ));
    await expect(parseLocalSkillFiles(files)).rejects.toThrow('超过 1 MB');
  });
});

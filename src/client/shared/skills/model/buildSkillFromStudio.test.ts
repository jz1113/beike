import { describe, expect, it } from 'vitest';
import { applySkillFrontmatter, buildSkillFromStudio, studioStateFromSkill } from './buildSkillFromStudio';
import type { SkillStudioPayload } from './buildSkillFromStudio';
import type { SkillFileNode } from './skillFileTree';

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

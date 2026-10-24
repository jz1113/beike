import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { BUILTIN_ASSISTANT_SKILLS } from '@shared/domain/assistant/skills/builtin';
import { skillPackageFiles, skillFilePreview } from './skillPackageView';
import { parseLocalSkillFiles } from './skillPackageParser';
import type { SkillFileNode } from './skillFileTree';

function flattenFiles(nodes: SkillFileNode[], prefix = ''): [string, string][] {
  return nodes.flatMap(node => {
    const path = `${prefix}${node.name}`;
    return node.type === 'folder' ? flattenFiles(node.children || [], `${path}/`) : [[path, node.content || '']];
  });
}

describe('skill package reader and portable files', () => {
  it('keeps the canonical main and nested files through ZIP import', async () => {
    const skill = BUILTIN_ASSISTANT_SKILLS.find(item => item.id === 'fashion-video-sales')!;
    const files = skillPackageFiles(skill);
    const zip = new JSZip();
    for (const file of files) zip.file(`${skill.id}/${file.path}`, file.content);
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const imported = await parseLocalSkillFiles([new File([bytes], 'skill.zip')]);
    expect(imported.warnings).toEqual([]);
    const actual = new Map(flattenFiles(imported.files));
    expect(actual).toEqual(new Map(files.map(file => [file.path, file.content])));
  });
  it('renders markdown without frontmatter and leaves source code intact', () => {
    expect(skillFilePreview({ path: 'SKILL.md', content: '---\nname: demo\n---\n# 指南' })).toEqual({ markdown: true, body: '# 指南' });
    expect(skillFilePreview({ path: 'scripts/tool.py', content: '# code\nprint(1)' })).toEqual({ markdown: false, body: '# code\nprint(1)' });
  });
});

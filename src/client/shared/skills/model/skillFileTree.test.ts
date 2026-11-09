import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { BUILTIN_ASSISTANT_SKILLS } from '@shared/domain/assistant/skills/builtin';
import {
  addNodeToTree,
  collectDirtyNodeIds,
  createInitialSkillTree,
  createParentIdForSelection,
  isProtectedSkillFile,
  validateSkillNodeName,
  type SkillFileNode,
} from './skillFileTree';
import {
  skillFilePreview,
  skillPackageFiles,
  skillSourceLabel,
  skillSourceLocation,
} from './buildSkillFromStudio';
import { parseLocalSkillFiles } from './skillPackageParser';

function folder(id: string, children: SkillFileNode[]): SkillFileNode {
  return { id, name: id, type: 'folder', children, isOpen: true };
}

function flattenFiles(nodes: SkillFileNode[], prefix = ''): [string, string][] {
  return nodes.flatMap(node => {
    const path = `${prefix}${node.name}`;
    return node.type === 'folder' ? flattenFiles(node.children || [], `${path}/`) : [[path, node.content || '']];
  });
}

describe('skillFileTree', () => {
  it('starts from an empty SKILL.md', () => {
    const [skill] = createInitialSkillTree();
    expect(skill.name).toBe('SKILL.md');
    expect(skill.content).toBe('');
  });

  it('adds a file inside the selected folder', () => {
    const tree = [createInitialSkillTree()[0], folder('1111', [])];
    const next = addNodeToTree(tree, '1111', {
      id: 'file-1',
      name: '111.md',
      type: 'file',
      content: '',
    });
    expect(next.find((node) => node.id === '1111')?.children?.map((node) => node.name)).toEqual(['111.md']);
  });

  it('creates inside the folder that contains the selected file', () => {
    const tree = [folder('1111', [{ id: 'file-1', name: '111.md', type: 'file', content: '' }])];
    expect(createParentIdForSelection(tree, 'file-1')).toBe('1111');
    expect(createParentIdForSelection(tree, '1111')).toBe('1111');
    expect(createParentIdForSelection(tree, '')).toBeNull();
  });

  it('rejects empty names, slashes and duplicates in the same folder', () => {
    expect(validateSkillNodeName('  ', [])).toBe('名称不能为空');
    expect(validateSkillNodeName('a/b.md', [])).toBe('名称不能包含 /');
    expect(validateSkillNodeName('SKILL.md', ['skill.md'])).toBe('同一目录下已有同名项');
    expect(validateSkillNodeName('notes.md', ['SKILL.md'])).toBeNull();
  });

  it('protects only the root SKILL.md and marks new or edited nodes', () => {
    const tree = createInitialSkillTree();
    expect(isProtectedSkillFile(tree, tree[0].id)).toBe(true);
    const nested = addNodeToTree(tree, null, folder('docs', [
      { id: 'nested', name: 'SKILL.md', type: 'file', content: '' },
    ]));
    expect(isProtectedSkillFile(nested, 'nested')).toBe(false);

    const edited = nested.map((node) => node.id === tree[0].id ? { ...node, content: '已修改' } : node);
    const dirty = collectDirtyNodeIds(edited, tree);
    expect(dirty.has(tree[0].id)).toBe(true);
    expect(dirty.has('docs')).toBe(true);
    expect(dirty.has('nested')).toBe(true);
  });
});

describe('skill package reader and portable files', () => {
  it('labels platform and local sources and locates builtin creation files truthfully', () => {
    const source = { url: 'https://example.com/skill', revision: 'v1', license: '未核验', files: {} };
    expect(skillSourceLabel({ ...source, kind: 'platform' })).toBe('平台来源原版');
    expect(skillSourceLabel({ ...source, kind: 'local', url: '/skills' })).toBe('贝壳内置');
    expect(skillSourceLocation({ id: 'creation', name: '创作', description: '说明', prompt: '正文', isBuiltin: true, meta: { kind: 'creation', genres: [], tags: [] } })).toBe('src/shared/domain/assistant/skills/packages/creation/');
  });

  it.each(BUILTIN_ASSISTANT_SKILLS)('keeps $id canonical main and nested files through ZIP import', async (skill) => {
    const files = skillPackageFiles(skill);
    expect(files.some(file => file.path.includes('/'))).toBe(true);
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

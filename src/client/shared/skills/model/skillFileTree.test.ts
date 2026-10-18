import { describe, expect, it } from 'vitest';
import {
  addNodeToTree,
  collectDirtyNodeIds,
  createInitialSkillTree,
  createParentIdForSelection,
  isProtectedSkillFile,
  validateSkillNodeName,
  type SkillFileNode,
} from './skillFileTree';

function folder(id: string, children: SkillFileNode[]): SkillFileNode {
  return { id, name: id, type: 'folder', children, isOpen: true };
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

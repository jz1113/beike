export interface SkillFileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: SkillFileNode[];
  isOpen?: boolean;
}

/** 新建技能时 SKILL.md 留空，编辑区用占位说明结构，保存时再写入前言 */
export const DEFAULT_SKILL_MD = '';

export const SKILL_EDITOR_PLACEHOLDER = `在此输入Skill内容

## 做什么
（一句话说明用途）例：把一句话故事想法做成一条短漫剧成片

## 需要什么输入
（最少提供什么）例：一句话想法，可选画风、时长、主角设定

## 怎么做
（写你在意的环节和要求，不用写全）例：脚本要反转多，画风固定成韩漫

## 产出什么
（最终交付什么）例：成片，附脚本和分镜

## 什么时候问你
（什么情况下停下来问你）例：拿不准题材或风格时问一次，其余自己定`;

export function createInitialSkillTree(): SkillFileNode[] {
  return [
    {
      id: 'skill-root-md',
      name: 'SKILL.md',
      type: 'file',
      content: DEFAULT_SKILL_MD,
    },
  ];
}

export function findNodeById(nodes: SkillFileNode[], id: string): SkillFileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function addNodeToTree(
  nodes: SkillFileNode[],
  parentId: string | null,
  newNode: SkillFileNode
): SkillFileNode[] {
  if (!parentId) {
    return [...nodes, newNode];
  }
  return nodes.map((node) => {
    if (node.id === parentId && node.type === 'folder') {
      const children = node.children ? [...node.children, newNode] : [newNode];
      return { ...node, children, isOpen: true };
    }
    if (node.children) {
      return {
        ...node,
        children: addNodeToTree(node.children, parentId, newNode),
      };
    }
    return node;
  });
}

export function renameNodeInTree(
  nodes: SkillFileNode[],
  id: string,
  newName: string
): SkillFileNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, name: newName };
    }
    if (node.children) {
      return {
        ...node,
        children: renameNodeInTree(node.children, id, newName),
      };
    }
    return node;
  });
}

export function deleteNodeFromTree(nodes: SkillFileNode[], id: string): SkillFileNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      if (node.children) {
        return {
          ...node,
          children: deleteNodeFromTree(node.children, id),
        };
      }
      return node;
    });
}

export function updateNodeContentInTree(
  nodes: SkillFileNode[],
  id: string,
  content: string
): SkillFileNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, content };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeContentInTree(node.children, id, content),
      };
    }
    return node;
  });
}

export function toggleFolderOpenInTree(nodes: SkillFileNode[], id: string): SkillFileNode[] {
  return nodes.map((node) => {
    if (node.id === id && node.type === 'folder') {
      return { ...node, isOpen: !node.isOpen };
    }
    if (node.children) {
      return {
        ...node,
        children: toggleFolderOpenInTree(node.children, id),
      };
    }
    return node;
  });
}

export function getMainSkillContent(nodes: SkillFileNode[]): string {
  const rootSkill = nodes.find((n) => n.type === 'file' && n.name.toLowerCase() === 'skill.md');
  if (rootSkill?.content) return rootSkill.content;
  for (const node of nodes) {
    if (node.type === 'file' && node.name.endsWith('.md') && node.content) {
      return node.content;
    }
    if (node.children) {
      const childContent = getMainSkillContent(node.children);
      if (childContent) return childContent;
    }
  }
  return '';
}

/** 找到节点的父目录。根节点返回 null，找不到返回 undefined。 */
export function findParentId(
  nodes: SkillFileNode[],
  id: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const node of nodes) {
    if (node.id === id) return parentId;
    if (node.children) {
      const found = findParentId(node.children, id, node.id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function siblingNames(nodes: SkillFileNode[], parentId: string | null, exceptId?: string): string[] {
  const siblings = parentId == null ? nodes : (findNodeById(nodes, parentId)?.children ?? []);
  return siblings.filter((node) => node.id !== exceptId).map((node) => node.name);
}

export function validateSkillNodeName(name: string, siblingNames: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return '名称不能为空';
  if (/[/\\]/.test(trimmed)) return '名称不能包含 /';
  if (siblingNames.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return '同一目录下已有同名项';
  return null;
}

/** 选中文件夹时在其中新建；选中文件时在它所在的文件夹里新建；没有选中则放在根目录。 */
export function createParentIdForSelection(nodes: SkillFileNode[], selectedId: string): string | null {
  if (!selectedId) return null;
  const selected = findNodeById(nodes, selectedId);
  if (!selected) return null;
  if (selected.type === 'folder') return selected.id;
  return findParentId(nodes, selectedId) ?? null;
}

export function isProtectedSkillFile(nodes: SkillFileNode[], id: string): boolean {
  const node = findNodeById(nodes, id);
  if (!node || node.type !== 'file' || node.name.toLowerCase() !== 'skill.md') return false;
  return findParentId(nodes, id) === null;
}

export function collectDirtyNodeIds(current: SkillFileNode[], baseline: SkillFileNode[]): Set<string> {
  const saved = new Map<string, { name: string; content: string }>();
  const walkBase = (nodes: SkillFileNode[]) => {
    for (const node of nodes) {
      saved.set(node.id, { name: node.name, content: node.content || '' });
      if (node.children) walkBase(node.children);
    }
  };
  walkBase(baseline);
  const dirty = new Set<string>();
  const walkCurrent = (nodes: SkillFileNode[]) => {
    for (const node of nodes) {
      const previous = saved.get(node.id);
      const contentChanged = node.type === 'file' && (previous?.content || '') !== (node.content || '');
      if (!previous || previous.name !== node.name || contentChanged) dirty.add(node.id);
      if (node.children) walkCurrent(node.children);
    }
  };
  walkCurrent(current);
  return dirty;
}

export function buildTreeFromPaths(filesMap: Map<string, string>): SkillFileNode[] {
  const rootNodes: SkillFileNode[] = [];
  const paths = Array.from(filesMap.keys()).sort((a, b) => a.localeCompare(b));

  for (const filePath of paths) {
    const parts = filePath.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let currentLevel = rootNodes;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        currentLevel.push({
          id: `file-${filePath}`,
          name: part,
          type: 'file',
          content: filesMap.get(filePath) || '',
        });
        continue;
      }
      let folder = currentLevel.find((node) => node.name === part && node.type === 'folder');
      if (!folder) {
        folder = {
          id: `folder-${parts.slice(0, i + 1).join('/')}`,
          name: part,
          type: 'folder',
          children: [],
          isOpen: true,
        };
        currentLevel.push(folder);
      }
      if (!folder.children) folder.children = [];
      currentLevel = folder.children;
    }
  }

  return rootNodes;
}

import type { CanvasNode, CanvasEdge } from './types';
import { nodeBounds } from './canvasGraph';

type GroupPatches = Record<string, Partial<CanvasNode>>;
const visible = (node: CanvasNode) => !node.layerHidden;

/** Clicking a member selects its visible peers without introducing a container node. */
export function canvasGroupSelection(nodes: CanvasNode[], nodeId: string): string[] {
  const member = nodes.find(node => node.id === nodeId && visible(node));
  if (!member) return [];
  return member.groupId ? nodes.filter(node => visible(node) && node.groupId === member.groupId).map(node => node.id) : [member.id];
}

export function expandCanvasGroups(nodes: CanvasNode[], ids: string[]): string[] {
  const selected = new Set(ids);
  const groups = new Set(nodes.filter(node => visible(node) && selected.has(node.id) && node.groupId).map(node => node.groupId));
  return nodes.filter(node => visible(node) && (selected.has(node.id) || Boolean(node.groupId && groups.has(node.groupId)))).map(node => node.id);
}

/** Group commands include hidden members so an existing group is never silently split. */
export function canvasGroupPatches(nodes: CanvasNode[], ids: string[], newGroupId: string): GroupPatches {
  const expanded = new Set(expandCanvasGroups(nodes, ids));
  if (expanded.size < 2 || !newGroupId.trim()) return {};
  const groups = new Set(nodes.filter(node => expanded.has(node.id) && node.groupId).map(node => node.groupId));
  const members = nodes.filter(node => expanded.has(node.id) || Boolean(node.groupId && groups.has(node.groupId)));
  if (members.some(node => node.layerLocked)) return {};
  // A caller-supplied ID must not accidentally join a group outside the selection.
  if (nodes.some(node => node.groupId === newGroupId && !members.some(member => member.id === node.id))) return {};
  return Object.fromEntries(members.filter(node => node.groupId !== newGroupId).map(node => [node.id, { groupId: newGroupId }]));
}

export function canvasUngroupPatches(nodes: CanvasNode[], ids: string[]): GroupPatches {
  const selected = new Set(ids);
  const groups = new Set(nodes.filter(node => visible(node) && selected.has(node.id) && node.groupId).map(node => node.groupId));
  const patches: GroupPatches = {};
  for (const group of groups) {
    const members = nodes.filter(node => node.groupId === group);
    if (members.some(node => node.layerLocked)) continue;
    for (const member of members) patches[member.id] = { groupId: undefined };
  }
  return patches;
}

export function isCanvasSelectionGrouped(nodes: CanvasNode[], ids: string[]): boolean {
  const selectedIds = new Set(ids);
  const selected = nodes.filter(node => visible(node) && selectedIds.has(node.id));
  const group = selected[0]?.groupId;
  return selected.length >= 2 && Boolean(group) && selected.every(node => node.groupId === group) && nodes.every(node => !visible(node) || node.groupId !== group || selectedIds.has(node.id));
}

export type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributionType = 'horizontal' | 'vertical';

/** 按选区外框对齐节点。 */
export function alignSelectedNodes(
  allNodes: CanvasNode[],
  selectedIds: string[],
  type: AlignmentType,
): Record<string, Partial<CanvasNode>> {
  const selected = allNodes.filter(n => selectedIds.includes(n.id) && !n.layerLocked && !n.layerHidden);
  if (selected.length < 2) return {};

  const boundsList = selected.map(n => ({ id: n.id, ...nodeBounds(n), origNode: n }));
  const minX = Math.min(...boundsList.map(b => b.x));
  const maxX = Math.max(...boundsList.map(b => b.x + b.width));
  const centerX = (minX + maxX) / 2;

  const minY = Math.min(...boundsList.map(b => b.y));
  const maxY = Math.max(...boundsList.map(b => b.y + b.height));
  const centerY = (minY + maxY) / 2;

  const patches: Record<string, Partial<CanvasNode>> = {};

  boundsList.forEach(b => {
    let targetX = b.x;
    let targetY = b.y;

    switch (type) {
      case 'left':
        targetX = minX;
        break;
      case 'center':
        targetX = Math.round(centerX - b.width / 2);
        break;
      case 'right':
        targetX = maxX - b.width;
        break;
      case 'top':
        targetY = minY;
        break;
      case 'middle':
        targetY = Math.round(centerY - b.height / 2);
        break;
      case 'bottom':
        targetY = maxY - b.height;
        break;
    }

    if (targetX !== b.x || targetY !== b.y) {
      patches[b.id] = { x: targetX, y: targetY };
    }
  });

  return patches;
}

/**
 * 等间距分布算法
 */
export function distributeSelectedNodes(
  allNodes: CanvasNode[],
  selectedIds: string[],
  type: DistributionType,
): Record<string, Partial<CanvasNode>> {
  const selected = allNodes.filter(n => selectedIds.includes(n.id) && !n.layerLocked && !n.layerHidden);
  if (selected.length < 3) return {};

  const boundsList = selected.map(n => ({ id: n.id, ...nodeBounds(n) }));
  const patches: Record<string, Partial<CanvasNode>> = {};

  if (type === 'horizontal') {
    boundsList.sort((a, b) => a.x - b.x);
    const first = boundsList[0];
    const last = boundsList[boundsList.length - 1];
    const totalSpan = (last.x + last.width) - first.x;
    const totalWidths = boundsList.reduce((sum, b) => sum + b.width, 0);
    const availableGap = totalSpan - totalWidths;
    const gap = availableGap / (boundsList.length - 1);

    let currentX = first.x;
    boundsList.forEach((b) => {
      if (Math.round(currentX) !== b.x) {
        patches[b.id] = { x: Math.round(currentX) };
      }
      currentX += b.width + gap;
    });
  } else {
    boundsList.sort((a, b) => a.y - b.y);
    const first = boundsList[0];
    const last = boundsList[boundsList.length - 1];
    const totalSpan = (last.y + last.height) - first.y;
    const totalHeights = boundsList.reduce((sum, b) => sum + b.height, 0);
    const availableGap = totalSpan - totalHeights;
    const gap = availableGap / (boundsList.length - 1);

    let currentY = first.y;
    boundsList.forEach((b) => {
      if (Math.round(currentY) !== b.y) {
        patches[b.id] = { y: Math.round(currentY) };
      }
      currentY += b.height + gap;
    });
  }

  return patches;
}

/** 按连线层级整理节点并避开重叠。 */
export function autoArrangeCanvasNodes(
  nodes: CanvasNode[],
  edges?: CanvasEdge[],
): Record<string, Partial<CanvasNode>> {
  const activeNodes = nodes.filter(n => !n.layerHidden && !n.layerLocked);
  if (!activeNodes.length) return {};

  const nodeMap = new Map(activeNodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();

  activeNodes.forEach(n => {
    inDegree.set(n.id, 0);
    childrenMap.set(n.id, []);
  });

  // Calculate dependency graph from referenceNodeIds and edges
  activeNodes.forEach(target => {
    (target.referenceNodeIds || []).forEach(sourceId => {
      if (nodeMap.has(sourceId)) {
        inDegree.set(target.id, (inDegree.get(target.id) || 0) + 1);
        childrenMap.get(sourceId)?.push(target.id);
      }
    });
  });

  (edges || []).forEach(edge => {
    if (nodeMap.has(edge.sourceNodeId) && nodeMap.has(edge.targetNodeId)) {
      inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
      childrenMap.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    }
  });

  // Rank computation (Layer by Layer)
  const ranks = new Map<string, number>();
  const queue: string[] = [];

  activeNodes.forEach(n => {
    if ((inDegree.get(n.id) || 0) === 0) {
      ranks.set(n.id, 0);
      queue.push(n.id);
    }
  });

  const remaining = new Map(inDegree);
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentRank = ranks.get(currentId) || 0;

    const children = childrenMap.get(currentId) || [];
    children.forEach(childId => {
      const existingRank = ranks.get(childId) ?? -1;
      ranks.set(childId, Math.max(existingRank, currentRank + 1));
      const nextDegree = (remaining.get(childId) || 0) - 1;
      remaining.set(childId, nextDegree);
      if (nextDegree === 0) queue.push(childId);
    });
  }

  // Group nodes by Rank
  const rankGroups = new Map<number, CanvasNode[]>();
  activeNodes.forEach(n => {
    const rank = ranks.get(n.id) ?? 0;
    if (!rankGroups.has(rank)) rankGroups.set(rank, []);
    rankGroups.get(rank)!.push(n);
  });

  const patches: Record<string, Partial<CanvasNode>> = {};
  const startX = 80;
  const startY = 80;
  const colGap = 100;
  const rowGap = 50;

  let currentColX = startX;
  const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);

  sortedRanks.forEach(rank => {
    const colNodes = rankGroups.get(rank) || [];
    let currentRowY = startY;
    let maxColWidth = 0;

    colNodes.forEach(node => {
      const b = nodeBounds(node);
      maxColWidth = Math.max(maxColWidth, b.width);

      if (node.x !== currentColX || node.y !== currentRowY) {
        patches[node.id] = { x: currentColX, y: currentRowY };
      }
      currentRowY += b.height + rowGap;
    });

    currentColX += maxColWidth + colGap;
  });

  return patches;
}

import type { CanvasNode, CanvasEdge } from './types';
import { nodeBounds } from './canvasGraph';

export type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributionType = 'horizontal' | 'vertical';

/**
 * 批量对齐算法（对标 tldraw & Figma）
 */
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

/**
 * 拓扑自动整理与去重叠算法（对标 tvmao-drama autoArrange & ComfyUI）
 */
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

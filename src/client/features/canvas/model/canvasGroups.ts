import type { CanvasNode } from './types';

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

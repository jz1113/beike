import type { CanvasNode } from '../model/types';
import type React from 'react';

export interface CanvasStageNodeProps {
  multiSelected?: boolean;
  handleNodeClick?: (node: CanvasNode, event: React.MouseEvent) => void;
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
  zoom: number;
  selectedNodeId: string | null;
  draggingNodeId: string | null;
  draggingNodePos: { x: number; y: number } | null;
  editingDrawingId: string | null;
  editingNodeTitleId: string | null;
  tempNodeTitle: string;
  drawingPress: React.MutableRefObject<{ x: number; y: number } | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  replacementNodeRef: React.MutableRefObject<string | null>;
  setSelectedNodeId: (id: string | null) => void;
  setEditingDrawingId: (id: string | null) => void;
  setTempNodeTitle: (value: string) => void;
  setEditingNodeTitleId: (id: string | null) => void;
  handleNodeDragStart: (node: CanvasNode, e: React.MouseEvent) => void;
  handleStartEditNodeTitle: (node: CanvasNode, e?: React.MouseEvent) => void;
  handleSaveNodeTitle: (nodeId: string) => void;
  handleAddNodeToComposer: (node: CanvasNode, e?: React.MouseEvent) => void;
  setLightingModalNode: (node: CanvasNode | null) => void;
  setMultiAngleModalNode: (node: CanvasNode | null) => void;
  setPreviewMedia: (media: { url: string; type: 'image' | 'video' } | null) => void;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
  onRegenerate: (node: CanvasNode) => void;
}

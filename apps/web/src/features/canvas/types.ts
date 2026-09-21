export interface CanvasNode {
  id: string;
  taskId?: string;
  layerTask?: boolean;
  resultWidth?: number;
  resultHeight?: number;
  generationSize?: string;
  layerGroupId?: string;
  layerOrder?: number;
  layerHidden?: boolean;
  layerLocked?: boolean;
  layerOpacity?: number;
  groupId?: string;
  isFoldLeader?: boolean;
  foldedInGroupId?: string;
  foldedCount?: number;
  referenceNodeIds?: string[];
  missingMedia?: boolean;
  type: 'image' | 'video' | 'audio' | 'file' | 'drawing' | 'prompt' | 'note' | 'group' | 'frame';
  generationKind?: 'image' | 'video';
  drawing?: { duration?: number; refMode?: string; model: string; quality: string; aspect: string; count: number; references: string[]; audio?: boolean };
  audioUrl?: string;
  title?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  referenceImageUrl?: string;
  status?: 'idle' | 'generating' | 'success' | 'error';
  progress?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio?: string;
  model?: string;
  createdAt: number;
}

export interface CanvasProject {
  draft?: boolean;
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  updatedAt: number;
  createdAt: number;
  nodes: CanvasNode[];
}

export interface CanvasSubject {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string;
}

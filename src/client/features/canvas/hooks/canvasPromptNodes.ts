import type { CanvasNode } from '../model/types';

interface PromptTask {
  id?: string;
  taskId?: string;
  prompt?: string;
  title?: string;
}

export function buildCanvasPromptNodes(options: {
  promptText: string;
  refImage?: string;
  mode?: string;
  tasks?: PromptTask[];
  pan: { x: number; y: number };
  zoom: number;
  viewport: { clientWidth?: number; clientHeight?: number } | null;
}): CanvasNode[] {
  const { pan, zoom, viewport, promptText, refImage, mode, tasks } = options;
  const viewCenterX = (-pan.x + (viewport?.clientWidth || 900) / 2) / zoom;
  const viewCenterY = (-pan.y + (viewport?.clientHeight || 600) / 2) / zoom;
  const isVideo = mode === 'video';
  const cardW = isVideo ? 340 : 360;
  const cardH = isVideo ? 520 : 360;
  const gap = 36;
  const taskList = tasks && tasks.length > 0
    ? tasks
    : [{ id: `node-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, taskId: `task-${Date.now()}`, prompt: promptText }];
  const count = taskList.length;
  const cols = count === 4 ? 2 : count === 3 ? 3 : count === 2 ? 2 : 1;
  const rows = Math.ceil(count / cols);
  const totalW = cols * cardW + (cols - 1) * gap;
  const totalH = rows * cardH + (rows - 1) * gap;
  const startX = Math.round(viewCenterX - totalW / 2);
  const startY = Math.round(viewCenterY - totalH / 2);

  return taskList.map((task, index) => {
    const colIndex = index % cols;
    const rowIndex = Math.floor(index / cols);
    const posX = startX + colIndex * (cardW + gap);
    const posY = startY + rowIndex * (cardH + gap);
    const nodeId = task.id || `node-gen-${Date.now()}-${index}`;
    const taskId = task.taskId || task.id;
    const initialTitle =
      (task.title || promptText.slice(0, 24) || (isVideo ? 'AI 视频创作' : 'AI 创意生成')) +
      (count > 1 ? ` (${index + 1}/${count})` : '');

    return {
      id: nodeId,
      taskId,
      type: isVideo ? 'video' : 'image',
      title: initialTitle,
      content: promptText,
      status: 'generating' as const,
      progress: 15,
      referenceImageUrl: refImage,
      x: posX,
      y: posY,
      width: cardW,
      height: cardH,
      createdAt: Date.now() + index,
    };
  });
}

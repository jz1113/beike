import type { GenerationTask } from '@client/store/appStoreTypes';
import type { CanvasProject } from '@client/features/canvas/model/types';

/** Save a finished edit as an independent project; never resume the source task. */
export function imageToolProject(task: GenerationTask, id: string, now: number): CanvasProject {
  if (task.status !== 'SUCCESS' || !task.resultUrl) throw new Error('请等待图片生成完成后保存');
  const source = task.sourceImageUrl || task.referenceImageUrl;
  if (!source) throw new Error('原图已缺失，请先恢复参考素材');
  return { id, title: task.title, createdAt: now, updatedAt: now, draft: false, nodes: [], edges: [], thumbnail: task.resultUrl,
    studioScene: { nodes: [
      { id: `${id}-source`, type: 'input-image', nodeName: '原图', x: 80, y: 100, width: 340, height: 300,
        content: source, imageUrl: source, settings: { mediaType: 'image' } },
      { id: `${id}-result`, type: 'gen-image', nodeName: task.title, x: 540, y: 100, width: 340, height: 300,
        prompt: task.prompt, content: task.resultUrl, imageUrl: task.resultUrl,
        settings: { model: `beike:image:${task.modelRouteKey || task.model}`, gptImageQuality: task.quality, beikeOutputSize: task.size, batchCount: 1,
          beikeRequiredInputs: [`${id}-source`] } },
    ], connections: [{ id: `${id}-reference`, from: `${id}-source`, to: `${id}-result` }],
    groups: [], textBoxes: [], strokes: [], view: { x: 40, y: 60, zoom: 0.75 } } };
}

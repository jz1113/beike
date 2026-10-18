/**
 * 判断一个任务是否仅为纯文本 Agent 对话（如问候“你好”、打招呼或纯文本问答，且无真实文件/媒体交付物）。
 * 纯文本对话应当保存在会话中，但绝不应作为资产呈现在资产库或素材库中。
 */
export function isPureAgentDialogue(task: {
  id?: string;
  mediaType?: string;
  resultUrl?: string;
  images?: string[];
  referenceImages?: string[];
  sourceImageUrl?: string;
  isUploaded?: boolean;
  prompt?: string;
  title?: string;
  rawTask?: unknown;
}): boolean {
  const isAgent =
    task.mediaType === 'agent' ||
    (typeof task.id === 'string' && task.id.startsWith('agent-task-'));

  if (!isAgent) return false;

  // 1. 若拥有真实生成媒体文件（图片、视频、音频 URL）
  if (task.resultUrl && !task.resultUrl.startsWith('agent-file:')) {
    return false;
  }

  // 2. 若有真实生成的图片或媒体列表
  if (
    task.images &&
    task.images.length > 0 &&
    task.images.some((img) => img && !img.startsWith('agent-file:'))
  ) {
    return false;
  }

  // 3. 若为用户在多模态对话中明确上传的素材文件
  if (task.isUploaded) {
    return false;
  }

  // 纯文本对话不作为资产呈现，即使提示词看起来像一份方案
  return true;
}

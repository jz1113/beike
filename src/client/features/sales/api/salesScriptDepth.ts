import { pollDepthVideoTask } from '@client/shared/api/generation/depthGeneration';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';

export class ScriptDepthFailed extends Error {}
export async function waitScriptDepth(taskId: string, signal: AbortSignal, onProgress: (text: string) => void): Promise<string> {
  const deadline = Date.now() + 30 * 60_000;
  while (!signal.aborted && Date.now() < deadline) {
    const result = await pollDepthVideoTask(taskId, signal);
    if (result.status === 'FAILURE') throw new ScriptDepthFailed(result.failReason || '深度转换失败');
    if (result.status === 'SUCCESS' && result.resultUrl) return result.resultUrl;
    onProgress(`深度动作视频处理中 ${result.progress || ''}`);
    await sleepWhilePolling(1000, () => signal.aborted);
  }
  throw new Error('等待已结束，可继续查询原深度任务');
}

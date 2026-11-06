import { useAppStore } from '@client/store';
import { apiFetch, storageConfigHeaders } from '@client/shared/api/apiClient';
import { resolveStudioInputs } from './studioConnections';
import { canvasChatRequest } from './studioChat';
import { prepareStudioGeneration } from './studioGeneration';
import { w3CopyInputKey } from './w3CopyRunPlan';
import { studioNodeTaskId, type StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';

type Reference = ReturnType<typeof resolveStudioInputs>['refs'][number];
type ReadMedia = (reference: Reference) => Promise<{ type: 'image' | 'video'; url: string }>;

function readNode(commands: StudioTaskCommands, id: string) {
  const node = commands.read().nodes.find(item => item.id === id);
  if (!node) throw new Error('生成节点已不存在');
  return node;
}

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法读取参考素材'));
    reader.readAsDataURL(blob);
  });
}

export async function runW3Analysis(commands: StudioTaskCommands, id: string, signal: AbortSignal, readMedia: ReadMedia) {
  const node = readNode(commands, id);
  const settings = (node.settings || {}) as Record<string, unknown>;
  const { prompt, refs } = resolveStudioInputs(commands.read(), id);
  const inputKey = w3CopyInputKey(commands.read());
  const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
  for (const ref of refs) {
    const media = await readMedia(ref);
    const source = new URL(media.url, window.location.origin);
    if (media.type === 'video' && /^https?:$/.test(source.protocol) && source.origin !== location.origin) {
      content.push({ type: 'video_url', video_url: { url: source.href } });
      continue;
    }
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error('参考素材无法读取，请重新导入');
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith(media.type + '/')) throw new Error('参考素材已失效或类型不匹配');
    if (media.type === 'image') {
      content.push({ type: 'image_url', image_url: { url: await dataUrl(blob) } });
    } else {
      const form = new FormData();
      form.append('file', blob, 'reference.mp4');
      const upload = await apiFetch('/api/generate/upload-ref', { method: 'POST', headers: storageConfigHeaders(), body: form, signal });
      const data = await upload.json();
      if (!upload.ok || !data.success || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) throw new Error('参考视频上传失败');
      content.push({ type: 'video_url', video_url: { url: data.url } });
    }
  }
  if (w3CopyInputKey(commands.read()) !== inputKey) throw new Error('参考素材或分镜设置已修改，请重新检查后运行');
  const response = await canvasChatRequest({ model: settings.textNodeChatModel, messages: [{ role: 'user', content }] }, signal);
  const body = await response.json();
  const text = String(body.choices?.[0]?.message?.content || body.text || '').trim();
  if (!text) throw new Error('分镜分析未返回正文');
  signal.throwIfAborted();
  commands.update(id, studioNodeTaskId(node), { content: text, settings: { text, textNodeDisplayText: text, aiGenerated: true, _chatCompletedAt: Date.now() } });
}

export async function runW3Media(commands: StudioTaskCommands, id: string, readMedia: ReadMedia, save: (scene: StudioScene) => Promise<void>) {
  const node = readNode(commands, id);
  if (node.isGenerating) return false;
  const settings = (node.settings || {}) as Record<string, unknown>;
  const inputs = resolveStudioInputs(commands.read(), id);
  const inputKey = w3CopyInputKey(commands.read());
  const refs = await Promise.all(inputs.refs.map(readMedia));
  if (w3CopyInputKey(commands.read()) !== inputKey) throw new Error('参考素材或生成设置已修改，请重新检查后运行');
  const taskId = 'studio-' + crypto.randomUUID();
  const prepared = prepareStudioGeneration({
    taskId, model: String(settings.model), prompt: inputs.prompt, refs,
    ratio: String(settings.ratio || ''), duration: inputs.duration, resolution: String(settings.resolution || ''),
    videoMode: node.type === 'gen-video' ? 'first_frame' : undefined, audio: inputs.audio, w3Workflow: true,
  });
  if (!prepared || readNode(commands, id).isGenerating) return false;
  commands.update(id, studioNodeTaskId(node), { beikeTaskId: taskId, beikeTaskRecord: prepared.task, isGenerating: true, beikeTaskStopped: false, errorMsg: undefined,
    settings: { beikeRawVideoUrl: undefined, beikeSilentDelivery: false } });
  if (readNode(commands, id).beikeTaskId !== taskId) return false;
  await save(commands.read());
  const persisted = readNode(commands, id);
  if (!persisted.isGenerating || persisted.beikeTaskId !== taskId) return false;
  useAppStore.getState().addGenerationTask(prepared.task);
  while (true) {
    const current = readNode(commands, id);
    if (!current.isGenerating || current.beikeTaskId !== taskId) return current.beikeLastTaskId === taskId && !current.errorMsg && !current.beikeTaskStopped;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

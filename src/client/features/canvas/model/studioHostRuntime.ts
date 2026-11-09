import {
  restoreStudioReference,
  sortStudioMediaReferences,
  studioEdgeSources,
  studioNodeMedia,
} from './studioConnections';
import { studioChannels } from './studioGeneration';
import { recordStudioResultVersion, syncStudioPreviews } from './studioPreview';
import { recoverStudioPromptOperationNode } from './studioPromptOperation';
import { recoverStudioSpeechNode } from './studioSpeech';
import {
  recoverStudioIdleNode,
  recoverStudioPromptReview,
  restoreStudioTaskResult,
} from './studioTaskState';
import { recoverStudioTextNode } from './videoWorkflowRecovery';
import type { StudioScene } from './types';

type StudioNode = StudioScene['nodes'][number];

export interface ReferenceItem {
  id?: string;
  nodeId?: string;
  sourceNodeId?: string;
  sourceNode?: { id?: string };
  url?: string;
  imgSrc?: string;
  mediaType?: string;
  type?: string;
  position1Based?: number | string;
}

const kindForNode: Record<string, 'image' | 'video' | 'chat' | 'voice'> = {
  'gen-image': 'image',
  'gen-video': 'video',
  'text-node': 'chat',
  'gen-speech': 'voice',
};

export function selectStudioModelFor(
  type: string,
  previous?: unknown,
  channels = studioChannels(),
): string {
  const targetKind = kindForNode[type];
  if (!targetKind) return '';
  const options = channels.filter((ch) => ch.kind === targetKind);
  const norm = (s: unknown) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  const prevStr = typeof previous === 'string' ? previous : '';
  const match =
    options.find((ch) => ch.id === prevStr) ||
    options.find(
      (ch) =>
        prevStr &&
        [ch.route, ch.modelId, ch.name].some((id) => norm(id) === norm(prevStr)),
    );
  return (match || options.find((ch) => ch.preferred) || options[0])?.id || '';
}

export function normalizeStudioNode(
  node: StudioNode,
  channels = studioChannels(),
): StudioNode {
  const restored = restoreStudioReference(recoverStudioIdleNode(node));
  const settings = (restored.settings as Record<string, unknown>) || {};
  if (settings.beikeOperation === 'depth-video') {
    return { ...restored, settings: { ...settings, model: 'beike:depth:video' } };
  }
  if (settings.beikePromptCompiler) {
    return {
      ...restored,
      settings: {
        ...settings,
        textNodeChatModel: selectStudioModelFor('text-node', settings.textNodeChatModel, channels),
        model: selectStudioModelFor('gen-video', settings.model, channels),
      },
    };
  }
  if (!kindForNode[restored.type]) return restored;
  const field = restored.type === 'text-node' ? 'textNodeChatModel' : 'model';
  const model =
    settings.beikeVideoWorkflow === 'w3-copy'
      ? (
          channels.find(
            (ch) => ch.kind === 'video' && 'metasoH3' in ch && ch.metasoH3 && ch.id === settings[field],
          ) ||
          channels.find((ch) => ch.kind === 'video' && 'metasoH3' in ch && ch.metasoH3)
        )?.id || ''
      : selectStudioModelFor(restored.type, settings[field], channels);

  const errText = String(restored.errorMsg || settings.error || '');
  if (!restored.isGenerating && /请先配置\s*API\s*Key/i.test(errText)) {
    return {
      ...restored,
      errorMsg: undefined,
      settings: { ...settings, [field]: model, error: undefined },
    };
  }
  return model === settings[field]
    ? restored
    : { ...restored, settings: { ...settings, [field]: model } };
}

export function recoverLoadedStudioScene(
  projectId: string,
  scene: StudioScene,
  channels = studioChannels(),
): StudioScene {
  return syncStudioPreviews({
    ...scene,
    nodes: scene.nodes.map((original) => {
      const promptRecovered = recoverStudioPromptOperationNode(
        recoverStudioPromptReview({ ...original, beikeCompilerRunning: undefined }),
      );
      const textRecovered = recoverStudioTextNode(projectId, promptRecovered);
      const settings = (textRecovered.settings as Record<string, unknown>) || {};
      const next =
        textRecovered.type === 'gen-speech'
          ? recoverStudioSpeechNode(projectId, textRecovered)
          : settings.beikeOperation === 'compose-original' && textRecovered.isGenerating
            ? {
                ...textRecovered,
                isGenerating: false,
                beikeTaskId: undefined,
                errorMsg: '上次本地处理已中断，请检查已有结果后继续。',
              }
            : textRecovered;
      return normalizeStudioNode(next, channels);
    }),
  });
}

export function remapStudioPromptReferences(
  prompt: string,
  before: ReadonlyArray<ReferenceItem | string>,
  after: ReadonlyArray<ReferenceItem | string>,
): string {
  const baseIdentity = (item: ReferenceItem | string) =>
    typeof item === 'string'
      ? item
      : item?.id || item?.nodeId || item?.sourceNodeId || item?.sourceNode?.id || item?.url || item?.imgSrc || '';

  const duplicated = new Set<string>();
  for (const items of [before, after]) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = baseIdentity(item);
      if (seen.has(key)) duplicated.add(key);
      seen.add(key);
    }
  }
  const identity = (item: ReferenceItem | string) => {
    const key = baseIdentity(item);
    const url = typeof item === 'string' ? item : item?.url || item?.imgSrc;
    return duplicated.has(key) && url ? `${key}\u0000${url}` : key;
  };
  const kind = (item: ReferenceItem | string) => {
    if (typeof item === 'string') return 'image';
    const type = item?.mediaType || item?.type;
    return type === 'text-node' ? 'text' : type;
  };
  const position = (item: ReferenceItem | string, index: number) =>
    Number(String((typeof item === 'string' ? undefined : item?.position1Based) || index + 1).replace('text:', ''));
  const labels: Record<string, string> = {
    图片: 'image',
    视频: 'video',
    音频: 'audio',
    文本: 'text',
    img: 'image',
  };

  return String(prompt || '').replace(
    /@(图片|视频|音频|文本|img)?(\d+)/gi,
    (token, rawLabel: string | undefined, numStr: string) => {
      const label = rawLabel?.toLowerCase();
      const targetNum = Number(numStr);
      const oldIndex = before.findIndex(
        (item, index) =>
          position(item, index) === targetNum &&
          (label === '文本' ? kind(item) === 'text' : kind(item) !== 'text'),
      );
      if (oldIndex < 0) return token;
      const old = before[oldIndex];
      const key = identity(old);
      if (!key || (label && kind(old) && labels[label] !== kind(old))) return token;
      const nextIndex = after.findIndex((item) => identity(item) === key);
      if (nextIndex < 0) return '';
      return `@${label || ''}${position(after[nextIndex], nextIndex)}`;
    },
  );
}

export function reconcileStudioReferenceChanges(
  previous: StudioScene | undefined,
  scene: StudioScene,
): StudioScene {
  if (!previous) return scene;
  const collectRefs = (graph: StudioScene, target: StudioNode): ReferenceItem[] => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const ids = [
      ...new Set(
        graph.connections
          .filter((edge) => edge.to === target.id && (!edge.inputType || edge.inputType === 'default'))
          .flatMap((edge) => studioEdgeSources(edge, graph)),
      ),
    ];
    const media: ReferenceItem[] = [];
    const texts: ReferenceItem[] = [];
    for (const id of ids) {
      const node = byId.get(id);
      if (!node) continue;
      if (node.type === 'text-node' || node.type === 'novel-input') {
        texts.push({ nodeId: id, mediaType: 'text' });
        continue;
      }
      const nSettings = (node.settings as Record<string, unknown>) || {};
      const type =
        node.type === 'gen-video' || node.type === 'video-input'
          ? 'video'
          : node.type === 'gen-speech' || node.type === 'gen-music'
            ? 'audio'
            : String(nSettings.mediaType || node.previewType || 'image');
      media.push({ nodeId: id, mediaType: type, url: studioNodeMedia(node).url });
    }
    const settings = (target.settings as Record<string, unknown>) || {};
    const refImages = Array.isArray(settings.referenceImages) ? (settings.referenceImages as string[]) : [];
    for (const url of refImages) {
      if (!media.some((item) => item.url === url)) media.push({ id: url, mediaType: 'image', url });
    }
    sortStudioMediaReferences(media, settings, item => item.url);
    return [
      ...media.map((item, index) => ({ ...item, position1Based: index + 1 })),
      ...texts.map((item, index) => ({ ...item, position1Based: `text:${index + 1}` })),
    ];
  };

  const oldNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  let changed = false;
  const nodes = scene.nodes.map((node) => {
    const old = oldNodes.get(node.id);
    if (!old || !['gen-image', 'gen-video', 'text-node'].includes(node.type)) return node;
    const before = collectRefs(previous, old);
    const after = collectRefs(scene, node);
    const fingerprint = (items: ReferenceItem[]) =>
      JSON.stringify(items.map((item) => [item.id || item.nodeId || item.url, item.position1Based, item.mediaType]));
    if (fingerprint(before) === fingerprint(after)) return node;
    const isDraft = node.type === 'text-node';
    const oldSettings = (old.settings as Record<string, unknown>) || {};
    const curSettings = (node.settings as Record<string, unknown>) || {};
    const oldPrompt = isDraft ? String(oldSettings.textNodeDraftPrompt || '') : String(old.prompt || '');
    const curPrompt = isDraft ? String(curSettings.textNodeDraftPrompt || '') : String(node.prompt || '');
    if (curPrompt !== oldPrompt) return node;
    const next = remapStudioPromptReferences(curPrompt, before, after);
    if (next === curPrompt) return node;
    changed = true;
    return isDraft
      ? { ...node, settings: { ...curSettings, textNodeDraftPrompt: next } }
      : { ...node, prompt: next };
  });
  return changed ? { ...scene, nodes } : scene;
}

export async function resolveStableStudioReference(
  item: { url: string; type: 'image' | 'video' | 'audio'; assetId?: string },
  loadAsset?: (url: string, localId: string | null) => Promise<Blob | undefined>,
  origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): Promise<{ type: 'image' | 'video' | 'audio'; url: string }> {
  const { url, type, assetId } = item;
  if (typeof url !== 'string' || !url) throw new Error('参考素材缺少地址');
  const localId = assetId || (url.startsWith('local-asset://') ? decodeURIComponent(url.slice('local-asset://'.length)) : null);
  let blob: Blob | undefined;
  if (type === 'image' && !url.startsWith('data:') && loadAsset) {
    try {
      blob = await loadAsset(url, localId);
    } catch {
      /* Public URL remains usable */
    }
  }
  if (!blob && /^(https?:\/\/|\/storage\/)/i.test(url)) {
    const media = new URL(url, origin);
    return {
      type,
      url:
        media.origin === origin && media.pathname.startsWith('/storage/')
          ? media.pathname + media.search + media.hash
          : url,
    };
  }
  if (!blob && url.startsWith(`data:${type}/`)) return { type, url };
  if (url.startsWith('blob:')) {
    try {
      const response = await fetch(url);
      if (response.ok) blob = await response.blob();
    } catch {
      /* Fall back to persistent cache */
    }
  }
  if (!blob && localId && loadAsset) {
    blob = await loadAsset(url, localId);
  }
  const fallbackMime = type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'image/png';
  const blobType = blob?.type && blob.type !== 'application/octet-stream' ? blob.type : fallbackMime;
  if (!blob?.size || !blobType.startsWith(`${type}/`)) {
    throw new Error('参考素材已失效或类型不匹配，请重新导入');
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        String(reader.result || '').replace(
          /^data:(?:application\/octet-stream|);base64,/i,
          `data:${fallbackMime};base64,`,
        ),
      );
    reader.onerror = () => reject(new Error('无法读取参考素材'));
    reader.readAsDataURL(blob);
  });
  return { type, url: data };
}

export function applyStudioTaskResult(
  node: StudioNode,
  taskId: string,
  url?: string,
  error?: string,
): StudioNode {
  if (node.beikeTaskId !== taskId || !node.isGenerating) return node;
  const rawSettings = (node.settings as Record<string, unknown>) || {};
  const settings: Record<string, unknown> = {
    ...rawSettings,
    _preGenerateSnapshot: undefined,
    isGenerating: false,
    progress: url ? 100 : 0,
    error,
  };
  const update: Partial<StudioNode> = {
    beikeTaskId: undefined,
    beikeTaskRecord: undefined,
    beikePromptReviewPending: false,
    beikePromptOptimizing: false,
    isGenerating: false,
    errorMsg: error,
    settings,
  };
  if (!url) {
    return { ...restoreStudioTaskResult(node), ...update };
  }
  const previousVersions = Array.isArray(rawSettings.generationVersions)
    ? (rawSettings.generationVersions as Record<string, unknown>[])
    : [];
  if (node.type === 'gen-video') {
    return recordStudioResultVersion(
      node,
      {
        ...node,
        ...update,
        content: url,
        videoUrl: url,
        previewType: 'video',
        settings: { ...settings, generatedImages: [] },
      },
      previousVersions,
    );
  }
  const images = [{ id: taskId, fullUrl: url, thumbUrl: url, createdAt: Date.now() }];
  return recordStudioResultVersion(
    node,
    {
      ...node,
      ...update,
      content: url,
      imageUrl: url,
      previewType: 'image',
      generatedImages: images,
      settings: { ...settings, generatedImages: images, selectedImageIndex: 0 },
    },
    previousVersions,
  );
}

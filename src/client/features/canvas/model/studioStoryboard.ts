import type { CanvasNode, StudioScene } from './types';

export type StoryboardNode = CanvasNode & { shotDuration?: number };

export function isStoryboardShot(node: CanvasNode) {
  return !node.layerHidden && Boolean(node.imageUrl || node.videoUrl);
}

const mediaAddress = /^(?:https?:\/\/|blob:|data:(?:image|video)\/|\/storage\/)/i;

export function studioStoryboardNodes(scene?: StudioScene): StoryboardNode[] {
  return (scene?.nodes ?? []).flatMap(node => {
    const settings = node.settings as Record<string, unknown> | undefined;
    const kind = node.previewType || settings?.mediaType;
    if (kind === 'audio' || settings?.audioUrl || ['text-node', 'gen-speech', 'gen-music'].includes(node.type)) return [];
    const images = settings?.generatedImages ?? node.generatedImages;
    const index = Number(settings?.selectedImageIndex);
    const image = Array.isArray(images) ? images[index] ?? images[0] : undefined;
    const media = [node.videoUrl, image?.fullUrl, image?.url, node.content, node.imageUrl, image?.thumbUrl]
      .find((url): url is string => typeof url === 'string' && mediaAddress.test(url));
    if (!media || /\.(?:mp3|wav|m4a|aac|flac|oga|opus|ogg)(?:[?#]|$)/i.test(media)) return [];
    const video = Boolean(node.videoUrl) || kind === 'video' || node.type.includes('video') ||
      /^(?:data:video\/)|\.(?:mp4|webm|m4v|mov|mkv)(?:[?#]|$)/i.test(media);
    const duration = parseFloat(String(settings?.duration ?? settings?.videoDuration));
    return [{
      id: node.id, title: String(node.nodeName || (video ? '视频' : '图片')), type: video ? 'video' : 'image',
      x: Number(node.x) || 0, y: Number(node.y) || 0, width: Number(node.width) || 250,
      height: Number(node.height) || 250, createdAt: 0, layerHidden: node.layerHidden === true,
      textPrompt: typeof node.prompt === 'string' ? node.prompt : undefined,
      ...(video && Number.isFinite(duration) && duration > 0 ? {shotDuration: duration} : {}),
      ...(video ? {videoUrl: media} : {imageUrl: media}),
    }];
  });
}

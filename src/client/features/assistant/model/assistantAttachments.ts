import type { MediaAttachment } from '@client/store';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { extractVideoFramesFromSrc, isVideoMediaUrl } from '@client/shared/media/mediaHelper';

interface ApiAttachment { type: string; url?: string; name?: string; mentionName?: string; extractedText?: string }

/** Preserve document text and mentions; expand only the latest user's video into frames. */
export async function expandAttachmentsForApi(atts: MediaAttachment[] | undefined, isLatestUser: boolean): Promise<ApiAttachment[]> {
  if (!atts?.length) return [];
  if (!isLatestUser) return atts.map(a => ({
    type: a.type, url: a.type === 'document' ? undefined : a.thumbnailUrl || a.url,
    name: a.name, mentionName: a.mentionName,
  })).filter(a => a.type === 'document' || Boolean(a.url));
  const out: ApiAttachment[] = [];
  for (const a of atts) {
    if (a.type === 'document') {
      if (a.extractedText) out.push({ type: 'document', name: a.name || '文档', extractedText: a.extractedText });
      continue;
    }
    if (a.type !== 'video') {
      if (a.url) out.push({ type: 'image', url: a.url, name: a.name, mentionName: a.mentionName });
      continue;
    }
    const proxySrc = a.url.startsWith('data:') || a.url.startsWith('blob:') || a.url.startsWith('/') ? a.url : proxyMediaUrl(a.url);
    const frames = await extractVideoFramesFromSrc(proxySrc, 6).catch(() => [] as string[]);
    if (frames.length) frames.forEach((url, i) => out.push({ type: 'image', url, name: `视频帧${i + 1}` }));
    else if (a.thumbnailUrl) out.push({ type: 'image', url: a.thumbnailUrl, name: a.name || '视频封面' });
    else if (a.url && !isVideoMediaUrl(a.url)) out.push({ type: 'image', url: a.url, name: a.name || '视频封面' });
  }
  return out.filter(a => a.type === 'document' ? Boolean(a.extractedText) : Boolean(a.url));
}

import { isVideoMediaUrl } from './mediaHelper';

/** Number each modality independently, in upload order, matching the request content. */
export function mediaReferenceSlots(urls: string[]) {
  let images = 0;
  let videos = 0;
  return urls.map(url => ({ url, name: isVideoMediaUrl(url) ? `视频${++videos}` : `图片${++images}` }));
}

export function normalizeVideoReferenceMentions(prompt: string, urls: string[], subjects: { name: string; url: string }[]) {
  const slots = mediaReferenceSlots(urls);
  return prompt.replace(/@(?:图片\d+|视频\d+|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\}/gi, token => {
    const name = token.replace(/^@/, '').replace(/[{}]/g, '').trim();
    if (/^(图片|视频)\d+$/.test(name)) return `@${name}`;
    const subject = subjects.find(item => item.name === name || item.name.replace(/\.[^/.]+$/, '') === name);
    const match = name.match(/^(?:insp_?|mixed\s*)(\d+)$/i);
    const imageMatch = name.match(/^(?:主体|模特|参考图|商品图|主图|图|image\s*)(\d+)$/i);
    const slot = subject ? slots.find(item => item.url === subject.url) : match ? slots[Number(match[1]) - 1]
      : imageMatch ? slots.filter(item => item.name.startsWith('图片'))[Number(imageMatch[1]) - 1] : undefined;
    return slot ? `@${slot.name}` : token;
  });
}

import { isVideoMediaUrl } from './mediaHelper';
import { isGenericSubjectMention, mentionTokenToName, parseSubjectMention, PROMPT_MENTION_REGEX } from '@shared/domain/prompts/prompt-engine/mentions';
import { resolveRefMediaIdentity } from './refMediaRegistry';

/** Number each modality independently, in upload order, matching the request content. */
export function mediaReferenceSlots(urls: string[]) {
  let images = 0;
  let videos = 0;
  return urls.map(url => ({ url, name: isVideoMediaUrl(url) ? `视频${++videos}` : `图片${++images}` }));
}

export function normalizeVideoReferenceMentions(prompt: string, urls: string[], subjects: { name: string; url: string }[]) {
  const slots = mediaReferenceSlots(urls);
  return prompt.replace(new RegExp(PROMPT_MENTION_REGEX.source, 'gi'), token => {
    const selected = parseSubjectMention(token);
    if (selected) {
      const slot = slots.find(item => item.url === resolveRefMediaIdentity(selected.id));
      return slot ? `@${slot.name}` : token;
    }
    const name = mentionTokenToName(token);
    if (/^(图片|视频)\d+$/.test(name)) return `@${name}`;
    if (isGenericSubjectMention(name)) return slots[0] ? `@${slots[0].name}` : token;
    const subject = subjects.find(item => item.name === name || item.name.replace(/\.[^/.]+$/, '') === name);
    const match = name.match(/^(?:insp_?|mixed\s*)(\d+)$/i);
    const imageMatch = name.match(/^(?:主体|模特|参考图|商品图|主图|图|image\s*)(\d+)$/i);
    const slot = subject ? slots.find(item => item.url === subject.url) : match ? slots[Number(match[1]) - 1]
      : imageMatch ? slots.filter(item => item.name.startsWith('图片'))[Number(imageMatch[1]) - 1] : undefined;
    return slot ? `@${slot.name}` : token;
  });
}

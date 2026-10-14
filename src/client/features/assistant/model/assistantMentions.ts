import type { MediaAttachment } from '@client/store/appStoreTypes';

export function findImageMention(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const match = /(^|[^a-zA-Z0-9_/@])@([^\s@{}]*)$/u.exec(before);
  return match ? { start: cursor - match[2].length - 1, end: cursor, query: match[2] } : null;
}

export function nextImageMention(attachments: MediaAttachment[], text: string) {
  const used = new Set(attachments.map(a => a.mentionName));
  for (const match of text.matchAll(/@(图片\d+)(?!\d)/g)) used.add(match[1]);
  let index = 1;
  while (used.has(`图片${index}`)) index++;
  return `图片${index}`;
}

export function removeImageMention(text: string, name?: string) {
  if (!name || !/^图片\d+$/.test(name)) return text;
  return text.replace(new RegExp(`@${name}(?![\\p{L}\\p{N}_]) ?`, 'gu'), '');
}

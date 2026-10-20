import type { AssistantMessage, MediaAttachment } from '@client/store/appStoreTypes';
import { normalizeAssistantTaskReferences } from '@shared/domain/assistant/normalizeAssistantItems';

/** Image numbering retains the original reply's attachment positions. */
export function getReplyReferenceMedia(messages: AssistantMessage[], replyId: string): MediaAttachment[] {
  const replyIndex = messages.findIndex(message => message.id === replyId);
  const references = normalizeAssistantTaskReferences(messages[replyIndex]?.task?.references);
  if (messages[replyIndex]?.task?.references?.length) {
    if (!references.length) return [];
    const byNumber = new Map(references.map(reference => [reference.number, reference]));
    return Array.from({ length: Math.max(...byNumber.keys()) }, (_, index) => {
      const reference = byNumber.get(index + 1);
      return { type: 'image' as const, url: reference?.url || '', name: reference?.label };
    });
  }
  for (let i = replyIndex - 1; i >= 0; i -= 1) {
    if (messages[i].role !== 'user') continue;
    const media = (messages[i].attachments || []).filter(item => item.type !== 'document');
    if (media.length) return media;
  }
  return [];
}

export function prepareAssistantImagePrompt(code: string, media: MediaAttachment[]) {
  const pattern = /[@＠]\s*(?:图片|图)\s*(\d+)/g;
  const numbers = [...new Set([...code.matchAll(pattern)].map(match => Number(match[1])))];
  const urls: string[] = []; const mapping = new Map<number, number>(); const missing: number[] = [];
  const selected = numbers.length ? numbers : media.map((_, index) => index + 1);
  for (const number of selected) {
    const item = media[number - 1];
    const url = item?.type === 'image' ? item.url || item.thumbnailUrl : undefined;
    if (!url) { if (numbers.length) missing.push(number); continue; }
    let index = urls.indexOf(url);
    if (index === -1) index = urls.push(url) - 1;
    mapping.set(number, index + 1);
  }
  if (missing.length) throw new Error(`未找到参考图 ${missing.map(number => `@图片${number}`).join('、')}，请补充对应图片后再生成。`);
  return { prompt: code.replace(pattern, (_, number) => `@图片${mapping.get(Number(number))}`), urls };
}

/** Video numbers images and videos independently; never substitutes a poster for video. */
export function prepareBatchVideoPrompt(prompt: string, media: MediaAttachment[], enabledIndexes?: number[]) {
  const enabled = (item: MediaAttachment) => !enabledIndexes || enabledIndexes.includes(media.indexOf(item));
  const pattern = /[@＠]\s*(图片|图|视频)\s*(\d+)/g;
  const mentions = [...prompt.matchAll(pattern)];
  const images = media.filter(item => item.type === 'image');
  const videos = media.filter(item => item.type === 'video');
  const selected = mentions.length ? mentions.map(match => {
    const list = match[1] === '视频' ? videos : images;
    const item = list[Number(match[2]) - 1];
    if (!item?.url || !enabled(item)) throw new Error(`未找到参考素材 ${match[0]}，请补齐或勾选对应素材后再生成。`);
    return item;
  }) : media.filter(item => item.type !== 'document' && item.url && enabled(item));
  const ordered = selected.filter((item, index) => selected.findIndex(other => other.url === item.url) === index);
  const imageOrder = ordered.filter(item => item.type === 'image');
  const videoOrder = ordered.filter(item => item.type === 'video');
  return {
    urls: ordered.map(item => item.url),
    imageUrls: imageOrder.map(item => item.url),
    prompt: prompt.replace(pattern, (_, kind: string, number: string) => {
      const original = (kind === '视频' ? videos : images)[Number(number) - 1];
      const index = (kind === '视频' ? videoOrder : imageOrder).findIndex(item => item.url === original.url);
      return `@${kind === '视频' ? '视频' : '图片'}${index + 1}`;
    }),
  };
}

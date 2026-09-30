import type { AssistantMessage, MediaAttachment } from '@client/store/appStoreTypes';
import { normalizeAssistantTaskReferences } from '@shared/domain/assistant/normalizeAssistantItems';

/** Numbering is local to the most recent user attachment batch before this reply. */
export function getReplyReferenceMedia(messages: AssistantMessage[], replyId: string): MediaAttachment[] {
  const replyIndex = messages.findIndex((message) => message.id === replyId);
  const taskRefs = messages[replyIndex]?.task?.references;
  if (Array.isArray(taskRefs) && taskRefs.length) {
    // Live events may arrive before persisted-state normalization. Never allocate
    // an array using an unchecked reference number from the event or cache.
    const safeReferences = normalizeAssistantTaskReferences(taskRefs);
    if (!safeReferences.length) return [];
    const byNumber = new Map(safeReferences.map(reference => [reference.number, reference]));
    return Array.from({ length: Math.max(...byNumber.keys()) }, (_, index) => {
      const reference = byNumber.get(index + 1);
      return { type: 'image' as const, url: reference?.url || '', name: reference?.label };
    });
  }
  for (let i = replyIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const media = (message.attachments || []).filter((attachment) => attachment.type !== 'document');
    if (media.length) return media;
  }
  return [];
}

export function prepareAssistantImagePrompt(code: string, media: MediaAttachment[]) {
  const pattern = /[@＠]\s*(?:图片|图)\s*(\d+)/g;
  const numbers = [...new Set([...code.matchAll(pattern)].map((match) => Number(match[1])))];
  const urls: string[] = [];
  const mapping = new Map<number, number>();
  const missing: number[] = [];
  const selectedNumbers = numbers.length ? numbers : media.map((_, index) => index + 1);
  for (const number of selectedNumbers) {
    const attachment = media[number - 1];
    // Never substitute a video's poster for an explicitly referenced image.
    const url = attachment?.type === 'image' ? attachment.url || attachment.thumbnailUrl : undefined;
    if (!url) {
      if (numbers.length) missing.push(number);
      continue;
    }
    let index = urls.indexOf(url);
    if (index === -1) index = urls.push(url) - 1;
    mapping.set(number, index + 1);
  }
  if (missing.length) throw new Error(`未找到参考图 ${missing.map((number) => `@图片${number}`).join('、')}，请在此对话中补充对应图片后再载入。`);
  return {
    prompt: code.replace(pattern, (_, number) => `@图片${mapping.get(Number(number))}`),
    urls,
  };
}

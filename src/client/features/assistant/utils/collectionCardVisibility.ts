import type { AssistantMessage } from '@client/store/appStoreTypes';

/** Presentation-only deduplication: keep original messages and reference numbering intact. */
export function duplicateCollectionCards(messages: AssistantMessage[]): Set<string> {
  const seen = new Set<string>();
  const hidden = new Set<string>();
  for (const message of messages) {
    const widget = message.productWidget;
    if (!widget || !['social', 'xiaohongshu', 'douyin', 'kuaishou', 'weibo'].includes(widget.platform)) continue;
    const images = [...new Set((widget.allImages || []).filter(Boolean))].sort();
    if (!images.length) continue;
    const key = JSON.stringify([widget.platform, images]);
    if (seen.has(key)) hidden.add(message.id);
    else seen.add(key);
  }
  return hidden;
}

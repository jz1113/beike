import { expect, it } from 'vitest';
import type { AssistantMessage } from '@/types/app-store';
import { duplicateCollectionCards } from '../collectionCardVisibility';

const message = (id: string, images: string[]) => ({ id, role: 'assistant', content: '', timestamp: 1,
  productWidget: { platform: 'xiaohongshu', allImages: images } }) as AssistantMessage;
it('keeps the first card and hides repeated cards even with reordered images', () => {
  const messages = [message('first', ['a', 'b']), message('repeat', ['b', 'a']), message('new', ['c'])];
  expect([...duplicateCollectionCards(messages)]).toEqual(['repeat']);
  expect(messages[1].productWidget?.allImages).toEqual(['b', 'a']);
});
it('does not hide an expanded collection or empty cards', () => {
  expect([...duplicateCollectionCards([message('a', ['a']), message('b', ['a', 'b']), message('c', [])])]).toEqual([]);
});

// @vitest-environment happy-dom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getReplyReferenceMedia, prepareAssistantImagePrompt } from '../assistantPromptReferences';
import FormattedMarkdown from '../FormattedMarkdown';
import AssistantTurnList from '../AssistantTurnList';
import { useAppStore } from '@/store';
import type { AssistantMessage, MediaAttachment } from '@/types/app-store';

const media: MediaAttachment[] = Array.from({ length: 19 }, (_, i) => ({ type: 'image', url: `https://example.com/${i + 1}.jpg` }));
const code = '以 @图片1 为主图，拼入 @图片6、@图片10、@图片19，再突出 @图片1。--ar 3:4';
afterEach(cleanup);

describe('assistant prompt reference transfer', () => {
  it('compacts sparse image numbers in a single pass and keeps repeated references consistent', () => {
    expect(prepareAssistantImagePrompt(code, media)).toEqual({
      prompt: '以 @图片1 为主图，拼入 @图片2、@图片3、@图片4，再突出 @图片1。--ar 3:4',
      urls: [1, 6, 10, 19].map((i) => `https://example.com/${i}.jpg`),
    });
    expect(prepareAssistantImagePrompt('@图片10 @图片1 @图片10', media).prompt).toBe('@图片1 @图片2 @图片1');
  });

  it('handles full-width mentions, duplicate URLs and prompts without explicit numbering', () => {
    expect(prepareAssistantImagePrompt('＠图片 2 @图1', [media[0], media[0]])).toEqual({ prompt: '@图片1 @图片1', urls: [media[0].url] });
    expect(prepareAssistantImagePrompt('真实光影', media.slice(0, 2)).urls).toHaveLength(2);
    expect(() => prepareAssistantImagePrompt('@图片20', media)).toThrow('@图片20');
    expect(() => prepareAssistantImagePrompt('@图片1', [{ type: 'video', url: 'clip.mp4', thumbnailUrl: 'poster.jpg' }])).toThrow('@图片1');
  });

  it('uses the attachment batch preceding the reply, excluding documents and future uploads', () => {
    const messages: AssistantMessage[] = [
      { id: 'u1', role: 'user', content: '', timestamp: 1, attachments: [{ type: 'document', url: 'a.pdf' }, ...media] },
      { id: 'u2', role: 'user', content: '继续', timestamp: 2 },
      { id: 'reply', role: 'assistant', content: code, timestamp: 3 },
      { id: 'future', role: 'user', content: '', timestamp: 4, attachments: [media[5]] },
    ];
    expect(getReplyReferenceMedia(messages, 'reply')).toEqual(media);
    expect(getReplyReferenceMedia(messages, 'unknown')).toEqual([]);
  });

  it.each(['markdown', 'turn'])('loads actual images and remapped prompt via the %s button', (variant) => {
    useAppStore.setState({ quickRefImages: ['old.jpg'], quickRefImage: 'old.jpg', quickPrompt: '', quickGenMode: 'video' });
    const content = '```text\n' + code + '\n```';
    if (variant === 'markdown') render(<FormattedMarkdown content={content} referenceMedia={media} />);
    else render(<AssistantTurnList items={[{ id: 'a', kind: 'agentMessage', content } as any]} referenceMedia={media} />);
    fireEvent.click(screen.getByText('一键载入生图'));
    const state = useAppStore.getState();
    expect(state.quickRefImages).toEqual([1, 6, 10, 19].map((i) => `https://example.com/${i}.jpg`));
    expect(state.quickRefImage).toBe(media[0].url);
    expect(state.quickPrompt).toBe(prepareAssistantImagePrompt(code, media).prompt);
    expect(state.quickGenMode).toBe('image');
    expect(state.currentView).toBe('home');
    expect(screen.getByText('已载入 4 张参考图 ✓')).toBeDefined();
  });

  it('reports missing images without overwriting the existing generation draft', () => {
    useAppStore.setState({ quickPrompt: '现有草稿', quickRefImages: ['existing.jpg'] });
    render(<FormattedMarkdown content={'```text\n' + code + '\n```'} referenceMedia={media.slice(0, 2)} />);
    fireEvent.click(screen.getByText('一键载入生图'));
    expect(screen.getByRole('alert').textContent).toContain('@图片19');
    expect(useAppStore.getState().quickPrompt).toBe('现有草稿');
    expect(useAppStore.getState().quickRefImages).toEqual(['existing.jpg']);
  });
});

it('references sampled collection images by their original numbers without substituting uploads', () => {
  const messages = [{ id: 'reply', role: 'assistant', timestamp: 1, content: '', task: { references: [
    { number: 2, label: '素材2', url: 'https://example.com/2.jpg' },
    { number: 41, label: '素材41', url: 'https://example.com/41.jpg' },
  ] } }] as AssistantMessage[];
  const refs = getReplyReferenceMedia(messages, 'reply');
  expect(prepareAssistantImagePrompt('@图片41 @图片2', refs)).toEqual({ prompt: '@图片1 @图片2', urls: ['https://example.com/41.jpg', 'https://example.com/2.jpg'] });
  expect(() => prepareAssistantImagePrompt('@图片1', refs)).toThrow('未找到参考图');
});

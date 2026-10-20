import { describe, expect, it } from 'vitest';
import type { AssistantMessage, GenerationTask, MediaAttachment } from '@client/store/appStoreTypes';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { extractGenerationPrompts } from '@shared/domain/assistant/generationPrompts';
import { agentPromptSource, assistantPromptSource, generationBatchContext, generationPromptSources } from './generationBatchSources';

const block = (title: string, prompt = '自然光影，商品居中') => `## ${title}\n\`\`\`image-prompt\n${prompt}\n\`\`\``;
const message = (id: string, overrides: Partial<AssistantMessage> = {}): AssistantMessage => ({
  id, role: 'assistant', content: block(id), timestamp: 1, ...overrides,
});
const task = (id: string, overrides: Partial<GenerationTask> = {}): GenerationTask => ({
  id, title: id, prompt: '', model: '', size: '', quality: '', useReferenceImage: false,
  status: 'SUCCESS', mediaType: 'agent', progress: '100%', sessionId: 'generation-session',
  agentTurn: { reply: block(id) }, ...overrides,
});
const item = (id: string, content: string): AssistantItem => ({ id, kind: 'agentMessage', content, createdAt: 1 });

function state(messages: AssistantMessage[] = [], tasks: GenerationTask[] = []) {
  return {
    assistantSessions: [{ id: 'assistant-session', title: '助手', createdAt: 1, updatedAt: 1, messages }],
    sessions: [{ id: 'generation-session', title: '生成', createdAt: 1, tasks }],
  };
}

describe('generation batch source identity and parsing', () => {
  it('joins every assistant message fragment and ignores reasoning and stale legacy text', () => {
    const first = block('封面', '商品正面，自然光影');
    const second = block('内页', '商品侧面，柔和背景');
    const reply = message('reply', { content: block('过期内容'), items: [
      item('first', ` ${first} `), { id: 'reasoning', kind: 'agentReasoning', content: block('思考过程'), collapsed: true, createdAt: 1 },
      item('empty', '  '), item('second', second),
    ] });
    const source = assistantPromptSource([reply], reply, 'assistant-session');
    expect(source.entries).toEqual(extractGenerationPrompts(`${first}\n\n${second}`));
    expect(source.entries.map(entry => entry.title)).toEqual(['封面', '内页']);
    expect(assistantPromptSource([reply], structuredClone(reply), 'assistant-session')).toEqual(source);
  });

  it('uses all agent fragments and falls back to legacy reply when fragments contain no text', () => {
    const first = block('首图'); const second = block('详情');
    const reply = task('reply', { agentTurn: { reply: block('旧版'), items: [item('a', first), item('b', second)] } });
    expect(agentPromptSource([reply], reply).entries).toEqual(extractGenerationPrompts(`${first}\n\n${second}`));
    const legacy = task('legacy', { agentTurn: { reply: first, items: [item('empty', ' ')] } });
    expect(agentPromptSource([legacy], legacy).entries).toEqual(extractGenerationPrompts(first));
  });

  it('isolates identical text by conversation, reply and surface without delimiter collisions', () => {
    const reply = message('reply:a/b', { content: block('封面') });
    const original = assistantPromptSource([reply], reply, 'session:a/b');
    const ids = [original.sourceId,
      assistantPromptSource([reply], reply, 'other-session').sourceId,
      assistantPromptSource([reply], { ...reply, id: 'other-reply' }, 'session:a/b').sourceId,
      assistantPromptSource([reply], reply, 'session:a/b:reply').sourceId,
      agentPromptSource([], task(reply.id, { sessionId: 'session:a/b', agentTurn: { reply: reply.content } })).sourceId,
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(assistantPromptSource([reply], { ...reply, content: block('改过的封面') }, 'session:a/b').sourceId).not.toBe(original.sourceId);
  });
});

describe('original reply reference media', () => {
  it('preserves sparse explicit reference slots instead of adopting a later user upload', () => {
    const reply = message('reply', { task: {
      mode: 'plan', goal: '', stage: '', deliverable: 'reply', referenceScope: 'explicit', totalReferences: 2, status: 'completed',
      references: [{ number: 3, label: '第三图', url: 'https://example.com/three.jpg' }, { number: 1, label: '第一图', url: 'https://example.com/one.jpg' }],
    } });
    const later = message('later', { role: 'user', attachments: [{ type: 'image', url: 'https://example.com/later.jpg' }] });
    const source = assistantPromptSource([reply, later], reply, 'assistant-session');
    expect(source.media).toEqual([
      { type: 'image', url: 'https://example.com/one.jpg', name: '第一图' },
      { type: 'image', url: '', name: undefined },
      { type: 'image', url: 'https://example.com/three.jpg', name: '第三图' },
    ]);
  });

  it('uses the closest earlier user media and retains mixed media ordering but excludes documents', () => {
    const media: MediaAttachment[] = [{ type: 'image', url: 'https://example.com/one.jpg' },
      { type: 'video', url: 'https://example.com/ref.mp4', thumbnailUrl: 'https://example.com/poster.jpg' },
      { type: 'image', url: 'https://example.com/two.jpg' }];
    const reply = message('reply');
    const messages = [message('older', { role: 'user', attachments: [{ type: 'image', url: 'old.jpg' }] }),
      message('input', { role: 'user', attachments: [...media, { type: 'document', url: 'notes.pdf' }] }),
      message('followup', { role: 'user', content: '继续', attachments: [] }), reply,
      message('later', { role: 'user', attachments: [{ type: 'image', url: 'later.jpg' }] })];
    expect(assistantPromptSource(messages, reply, 'assistant-session').media).toEqual(media);
  });

  it('finds agent references by creation order without mutating tasks or taking future references', () => {
    const earlier = task('earlier', { createdAt: 1, referenceImages: ['https://example.com/one.jpg', 'https://example.com/clip.mp4'] });
    const reply = task('reply', { createdAt: 2 });
    const future = task('future', { createdAt: 3, referenceImages: ['https://example.com/future.jpg'] });
    const unrelated = task('image-output', { createdAt: 2, mediaType: 'image', referenceImages: ['not-an-agent-input.jpg'] });
    const tasks = [future, reply, unrelated, earlier];
    const before = structuredClone(tasks);
    expect(agentPromptSource(tasks, reply).media).toEqual([
      { type: 'image', url: 'https://example.com/one.jpg' }, { type: 'video', url: 'https://example.com/clip.mp4' },
    ]);
    expect(tasks).toEqual(before);
  });
});

describe('completed source selection', () => {
  it('excludes failed, streaming, empty, user and current replies, and never crosses sessions', () => {
    const messages = [message('valid'), message('failed', { error: true }), message('streaming', { streamingStatus: '生成中' }),
      message('user', { role: 'user' }), message('empty', { content: '普通说明' }), message('current')];
    const sources = generationPromptSources(state(messages), 'assistant', 'assistant-session', 'current');
    expect(sources.map(source => source.replyId)).toEqual(['valid']);
    expect(generationPromptSources(state(messages), 'assistant', 'missing')).toEqual([]);
  });

  it('takes the latest eight completed agent replies chronologically and injects the owning session', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => task(`reply-${index}`, { createdAt: index, sessionId: undefined }));
    tasks.push(task('running', { createdAt: 12, status: 'IN_PROGRESS' }), task('failed', { status: 'FAILURE' }), task('current'));
    const sources = generationPromptSources(state([], tasks.reverse()), 'agent', 'generation-session', 'current');
    expect(sources.map(source => source.replyId)).toEqual(Array.from({ length: 8 }, (_, i) => `reply-${i + 2}`));
    expect(sources.every(source => source.sessionId === 'generation-session')).toBe(true);
    expect(generationPromptSources(state([], tasks), 'agent', 'missing')).toEqual([]);
  });

  it('exposes only bounded identifiers and titles in followup context, retaining legacy linkage', () => {
    const reply = message('reply', { content: Array.from({ length: 35 }, (_, i) => block(`图${i}`)).join('\n'), imageBatchSessionId: 'original-batch' });
    const source = assistantPromptSource([reply], reply, 'assistant-session');
    expect(source.legacySessionId).toBe('original-batch');
    const context = generationBatchContext([source]);
    expect(context[0].entries).toHaveLength(30);
    expect(context[0]).toEqual({ sourceId: source.sourceId, entries: source.entries.slice(0, 30).map(({ id, title, mediaType }) => ({ id, title, mediaType })) });
    expect(generationBatchContext([])).toEqual([]);
  });
});

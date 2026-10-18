import { describe, expect, it } from 'vitest';
import { isPureAgentDialogue } from './agentAssetFilter';
import { mergeAssetTasks } from './mergeAssetTasks';
import { getAssetMediaKind } from './assetMedia';
import type { GenerationTask } from '@client/store/appStoreTypes';

describe('agentAssetFilter', () => {
  it('identifies pure greeting chat turns as non-assets', () => {
    const greetingTask = {
      id: 'agent-task-1',
      mediaType: 'agent',
      prompt: '你好',
      title: '你好',
    };
    expect(isPureAgentDialogue(greetingTask)).toBe(true);
  });

  it('keeps ordinary image tasks as assets', () => {
    const imageTask = {
      id: 'hub-gen-1',
      mediaType: 'image',
      prompt: '赛博朋克猫咪',
      resultUrl: 'https://example.com/cat.png',
    };
    expect(isPureAgentDialogue(imageTask)).toBe(false);
  });

  it('keeps text-only agent tasks out of the asset library', () => {
    const deliverableTask = {
      id: 'agent-task-2',
      mediaType: 'agent',
      prompt: '帮我写一份短剧分镜方案策划',
      title: '短剧分镜方案',
    };
    expect(isPureAgentDialogue(deliverableTask)).toBe(true);
    expect(getAssetMediaKind(deliverableTask)).not.toBe('document');
  });

  it('filters pure dialogues out of mergeAssetTasks output', () => {
    const merged = mergeAssetTasks({
      dbTasks: [],
      generationTasks: [
        {
          id: 'agent-task-chat',
          mediaType: 'agent',
          prompt: '你好',
          title: '你好',
          createdAt: Date.now(),
        } as unknown as GenerationTask,
        {
          id: 'hub-gen-img',
          mediaType: 'image',
          prompt: '一只人形猫，赛博朋克风',
          resultUrl: 'https://example.com/cat.jpg',
          createdAt: Date.now(),
        } as unknown as GenerationTask,
        {
          id: 'agent-task-doc',
          mediaType: 'agent',
          prompt: '写一份微电影立项大纲方案',
          createdAt: Date.now(),
        } as unknown as GenerationTask,
      ],
      sessions: [],
      canvasTasks: [],
      mediaCategory: 'all',
      searchKeyword: '',
      timeFilter: 'all',
    });

    const ids = merged.map((t) => t.id);
    expect(ids).not.toContain('agent-task-chat');
    expect(ids).toContain('hub-gen-img');
    expect(ids).not.toContain('agent-task-doc');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPureAgentDialogue, getAssetMediaKind, agentHistoryTasks, collectProtectedAssetMedia } from './agentAssetFilter';
import { buildCanvasAssets, type AssetCanvasProject } from './canvasAssets';
import { mergeAssetTasks } from './mergeAssetTasks';
import type { CustomAssetItem } from '@client/shared/media/customAssetStorage';
import type { GenerationTask } from '@client/store/appStoreTypes';

vi.mock('@client/store/persist/generation', () => ({ isGenerationDeleted: () => false }));

afterEach(() => vi.unstubAllGlobals());

const canvas: AssetCanvasProject = { id: 'canvas-1', title: '画布', createdAt: 1, updatedAt: 2, nodes: [
  { id: 'image', type: 'image', imageUrl: '/image.png' },
  { id: 'video', type: 'video', videoUrl: '/video.mp4', imageUrl: '/video-cover.png' },
  { id: 'note', type: 'text', content: '备注不计入素材' },
] };
function merged(canvases = [canvas]) {
  return mergeAssetTasks({ dbTasks: [], generationTasks: [], sessions: [], canvasTasks: buildCanvasAssets(canvases).canvasTasks, mediaCategory: 'all', searchKeyword: '', timeFilter: 'all' });
}

describe('material projects and canvas assets', () => {
  it('includes canvas media in all mode, retaining the video URL and cover separately', () => {
    const tasks = merged();
    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => task.nodeId === 'video')).toMatchObject({ canvasProjectId: canvas.id, resultUrl: '/video.mp4', coverUrl: '/video-cover.png' });
  });

  it('does not expose an empty canvas cover as a deletable media item', () => {
    const empty = { ...canvas, nodes: [], thumbnail: '/project-cover.png' };
    expect(merged([empty])).toEqual([]);
  });
});

describe('Agent history ownership and protected media', () => {
  it('excludes explicit, legacy and session-linked canvas records including remote aliases', () => {
    const sessions = [{ id: 'linked', canvasProjectId: 'c', title: '画布', createdAt: 1, tasks: [{ id: 'local', taskId: 'remote', title: '素材', prompt: '', model: 'gpt-image-2', size: '1024x1024', quality: 'standard', progress: '100%', useReferenceImage: false, status: 'SUCCESS' as const, createdAt: 1 }] }];
    const tasks = [{ id: 'agent', sessionId: 'a' }, { id: 'direct', canvasProjectId: 'c' }, { id: 'legacy', batchId: 'canvas-project-c' }, { id: 'session', sessionId: 'canvas-session:c' }, { id: 'linked-task', sessionId: 'linked' }, { id: 'db', taskId: 'remote' }];
    expect(agentHistoryTasks(tasks, sessions).map(task => task.id)).toEqual(['agent']);
    expect(tasks).toHaveLength(6);
  });

  it('protects collected files, canvas references and old generated versions when deleting history', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example' } });
    const project = { id:'canvas', title:'项目', createdAt:1, updatedAt:1,
      nodes:[{id:'node', type:'image', imageUrl:'/storage/result.png', drawing:{references:['/storage/ref.png']}}],
      studioScene:{nodes:[{content:'https://app.example/storage/current.mp4', settings:{generationVersions:[
        {content:'/storage/first.mp4', generatedImages:[{fullUrl:'/storage/old.png'}]},
      ]}}]},
    };
    const assets = [{mediaUrl:'/storage/import.mp4', coverUrl:'/storage/cover.png'},
      {mediaUrl:'/storage/result.png'}, {mediaUrl:'blob:temporary', coverUrl:'data:image/png;base64,AA=='}] as CustomAssetItem[];
    expect(collectProtectedAssetMedia([project], assets)).toEqual([
      '/storage/result.png','/storage/ref.png','/storage/current.mp4','/storage/first.mp4','/storage/old.png',
      '/storage/import.mp4','/storage/cover.png',
    ]);
  });
});

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

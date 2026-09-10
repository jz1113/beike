import { describe, it, expect } from 'vitest';
import {
  groupTasksIntoBatches,
  filterChatSessionsByTime,
  filterGenerationTasks,
  formatDateYYMMDD,
} from '../generateWorkspaceHelpers';
import type { GenerationTask } from '@/types/app-store';

it('preserves prompt order despite different timestamps and completion states', () => {
  const tasks = [3, 1, 2].map((shotNo) => ({
    id: `shot-${shotNo}`, batchId: 'ordered', shotNo,
    prompt: `image ${shotNo}`, model: 'gpt-image-2', size: '3:4',
    createdAt: 1000 + (4 - shotNo), status: shotNo === 2 ? 'FAILURE' : 'SUCCESS',
  } as GenerationTask));
  expect(groupTasksIntoBatches(tasks)[0].tasks.map(task => task.shotNo)).toEqual([1, 2, 3]);
});

describe('generateWorkspaceHelpers 时间筛选与会话过滤逻辑', () => {
  it('formatDateYYMMDD 能够正确格式化年月日为 YY-MM-DD 紧凑格式', () => {
    const d = new Date('2026-09-05T12:00:00Z');
    expect(formatDateYYMMDD(d)).toBe('26-09-05');
  });

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;
  const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;
  const fiftyDaysAgo = now - 50 * 24 * 60 * 60 * 1000;
  const oneHundredDaysAgo = now - 100 * 24 * 60 * 60 * 1000;

  const mockSessions = [
    {
      id: 'sess-today',
      title: '今天刚聊的会话',
      createdAt: oneDayAgo,
      tasks: [
        {
          id: 't-1',
          createdAt: now, // 任务在今天出图
          prompt: '动漫美少女',
          status: 'SUCCESS' as const,
        } as GenerationTask,
      ],
    },
    {
      id: 'sess-week',
      title: '本周对话',
      createdAt: fiveDaysAgo,
      tasks: [],
    },
    {
      id: 'sess-month',
      title: '本月对话',
      createdAt: fifteenDaysAgo,
      tasks: [],
    },
    {
      id: 'sess-3months',
      title: '前两个月对话',
      createdAt: fiftyDaysAgo,
      tasks: [],
    },
    {
      id: 'sess-old',
      title: '半年前的老对话',
      createdAt: oneHundredDaysAgo,
      tasks: [],
    },
  ];

  it('filterChatSessionsByTime: 全部选项返回全部会话', () => {
    const res = filterChatSessionsByTime(mockSessions, 'all');
    expect(res).toHaveLength(5);
  });

  it('filterChatSessionsByTime: 最近一周 (7days) 过滤出 7 天内活跃的会话', () => {
    const res = filterChatSessionsByTime(mockSessions, '7days');
    const ids = res.map((s) => s.id);
    expect(ids).toContain('sess-today');
    expect(ids).toContain('sess-week');
    expect(ids).not.toContain('sess-month');
    expect(ids).not.toContain('sess-old');
  });

  it('filterChatSessionsByTime: 最近一个月 (30days) 过滤出 30 天内活跃的会话', () => {
    const res = filterChatSessionsByTime(mockSessions, '30days');
    const ids = res.map((s) => s.id);
    expect(ids).toContain('sess-today');
    expect(ids).toContain('sess-week');
    expect(ids).toContain('sess-month');
    expect(ids).not.toContain('sess-3months');
    expect(ids).not.toContain('sess-old');
  });

  it('filterChatSessionsByTime: 最近三个月 (90days) 过滤出 90 天内活跃的会话', () => {
    const res = filterChatSessionsByTime(mockSessions, '90days');
    const ids = res.map((s) => s.id);
    expect(ids).toContain('sess-today');
    expect(ids).toContain('sess-week');
    expect(ids).toContain('sess-month');
    expect(ids).toContain('sess-3months');
    expect(ids).not.toContain('sess-old');
  });

  it('filterChatSessionsByTime: custom 自定义日期范围过滤', () => {
    const startDate = new Date(twentyDaysAgoMs()).toISOString().slice(0, 10);
    const endDate = new Date(twoDaysAgoMs()).toISOString().slice(0, 10);

    function twentyDaysAgoMs() {
      return now - 20 * 24 * 60 * 60 * 1000;
    }
    function twoDaysAgoMs() {
      return now - 2 * 24 * 60 * 60 * 1000;
    }

    const res = filterChatSessionsByTime(mockSessions, 'custom', startDate, endDate);
    const ids = res.map((s) => s.id);
    expect(ids).toContain('sess-week');
    expect(ids).toContain('sess-month');
    expect(ids).not.toContain('sess-3months');
    expect(ids).not.toContain('sess-old');
  });

  it('filterGenerationTasks: 支持自定义起止日期筛选出图任务', () => {
    const tasks: GenerationTask[] = [
      {
        id: 'task-1',
        createdAt: new Date('2026-09-01T10:00:00Z').getTime(),
        prompt: '赛博朋克城市',
        status: 'SUCCESS',
      } as GenerationTask,
      {
        id: 'task-2',
        createdAt: new Date('2026-09-05T10:00:00Z').getTime(),
        prompt: '水墨山水画',
        status: 'SUCCESS',
      } as GenerationTask,
      {
        id: 'task-3',
        createdAt: new Date('2026-09-10T10:00:00Z').getTime(),
        prompt: '机甲战士',
        status: 'SUCCESS',
      } as GenerationTask,
    ];

    const res = filterGenerationTasks(tasks, {
      searchQuery: '',
      timeFilter: 'custom',
      modeFilter: 'all',
      statusFilter: 'all',
      customStartDate: '2026-09-02',
      customEndDate: '2026-09-06',
    });

    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('task-2');
  });

  it('filterGenerationTasks: 正确区分这四个生成模式（图片生成、视频生成、深度图片、深度视频）', () => {
    const tasks: GenerationTask[] = [
      { id: 'img-1', prompt: '普通图片', mediaType: 'image', status: 'SUCCESS' } as GenerationTask,
      { id: 'vid-1', prompt: '普通视频', mediaType: 'video', status: 'SUCCESS' } as GenerationTask,
      { id: 'depth-img-1', prompt: '深度图片', mediaType: 'depth-image', status: 'SUCCESS' } as GenerationTask,
      { id: 'depth-vid-1', prompt: '深度视频', mediaType: 'depth-video', status: 'SUCCESS' } as GenerationTask,
    ];

    // 1. 筛选普通图片生成
    const imgRes = filterGenerationTasks(tasks, {
      searchQuery: '',
      timeFilter: 'all',
      modeFilter: 'image',
      statusFilter: 'all',
    });
    expect(imgRes.map((t) => t.id)).toEqual(['img-1']);

    // 2. 筛选普通视频生成
    const vidRes = filterGenerationTasks(tasks, {
      searchQuery: '',
      timeFilter: 'all',
      modeFilter: 'video',
      statusFilter: 'all',
    });
    expect(vidRes.map((t) => t.id)).toEqual(['vid-1']);

    // 3. 筛选深度图片
    const depthImgRes = filterGenerationTasks(tasks, {
      searchQuery: '',
      timeFilter: 'all',
      modeFilter: 'depth-image',
      statusFilter: 'all',
    });
    expect(depthImgRes.map((t) => t.id)).toEqual(['depth-img-1']);

    // 4. 筛选深度视频
    const depthVidRes = filterGenerationTasks(tasks, {
      searchQuery: '',
      timeFilter: 'all',
      modeFilter: 'depth-video',
      statusFilter: 'all',
    });
    expect(depthVidRes.map((t) => t.id)).toEqual(['depth-vid-1']);
  });
});


describe('conversation generation rounds', () => {
  const task = (id: string, extra = {}) => ({
    id, sessionId: 'same-session', sessionTitle: '对话标题',
    title: id, prompt: 'same prompt', model: 'gpt-image-2',
    createdAt: 1000, status: 'SUCCESS', ...extra,
  } as GenerationTask);

  it('keeps tool calls and repeated generations separate even in the same session and second', () => {
    const batches = groupTasksIntoBatches([
      task('original'), task('angle', { taskType: 'multi_angle' }),
      task('edit', { taskType: 'smart_edit' }), task('again'),
    ]);
    expect(batches).toHaveLength(4);
    expect(batches.every((batch) => batch.tasks.length === 1)).toBe(true);
    expect(batches.map((batch) => batch.title)).toEqual(['original', 'angle', 'edit', 'again']);
  });

  it('only arranges images together when they share a submission batch', () => {
    const batches = groupTasksIntoBatches([
      task('one', { batchId: 'submission-1' }), task('two', { batchId: 'submission-1' }),
      task('three', { batchId: 'submission-2' }), task('angle', { taskType: 'multi_angle' }),
    ]);
    expect(batches).toHaveLength(3);
    expect(batches.find((batch) => batch.batchId === 'submission-1')?.tasks.map((item) => item.id)).toEqual(['one', 'two']);
  });
});

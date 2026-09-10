import { describe, it, expect } from 'vitest';
import { groupTasksIntoBatches } from '../taskBatchGrouping';

describe('taskBatchGrouping 会话聚合与命名测试', () => {
  it('同一会话中多次生成的任务，即便跨越超长时间（>90秒），也必须聚合进同一个文件夹', () => {
    const tasks = [
      {
        id: 'task-1',
        sessionId: 'sess-anime-100',
        sessionTitle: '动漫原画群像，内容一切随机',
        prompt: '动漫原画群像，内容一切随机 第1张',
        resultUrl: 'https://example.com/img1.jpg',
        createdAt: '2026-09-05T10:00:00.000Z',
      },
      {
        id: 'task-2',
        sessionId: 'sess-anime-100',
        sessionTitle: '动漫原画群像，内容一切随机',
        prompt: '动漫原画群像，内容一切随机 第2张',
        resultUrl: 'https://example.com/img2.jpg',
        createdAt: '2026-09-05T10:00:05.000Z',
      },
      // 几小时后用户继续在同一个会话中追问/再次生成
      {
        id: 'task-3',
        sessionId: 'sess-anime-100',
        sessionTitle: '动漫原画群像，内容一切随机',
        prompt: '多角度视角转换(机位: 129° / 0)',
        resultUrl: 'https://example.com/img3.jpg',
        createdAt: '2026-09-05T14:30:00.000Z',
      },
    ];

    const batches = groupTasksIntoBatches(tasks);

    expect(batches).toHaveLength(1);
    expect(batches[0].batchId).toBe('session_sess-anime-100');
    expect(batches[0].tasks).toHaveLength(3);
    // 文件夹名称直接使用对话名称
    expect(batches[0].title).toBe('动漫原画群像，内容一切随机');
  });

  it('不同会话的任务应各自聚合进对应的文件夹，且分别以各自的对话名称命名', () => {
    const tasks = [
      {
        id: 'task-a1',
        sessionId: 'sess-a',
        sessionTitle: '赛博朋克霓虹街道',
        prompt: '赛博朋克夜景',
        resultUrl: 'https://example.com/cyber1.jpg',
        createdAt: '2026-09-05T10:00:00.000Z',
      },
      {
        id: 'task-b1',
        sessionId: 'sess-b',
        sessionTitle: '国风水墨山水画卷',
        prompt: '水墨山水',
        resultUrl: 'https://example.com/ink1.jpg',
        createdAt: '2026-09-05T10:01:00.000Z',
      },
      {
        id: 'task-a2',
        sessionId: 'sess-a',
        sessionTitle: '赛博朋克霓虹街道',
        prompt: '赛博朋克雨夜特写',
        resultUrl: 'https://example.com/cyber2.jpg',
        createdAt: '2026-09-05T10:05:00.000Z',
      },
    ];

    const batches = groupTasksIntoBatches(tasks);

    expect(batches).toHaveLength(2);

    const batchA = batches.find((b) => b.batchId === 'session_sess-a');
    const batchB = batches.find((b) => b.batchId === 'session_sess-b');

    expect(batchA).toBeDefined();
    expect(batchA?.title).toBe('赛博朋克霓虹街道');
    expect(batchA?.tasks).toHaveLength(2);

    expect(batchB).toBeDefined();
    expect(batchB?.title).toBe('国风水墨山水画卷');
    expect(batchB?.tasks).toHaveLength(1);
  });

  it('当任务没有 sessionId 时，应安全降级回 batchId 或基于时间的启发式聚类', () => {
    const legacyTasks = [
      {
        id: 'legacy-1',
        batchId: 'batch-xyz',
        title: '老版本批量任务',
        prompt: '散客图片1',
        createdAt: 10000,
      },
      {
        id: 'legacy-2',
        batchId: 'batch-xyz',
        title: '老版本批量任务',
        prompt: '散客图片2',
        createdAt: 15000,
      },
    ];

    const batches = groupTasksIntoBatches(legacyTasks);
    expect(batches).toHaveLength(1);
    expect(batches[0].batchId).toBe('batch-xyz');
    expect(batches[0].tasks).toHaveLength(2);
  });
});

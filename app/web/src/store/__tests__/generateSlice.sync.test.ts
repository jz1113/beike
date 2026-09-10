import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';
import type { GenerationTask } from '@/types/app-store';

describe('generateSlice — 任务状态多键同步与会话更新 (syncDatabaseTasks)', () => {
  beforeEach(() => {
    // 重置状态
    useAppStore.setState({
      sessions: [
        {
          id: 'session-test-1',
          title: '视频测试会话',
          createdAt: Date.now(),
          tasks: [],
        },
      ],
      currentSessionId: 'session-test-1',
      generationTasks: [],
    });
  });

  it('客户端临时 ID 任务在服务端完成后，通过 taskId 精准合并 SUCCESS 状态并更新当前会话', () => {
    const clientTempId = 'task-client-123456';
    const remoteGatewayTaskId = '2096845789170372609';
    const ossVideoUrl = 'https://jinzhuo.oss-cn-beijing.aliyuncs.com/azhuo/generated/videos/202609/test_video.mp4';

    // 1. 模拟客户端刚刚提交视频任务，会话和全局生成池持有临时 ID
    const initialClientTask: GenerationTask = {
      id: clientTempId,
      taskId: remoteGatewayTaskId,
      sessionId: 'session-test-1',
      prompt: '千禧风视频',
      mediaType: 'video',
      status: 'IN_PROGRESS',
      progress: '60%',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      sessions: [
        {
          id: 'session-test-1',
          title: '视频测试会话',
          createdAt: Date.now(),
          tasks: [initialClientTask],
        },
      ],
      currentSessionId: 'session-test-1',
      generationTasks: [initialClientTask],
    });

    // 2. 模拟服务端异步完成，通过 /api/assets/tasks 返回数据库实体 (id 为服务端主键)
    const serverDbTask: GenerationTask = {
      id: 'cmtquonr300054gi61a9efiog', // 数据库主键
      taskId: remoteGatewayTaskId,      // 网关 ID 一致
      status: 'SUCCESS',
      resultUrl: ossVideoUrl,
      mediaType: 'video',
      progress: '100%',
      failReason: '服务重启，未完成的任务已自动终止', // 模拟历史残留的失败原因
      createdAt: Date.now(),
    };

    // 执行状态同步
    useAppStore.getState().syncDatabaseTasks([serverDbTask]);

    const state = useAppStore.getState();

    // 3. 验证全局 generationTasks 已成功合并并净化
    const mergedGlobalTask = state.generationTasks.find((t) => t.taskId === remoteGatewayTaskId);
    expect(mergedGlobalTask).toBeDefined();
    expect(mergedGlobalTask?.status).toBe('SUCCESS');
    expect(mergedGlobalTask?.resultUrl).toBe(ossVideoUrl);
    expect(mergedGlobalTask?.progress).toBe('100%');
    expect(mergedGlobalTask?.failReason).toBeUndefined(); // 成功时自动清除历史误报 failReason
    expect(mergedGlobalTask?.id).toBe(clientTempId);      // 保持客户端 ID 稳定，组件 key 不跳动

    // 4. 关键断言：当前激活会话中的 tasks 必须被实时更新，界面卡片才能从 60% 变为播放视频！
    const currentSession = state.sessions.find((s) => s.id === 'session-test-1');
    const sessionTask = currentSession?.tasks.find((t) => t.id === clientTempId);
    expect(sessionTask).toBeDefined();
    expect(sessionTask?.status).toBe('SUCCESS');
    expect(sessionTask?.resultUrl).toBe(ossVideoUrl);
    expect(sessionTask?.progress).toBe('100%');
    expect(sessionTask?.failReason).toBeUndefined();
  });
});

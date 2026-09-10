// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GenerateSessionThumbnail } from '../../GenerateSessionThumbnail';
import { useAppStore, type ChatSession, type GenerationTask } from '@/store/useAppStore';

describe('GenerateSessionThumbnail', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      currentSessionId: 'sess-active',
      generationTasks: [],
    });
  });

  it('会话有成功生成图片时，正确渲染 3:4 竖向封面图片', () => {
    const mockSess: ChatSession = {
      id: 'sess-1',
      title: '动漫随机原画群像',
      createdAt: Date.now(),
      tasks: [
        {
          id: 'task-1',
          prompt: '动漫群像',
          status: 'SUCCESS',
          resultUrl: 'https://example.com/anime.jpg',
        } as GenerationTask,
      ],
    };

    render(<GenerateSessionThumbnail sess={mockSess} isSelected={false} />);

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringContaining('anime.jpg'));
  });

  it('当前活跃会话从全局 generationTasks 同步所属任务的最新出图状态，且绝不被其他无关任务污染', () => {
    const mockSess: ChatSession = {
      id: 'sess-active',
      title: '当前对话',
      createdAt: Date.now(),
      tasks: [
        {
          id: 'task-live',
          prompt: '动漫群像',
          status: 'IN_PROGRESS',
        } as GenerationTask,
      ],
    };

    useAppStore.setState({
      currentSessionId: 'sess-active',
      generationTasks: [
        // 模拟全局任务中排在第一位的是其他会话的“深度动作捕捉”
        {
          id: 'task-other-depth',
          prompt: '深度动作捕捉',
          status: 'SUCCESS',
          resultUrl: 'https://example.com/depth.jpg',
        } as GenerationTask,
        // 全局任务中同步更新了本会话的 task-live
        {
          id: 'task-live',
          prompt: '动漫群像',
          status: 'SUCCESS',
          resultUrl: 'https://example.com/anime-result.jpg',
        } as GenerationTask,
      ],
    });

    render(<GenerateSessionThumbnail sess={mockSess} isSelected={true} />);

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    // 必须匹配本会话的动漫出图，绝对不能被排在前面的深度动作捕捉污染！
    expect(img).toHaveAttribute('src', expect.stringContaining('anime-result.jpg'));
    expect(img).not.toHaveAttribute('src', expect.stringContaining('depth.jpg'));
  });

  it('无图片会话时，渲染图 2 同款消息气泡占位卡片', () => {
    const mockSess: ChatSession = {
      id: 'sess-empty',
      title: '图中角色随音频深情..',
      createdAt: Date.now(),
      tasks: [],
    };

    const { container } = render(<GenerateSessionThumbnail sess={mockSess} isSelected={false} />);

    // 不应有 img 标签
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // 应当有 1:1 正方形圆角卡片容器与 svg 消息气泡
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('w-11', 'h-11');
  });

  it('会话有多个任务时，优先选取最新成功生成的任务图片', () => {
    const mockSess: ChatSession = {
      id: 'sess-multi',
      title: '多次生成会话',
      createdAt: 1000,
      tasks: [
        {
          id: 'task-old',
          prompt: '早先生成的旧图',
          status: 'SUCCESS',
          resultUrl: 'https://example.com/old-result.jpg',
          createdAt: 1000,
        } as GenerationTask,
        {
          id: 'task-newest',
          prompt: '最新生成的群像图',
          status: 'SUCCESS',
          resultUrl: 'https://example.com/newest-result.jpg',
          createdAt: 5000,
        } as GenerationTask,
      ],
    };

    render(<GenerateSessionThumbnail sess={mockSess} isSelected={false} />);

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringContaining('newest-result.jpg'));
  });

  it('会话出图尚未完成时，降级展示最新任务携带的参考图', () => {
    const mockSess: ChatSession = {
      id: 'sess-ref',
      title: '参考图任务',
      createdAt: 1000,
      tasks: [
        {
          id: 'task-ref',
          prompt: '基于参考图生图',
          status: 'IN_PROGRESS',
          referenceImageUrl: 'https://example.com/ref-input.jpg',
          createdAt: 1000,
        } as GenerationTask,
      ],
    };

    render(<GenerateSessionThumbnail sess={mockSess} isSelected={false} />);

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringContaining('ref-input.jpg'));
  });

  it('视频出图时正确渲染视频海报与 Film 标识', () => {
    const mockSess: ChatSession = {
      id: 'sess-video',
      title: '视频生成',
      createdAt: 1000,
      tasks: [
        {
          id: 'task-video',
          prompt: '视频片段',
          status: 'SUCCESS',
          mediaType: 'video',
          resultUrl: 'https://example.com/generated-clip.mp4',
          createdAt: 1000,
        } as GenerationTask,
      ],
    };

    const { container } = render(<GenerateSessionThumbnail sess={mockSess} isSelected={false} />);

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', expect.stringContaining('generated-clip.mp4'));
  });
});

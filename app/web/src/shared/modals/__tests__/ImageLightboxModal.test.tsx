// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ImageLightboxModal } from '../ImageLightboxModal';
import { useAppStore } from '@/store/useAppStore';

describe('ImageLightboxModal', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      previewTask: null,
      previewQueue: [],
    });
  });

  it('当 previewTask 为 null 时，弹窗不显示内容', () => {
    render(<ImageLightboxModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('当 previewTask 有值时，成功渲染大图预览且不触发 ReferenceError 异常', () => {
    const mockTask = {
      id: 'task-1',
      prompt: '测试高清图生成',
      resultUrl: 'https://example.com/generated-image.jpg',
      status: 'SUCCESS' as const,
      model: 'doubao-seedream-4-5',
      aspectRatio: '1:1',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      previewTask: mockTask as any,
    });

    // 渲染不会因为 setShowMoreMenu 报错抛出异常
    expect(() => {
      render(<ImageLightboxModal />);
    }).not.toThrow();

    // 提示词或者图片应该被成功渲染
    expect(screen.getByText('测试高清图生成')).toBeInTheDocument();

    // 确认已不再渲染多余的关注按钮
    expect(screen.queryByText('+ 关注')).not.toBeInTheDocument();
    expect(screen.queryByText('已关注')).not.toBeInTheDocument();

    // 确认已不再渲染多余的垂直上下切换按键
    expect(screen.queryByTitle('上一张 (↑ 或 ←)')).not.toBeInTheDocument();
    expect(screen.queryByTitle('下一张 (↓ 或 →)')).not.toBeInTheDocument();

    // 按下 ESC 键可以正常退出大图
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useAppStore.getState().previewTask).toBeNull();
  });

  it('多图模式下，左右翻页按钮渲染在大图外侧两侧并能正常切换', () => {
    const task1 = {
      id: 'task-1',
      prompt: '图1提示词',
      resultUrl: 'https://example.com/image-1.jpg',
      status: 'SUCCESS' as const,
      model: 'doubao-seedream-4-5',
      createdAt: Date.now(),
    };
    const task2 = {
      id: 'task-2',
      prompt: '图2提示词',
      resultUrl: 'https://example.com/image-2.jpg',
      status: 'SUCCESS' as const,
      model: 'doubao-seedream-4-5',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      previewTask: task1 as any,
      previewQueue: [task1, task2] as any,
    });

    render(<ImageLightboxModal />);

    // 验证上一张和下一张外侧翻页按钮存在
    const prevBtn = screen.getByTitle('上一张 (←)');
    const nextBtn = screen.getByTitle('下一张 (→)');
    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();

    // 验证大图正下方仅展示数量胶囊，不提供切换按键
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.queryByTitle('底栏上一张')).not.toBeInTheDocument();
    expect(screen.queryByTitle('底栏下一张')).not.toBeInTheDocument();

    // 点击下一张
    fireEvent.click(nextBtn);
    expect(useAppStore.getState().previewTask?.id).toBe('task-2');
  });

  it('在资产中心或非生图模式下：右侧完全对齐图1（贝壳云图、下载、点赞、提示词、规格、做同款、用作参考图），不显示图2扩展工具箱', () => {
    const mockTask = {
      id: 'task-1',
      prompt: '动漫原画群像，内容一切随机',
      resultUrl: 'https://example.com/anime.jpg',
      status: 'SUCCESS' as const,
      model: 'doubao-seedream-5-0-lite',
      size: '768x1024',
      quality: '2K',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      currentView: 'assets',
      previewTask: mockTask as any,
      previewQueue: [mockTask] as any,
    });

    const { container } = render(<ImageLightboxModal />);

    // 1. 大图区核心元素：保留AI生成
    expect(screen.getByText('AI生成')).toBeInTheDocument();

    // 2. 右侧信息卡片（1:1 对齐图 1）
    expect(screen.getByText('贝壳云图')).toBeInTheDocument();
    expect(screen.getByTitle('下载高清原图')).toBeInTheDocument();
    expect(screen.getByText(/内容由 AI 生成/)).toBeInTheDocument();
    expect(screen.getByText('图片提示词')).toBeInTheDocument();
    expect(screen.getByText('动漫原画群像，内容一切随机')).toBeInTheDocument();
    expect(screen.getByText('做同款')).toBeInTheDocument();
    expect(screen.getByText('用作参考图')).toBeInTheDocument();

    // 3. 严格断言：资产模式下不渲染图 2 工具箱扩展区域
    expect(screen.queryByText('生成视频')).not.toBeInTheDocument();
    expect(screen.queryByText('去画布编辑')).not.toBeInTheDocument();
    expect(screen.queryByText('智能超清')).not.toBeInTheDocument();
    expect(screen.queryByText('多角度')).not.toBeInTheDocument();
    expect(screen.queryByText('智能改图')).not.toBeInTheDocument();
    expect(screen.queryByText('细节修复')).not.toBeInTheDocument();
    expect(screen.queryByText('扩图')).not.toBeInTheDocument();
    expect(screen.queryByText('消除笔')).not.toBeInTheDocument();
    expect(screen.queryByText('对口型')).not.toBeInTheDocument();
    expect(screen.queryByText('重新编辑')).not.toBeInTheDocument();
    expect(screen.queryByText('再次生成')).not.toBeInTheDocument();

    // 点击最外层遮罩空白区域退出大图全屏
    const overlay = container.firstChild as HTMLElement;
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay);
    expect(useAppStore.getState().previewTask).toBeNull();
  });

  it('在生产对话生图界面（currentView === generate）：右侧上方为图1卡片，且额外展示图2扩展工具箱矩阵', () => {
    const mockTask = {
      id: 'task-gen-1',
      prompt: '高级日式禅意甜品海报，竖版商业美食海报',
      resultUrl: 'https://example.com/sweet.jpg',
      status: 'SUCCESS' as const,
      model: 'doubao-seedream-5-0-lite',
      size: '768x1024',
      quality: '2K',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      currentView: 'generate',
      previewTask: mockTask as any,
      previewQueue: [mockTask] as any,
    });

    render(<ImageLightboxModal />);

    // 1. 确认图 1 主卡片正常呈现
    expect(screen.getByText('贝壳云图')).toBeInTheDocument();
    expect(screen.getByTitle('下载高清原图')).toBeInTheDocument();
    expect(screen.getByText('做同款')).toBeInTheDocument();

    // 2. 确认仅展示保留的工具箱模块
    expect(screen.getByText('多角度')).toBeInTheDocument();
    expect(screen.getByText('智能改图')).toBeInTheDocument();
    expect(screen.getByText('扩图')).toBeInTheDocument();
    expect(screen.getByText('重新编辑')).toBeInTheDocument();
    expect(screen.getByText('再次生成')).toBeInTheDocument();

    // 确认已删除的不必要功能（包括已移除的消除笔）完全不再渲染
    expect(screen.queryByText('消除笔')).not.toBeInTheDocument();
    expect(screen.queryByText('细节修复')).not.toBeInTheDocument();
    expect(screen.queryByText('生成视频')).not.toBeInTheDocument();
    expect(screen.queryByText('去画布编辑')).not.toBeInTheDocument();
    expect(screen.queryByText('智能超清')).not.toBeInTheDocument();
    expect(screen.queryByText('超清')).not.toBeInTheDocument();
    expect(screen.queryByText('对口型')).not.toBeInTheDocument();

    // 3. 验证点击「多角度」弹出子模态框
    fireEvent.click(screen.getByText('多角度'));
    expect(screen.getByText('多角度编辑')).toBeInTheDocument();
  });

  it('点击「做同款」与「用作参考图」正确注入提示词/参考图并跳转生图视图关闭大图', () => {
    const mockTask = {
      id: 'task-action',
      prompt: 'KUMO KUMO CHEESE 抹茶海报',
      resultUrl: 'https://example.com/kumo.jpg',
      status: 'SUCCESS' as const,
      model: 'doubao-seedream-4-5',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      currentView: 'assets',
      previewTask: mockTask as any,
      quickPrompt: '',
      quickRefImage: null,
    });

    render(<ImageLightboxModal />);

    // 点击做同款
    const doSameBtn = screen.getByText('做同款');
    fireEvent.click(doSameBtn);

    expect(useAppStore.getState().quickPrompt).toBe('KUMO KUMO CHEESE 抹茶海报');
    expect(useAppStore.getState().currentView).toBe('generate');
    expect(useAppStore.getState().previewTask).toBeNull();
  });

  it('点击「多角度」并在子弹窗中点击生成，成功创建并派发多角度生图任务到 generationTasks', () => {
    const mockTask = {
      id: 'task-novel-view',
      prompt: '动漫原画群像，内容一切随机',
      resultUrl: 'https://example.com/anime.jpg',
      status: 'SUCCESS' as const,
      model: 'gpt-image-2',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      currentView: 'generate',
      previewTask: mockTask as any,
      generationTasks: [],
    });

    render(<ImageLightboxModal />);

    // 1. 点击多角度按钮打开子模态框
    fireEvent.click(screen.getByText('多角度'));
    expect(screen.getByText('多角度编辑')).toBeInTheDocument();

    // 2. 选择“右视”机位预设 (90° / 0°)
    fireEvent.click(screen.getByText('右视'));

    // 3. 点击提交生成按钮（正常的提交按钮，不含数字与符号）
    const submitBtn = screen.getByRole('button', { name: '生成' });
    expect(submitBtn).toBeInTheDocument();
    fireEvent.click(submitBtn);

    // 4. 验证生成任务已派发到 store
    const tasks = useAppStore.getState().generationTasks;
    expect(tasks.length).toBe(1);

    const dispatchedTask = tasks[0];
    expect(dispatchedTask.title).toContain('多角度视角转换(右视)');
    expect(dispatchedTask.useReferenceImage).toBe(true);
    expect(dispatchedTask.referenceImageUrl).toBe('https://example.com/anime.jpg');
    expect(dispatchedTask.status).toBe('IN_PROGRESS');

    // 5. 验证提示词经过 multiAngle 引擎构建，包含空间透视重构与单画幅硬约束
    expect(dispatchedTask.prompt).toContain('【全新单视角摄影转换】');
    expect(dispatchedTask.prompt).toContain('【空间透视重构】');
    expect(dispatchedTask.prompt).toContain('彻底打破原图原有的平视正面机位');
    expect(dispatchedTask.prompt).toContain('【单幅画面硬性约束】');
    expect(dispatchedTask.prompt).toContain('绝对严禁九宫格拼图');
    expect(dispatchedTask.prompt).toContain('动漫原画群像，内容一切随机');

    // 6. 验证大图已关闭并跳转生图视图
    expect(useAppStore.getState().previewTask).toBeNull();
    expect(useAppStore.getState().currentView).toBe('generate');
  });

  it('当 previewTask 为视频任务时，正确渲染带有代理源与原生控件的 video 标签', () => {
    const videoTask = {
      id: 'depth_video_123',
      title: '深度动作捕捉',
      prompt: '深度动作捕捉',
      resultUrl: 'https://example.com/videos/output.mp4',
      status: 'SUCCESS' as const,
      model: 'video-depth-anything',
      mediaType: 'depth-video',
      aspectRatio: '3:4',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      previewTask: videoTask as any,
    });

    const { container } = render(<ImageLightboxModal />);

    // 验证渲染出 video 元素
    const videoEl = container.querySelector('video');
    expect(videoEl).toBeInTheDocument();
    expect(videoEl).toHaveAttribute('controls');
    expect(videoEl).toHaveAttribute('playsinline');
    // 验证走 proxy-image 代理且带有 as=video 标记
    const src = videoEl?.getAttribute('src') || '';
    expect(src).toContain('/api/system/proxy-image');
    expect(src).toContain('as=video');
  });

  it('当任务包含参考素材时，正确渲染微资产卡片与现代参数规格胶囊，且支持点击查看原图', () => {
    const originalOpen = window.open;
    const mockOpen = vi.fn();
    window.open = mockOpen;

    const taskWithRef = {
      id: 'task-with-ref',
      prompt: '大红樱桃特写，真实质感',
      resultUrl: 'https://example.com/cherry-result.jpg',
      referenceImages: ['https://example.com/cherry-ref.jpg'],
      status: 'SUCCESS' as const,
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      quality: '4K',
      createdAt: Date.now(),
    };

    useAppStore.setState({
      previewTask: taskWithRef as any,
    });

    render(<ImageLightboxModal />);

    expect(screen.queryByText('参考素材')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '参考图' })).toBeInTheDocument();

    // 2. 验证 1:1 对齐图1的无边框内联参数规格条 (纯文本+竖线分割，无边框胶囊)
    expect(screen.getByText('GPT Image 2')).toBeInTheDocument();
    expect(screen.getByText('3:4')).toBeInTheDocument();
    expect(screen.getByText('4K')).toBeInTheDocument();

    // 3. 验证点击卡片调用 window.open 打开原图
    const card = screen.getByTitle('点击在新窗口查看参考素材原图');
    fireEvent.click(card);
    expect(mockOpen).toHaveBeenCalledWith('https://example.com/cherry-ref.jpg', '_blank', 'noopener,noreferrer');

    window.open = originalOpen;
  });

  it('翻页至批次中缺失自身素材字段的子任务时（如4/6），参考素材微卡片依然稳健展现且标签与提示词@图片4对齐', () => {
    const originalOpen = window.open;
    const mockOpen = vi.fn();
    window.open = mockOpen;

    const task1 = {
      id: 'task-batch-1',
      batchId: 'batch-raspberry-001',
      prompt: '成熟饱满的树莓，果实外观、深红色泽和表皮光泽参考@图片4；特写微距镜头',
      resultUrl: 'https://example.com/raspberry-1.jpg',
      referenceImages: [
        'https://example.com/ref-raspberry-1.jpg',
        'https://example.com/ref-raspberry-2.jpg',
        'https://example.com/ref-raspberry-3.jpg',
        'https://example.com/ref-raspberry-4.jpg',
      ],
      status: 'SUCCESS' as const,
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      quality: '4K',
      createdAt: Date.now(),
    };

    const task4 = {
      id: 'task-batch-4',
      batchId: 'batch-raspberry-001',
      prompt: '成熟饱满的树莓，果实外观、深红色泽和表皮光泽参考@图片4；特写微距镜头',
      resultUrl: 'https://example.com/raspberry-4.jpg',
      referenceImages: undefined,
      referenceImageUrl: undefined,
      images: undefined,
      status: 'SUCCESS' as const,
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      quality: '4K',
      createdAt: Date.now() + 3000,
    };

    useAppStore.setState({
      previewTask: task1 as any,
      previewQueue: [task1, task4] as any,
      generationTasks: [task1, task4] as any,
    });

    render(<ImageLightboxModal />);

    // 初始展示 task1，拥有 4 个参考素材
    expect(screen.queryByText('参考素材')).not.toBeInTheDocument();

    expect(screen.getByText('@图片4')).toBeInTheDocument();

    // 点击翻页按钮切换到 task4
    const nextBtn = screen.getByTitle('下一张 (→)');
    fireEvent.click(nextBtn);

    // 验证 previewTask 已经切换至 task4
    expect(useAppStore.getState().previewTask?.id).toBe('task-batch-4');

    // 核心断言：切换到 task4 后，“参考素材 (4)” 与 “@图片4” 依旧稳健展示，没有消失！
    expect(screen.queryByText('参考素材')).not.toBeInTheDocument();

    expect(screen.getByText('@图片1')).toBeInTheDocument();
    expect(screen.getByText('@图片2')).toBeInTheDocument();
    expect(screen.getByText('@图片3')).toBeInTheDocument();
    expect(screen.getByText('@图片4')).toBeInTheDocument();

    window.open = originalOpen;
  });
  it('从视频元数据读取真实时长，更新时长且切换视频不串值', () => {
    const task = { id: 'duration-a', prompt: '深度动作捕捉', mediaType: 'depth-video',
      model: 'video-depth-anything', status: 'SUCCESS', resultUrl: 'https://example.com/a.mp4' };
    useAppStore.setState({ previewTask: task as any });
    const { container } = render(<ImageLightboxModal />);
    expect(screen.queryByText('5s')).not.toBeInTheDocument();
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 9, configurable: true });
    fireEvent.loadedMetadata(video);
    expect(screen.getByText('9s')).toBeInTheDocument();
    Object.defineProperty(video, 'duration', { value: 9.4, configurable: true });
    fireEvent.durationChange(video);
    expect(screen.getByText('9.4s')).toBeInTheDocument();
    act(() => useAppStore.setState({ previewTask: { ...task, id: 'duration-b', resultUrl: 'https://example.com/b.mp4' } as any }));
    expect(screen.queryByText('9.4s')).not.toBeInTheDocument();
    const nextVideo = container.querySelector('video')!;
    Object.defineProperty(nextVideo, 'duration', { value: Infinity, configurable: true });
    fireEvent.loadedMetadata(nextVideo);
    expect(screen.queryByText('Infinitys')).not.toBeInTheDocument();
    Object.defineProperty(nextVideo, 'duration', { value: 12, configurable: true });
    fireEvent.loadedMetadata(nextVideo);
    expect(screen.getByText('12s')).toBeInTheDocument();
  });
  it('实际视频时长覆盖生成参数中的计划时长', () => {
    useAppStore.setState({ previewTask: { id: 'duration-plan', prompt: '视频', mediaType: 'video',
      status: 'SUCCESS', videoDuration: 5, resultUrl: 'https://example.com/actual.mp4' } as any });
    const { container } = render(<ImageLightboxModal />);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 9, configurable: true });
    fireEvent.loadedMetadata(video);
    expect(screen.getByText('9s')).toBeInTheDocument();
    expect(screen.queryByText('5s')).not.toBeInTheDocument();
  });

});



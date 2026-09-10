// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PromptBarRefMediaPanel from '../components/prompt-bar/media/PromptBarRefMediaPanel';

describe('PromptBarRefMediaPanel 点击放大查看素材功能测试', () => {
  beforeEach(() => {
    cleanup();
  });

  const mockImages = [
    'https://example.com/ref1.jpg',
    'https://example.com/ref2.jpg',
    'https://example.com/ref3.jpg',
  ];

  it('展开面板模式下，点击卡片能唤起高清大图放大预览灯箱', () => {
    const handleRemove = vi.fn();
    const handleSetExpanded = vi.fn();

    render(
      <PromptBarRefMediaPanel
        quickGenMode="image"
        quickVideoRefMode="omni"
        quickVideoFirstFrame={null}
        quickVideoLastFrame={null}
        quickVideoMultiFrames={[]}
        quickRefImages={mockImages}
        isExpandedRefImages={true}
        setIsExpandedRefImages={handleSetExpanded}
        setQuickVideoFirstFrame={vi.fn()}
        setQuickVideoLastFrame={vi.fn()}
        swapVideoFirstLastFrames={vi.fn()}
        removeQuickVideoMultiFrame={vi.fn()}
        removeQuickRefImage={handleRemove}
        onUploadClick={vi.fn()}
        onFirstFrameClick={vi.fn()}
        onLastFrameClick={vi.fn()}
        onMultiFrameClick={vi.fn()}
        refImagesContainerRef={{ current: null }}
        onMouseEnterRefImages={vi.fn()}
        onMouseLeaveRefImages={vi.fn()}
      />
    );

    // 获取展开面板里的卡片
    const cards = screen.getAllByTitle('点击放大查看素材');
    expect(cards.length).toBe(3);

    // 点击第一张卡片
    fireEvent.click(cards[0]);

    // 验证灯箱已弹出并展示切换控件
    expect(screen.getByTitle('上一张 (←)')).toBeDefined();

    // 按 Esc 键退出沉浸全屏
    fireEvent.keyDown(window, { key: 'Escape' });

    // 验证灯箱已关闭
    expect(screen.queryByTitle('上一张 (←)')).toBeNull();
  });

  it('点击卡片上的删除按钮时，调用删除并阻止冒泡，不触发放大预览', () => {
    const handleRemove = vi.fn();

    render(
      <PromptBarRefMediaPanel
        quickGenMode="image"
        quickVideoRefMode="omni"
        quickVideoFirstFrame={null}
        quickVideoLastFrame={null}
        quickVideoMultiFrames={[]}
        quickRefImages={mockImages}
        isExpandedRefImages={true}
        setIsExpandedRefImages={vi.fn()}
        setQuickVideoFirstFrame={vi.fn()}
        setQuickVideoLastFrame={vi.fn()}
        swapVideoFirstLastFrames={vi.fn()}
        removeQuickVideoMultiFrame={vi.fn()}
        removeQuickRefImage={handleRemove}
        onUploadClick={vi.fn()}
        onFirstFrameClick={vi.fn()}
        onLastFrameClick={vi.fn()}
        onMultiFrameClick={vi.fn()}
        refImagesContainerRef={{ current: null }}
        onMouseEnterRefImages={vi.fn()}
        onMouseLeaveRefImages={vi.fn()}
      />
    );

    const deleteBtns = screen.getAllByTitle('删除此素材');
    expect(deleteBtns.length).toBe(3);

    // 点击第一张卡片的删除按钮
    fireEvent.click(deleteBtns[0]);

    // 触发了删除回调
    expect(handleRemove).toHaveBeenCalledWith(0);

    // 未触发灯箱打开
    expect(screen.queryByAltText('参考素材-1')).toBeNull();
  });

  it('折叠态下点击首张卡片可直接唤起高清素材放大预览灯箱', () => {
    const twoImages = [
      'https://example.com/one.jpg',
      'https://example.com/two.jpg',
    ];

    render(
      <PromptBarRefMediaPanel
        quickGenMode="image"
        quickVideoRefMode="omni"
        quickVideoFirstFrame={null}
        quickVideoLastFrame={null}
        quickVideoMultiFrames={[]}
        quickRefImages={twoImages}
        isExpandedRefImages={false}
        setIsExpandedRefImages={vi.fn()}
        setQuickVideoFirstFrame={vi.fn()}
        setQuickVideoLastFrame={vi.fn()}
        swapVideoFirstLastFrames={vi.fn()}
        removeQuickVideoMultiFrame={vi.fn()}
        removeQuickRefImage={vi.fn()}
        onUploadClick={vi.fn()}
        onFirstFrameClick={vi.fn()}
        onLastFrameClick={vi.fn()}
        onMultiFrameClick={vi.fn()}
        refImagesContainerRef={{ current: null }}
        onMouseEnterRefImages={vi.fn()}
        onMouseLeaveRefImages={vi.fn()}
      />
    );

    const cards = screen.getAllByTitle('点击放大查看素材');
    expect(cards.length).toBe(1);

    // 点击首张封面卡片
    fireEvent.click(cards[0]);

    // 验证灯箱弹出并展示切换控件
    expect(screen.getByTitle('上一张 (←)')).toBeDefined();
  });

  it('空态下（未上传素材），卡片向左自然微倾斜(-rotate-[6deg])，并展示加号与“参考内容”文字', () => {
    const onUploadClick = vi.fn();

    render(
      <PromptBarRefMediaPanel
        quickGenMode="image"
        quickVideoRefMode="omni"
        quickVideoFirstFrame={null}
        quickVideoLastFrame={null}
        quickVideoMultiFrames={[]}
        quickRefImages={[]}
        isExpandedRefImages={false}
        setIsExpandedRefImages={vi.fn()}
        setQuickVideoFirstFrame={vi.fn()}
        setQuickVideoLastFrame={vi.fn()}
        swapVideoFirstLastFrames={vi.fn()}
        removeQuickVideoMultiFrame={vi.fn()}
        removeQuickRefImage={vi.fn()}
        onUploadClick={onUploadClick}
        onFirstFrameClick={vi.fn()}
        onLastFrameClick={vi.fn()}
        onMultiFrameClick={vi.fn()}
        refImagesContainerRef={{ current: null }}
        onMouseEnterRefImages={vi.fn()}
        onMouseLeaveRefImages={vi.fn()}
      />
    );

    const emptyBtn = screen.getByRole('button', { name: /上传参考图/ });
    expect(emptyBtn).toBeInTheDocument();
    expect(emptyBtn.className).toContain('-rotate-[6deg]');
    expect(screen.getByText('参考内容')).toBeInTheDocument();

    fireEvent.click(emptyBtn);
    expect(onUploadClick).toHaveBeenCalled();
  });

  it('图2同款布局验证：折叠态下卡片堆物理宽度紧凑，保持与右侧输入框平直左对齐', () => {
    const { container } = render(
      <PromptBarRefMediaPanel
        quickGenMode="image"
        quickVideoRefMode="omni"
        quickVideoFirstFrame={null}
        quickVideoLastFrame={null}
        quickVideoMultiFrames={[]}
        quickRefImages={mockImages}
        isExpandedRefImages={false}
        setIsExpandedRefImages={vi.fn()}
        setQuickVideoFirstFrame={vi.fn()}
        setQuickVideoLastFrame={vi.fn()}
        swapVideoFirstLastFrames={vi.fn()}
        removeQuickVideoMultiFrame={vi.fn()}
        removeQuickRefImage={vi.fn()}
        onUploadClick={vi.fn()}
        onFirstFrameClick={vi.fn()}
        onLastFrameClick={vi.fn()}
        onMultiFrameClick={vi.fn()}
        refImagesContainerRef={{ current: null }}
        onMouseEnterRefImages={vi.fn()}
        onMouseLeaveRefImages={vi.fn()}
      />
    );

    const stackContainer = container.querySelector('.relative.transition-all');
    expect(stackContainer).toBeTruthy();
    expect(stackContainer?.className).toContain('w-[72px]');
    expect(stackContainer?.className).toContain('sm:w-[76px]');
    expect(stackContainer?.className).toContain('overflow-visible');
  });
});

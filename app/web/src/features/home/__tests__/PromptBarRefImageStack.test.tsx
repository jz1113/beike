// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PromptBarRefImageStack } from '../components/prompt-bar/media/PromptBarRefImageStack';

describe('PromptBarRefImageStack (图2原版扇形散落卡片设计)', () => {
  beforeEach(() => {
    cleanup();
  });

  it('当没有素材时不渲染任何内容', () => {
    const { container } = render(
      <PromptBarRefImageStack
        images={[]}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onUploadClick={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('1 张素材图时（图 1）：仅呈现素材封面与加号便签卡片，无深灰全屏双向箭头卡片', () => {
    const onUploadClick = vi.fn();
    const onPreviewImage = vi.fn();

    render(
      <PromptBarRefImageStack
        images={['https://example.com/girl1.jpg']}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onUploadClick={onUploadClick}
        onRemove={vi.fn()}
        onPreviewImage={onPreviewImage}
      />,
    );

    // 1. 卡片 1：点击放大查看素材与倾斜度
    const card1 = screen.getByTitle('点击放大查看素材');
    expect(card1).toBeInTheDocument();
    const card1Container = card1.closest('.group\\/card1') || card1;
    expect(card1Container.className).toContain('-rotate-[5deg]');
    fireEvent.click(card1);
    expect(onPreviewImage).toHaveBeenCalledWith(0);

    // 2. 验证：1 张素材时不出现深灰全屏展开卡片
    expect(screen.queryByTitle(/点击展开全部素材卡片/)).toBeNull();

    // 3. 卡片 2：添加更多参考素材便签
    const addCard = screen.getByTitle('添加更多参考素材');
    expect(addCard).toBeInTheDocument();
    expect(screen.getByText('参考内容')).toBeInTheDocument();
    fireEvent.click(addCard);
    expect(onUploadClick).toHaveBeenCalled();
  });

  it('2 张素材图时（图 2）：呈现 2 张真实素材封面与加号便签卡片，无需全屏展开卡片，两张图均支持删除与预览', () => {
    const onPreviewImage = vi.fn();
    const onRemove = vi.fn();

    render(
      <PromptBarRefImageStack
        images={['https://example.com/girl1.jpg', 'https://example.com/girl2.jpg']}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onUploadClick={vi.fn()}
        onRemove={onRemove}
        onPreviewImage={onPreviewImage}
      />,
    );

    // 1. 第 1 张真实图片封面
    const card1 = screen.getByTitle('点击放大查看素材');
    expect(card1).toBeInTheDocument();
    fireEvent.click(card1);
    expect(onPreviewImage).toHaveBeenCalledWith(0);

    // 2. 第 2 张真实图片封面（而不是深灰展开卡片）
    const card2 = screen.getByTitle('点击放大查看第2张素材');
    expect(card2).toBeInTheDocument();
    fireEvent.click(card2);
    expect(onPreviewImage).toHaveBeenCalledWith(1);

    // 3. 验证：2 张素材时依然不出现深灰全屏展开卡片
    expect(screen.queryByTitle(/点击展开全部素材卡片/)).toBeNull();

    // 4. 便签卡片
    expect(screen.getByTitle('添加更多参考素材')).toBeInTheDocument();

    // 5. 第 2 张素材同样支持删除按钮
    const card2Container = card2.closest('.group\\/card2')!;
    const deleteBtn2 = screen.getByTitle('删除第2张素材');
    expect(deleteBtn2).toBeInTheDocument();
    fireEvent.mouseEnter(card2Container);
    expect(deleteBtn2.className).toContain('opacity-100');
    fireEvent.click(deleteBtn2);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('3 张及以上素材时（图 4）：呈现第 1 张封面、中间深灰全屏双向箭头展开卡片与加号便签卡片', () => {
    const setIsExpanded = vi.fn();

    render(
      <PromptBarRefImageStack
        images={[
          'https://example.com/girl1.jpg',
          'https://example.com/girl2.jpg',
          'https://example.com/girl3.jpg',
        ]}
        isExpanded={false}
        setIsExpanded={setIsExpanded}
        onUploadClick={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    // 第 1 张封面
    expect(screen.getByTitle('点击放大查看素材')).toBeInTheDocument();

    // 中间深灰全屏双向箭头卡片
    const expandCard = screen.getByTitle('共 3 个素材，点击展开全部素材卡片');
    expect(expandCard).toBeInTheDocument();
    fireEvent.click(expandCard);
    expect(setIsExpanded).toHaveBeenCalledWith(true);

    // 加号便签
    expect(screen.getByTitle('添加更多参考素材')).toBeInTheDocument();
  });

  it('卡片1右上角悬浮删除按钮：右上角定位、未悬浮隐藏、悬浮时出现、移出后隐藏，点击可删除素材', () => {
    const onRemove = vi.fn();
    render(
      <PromptBarRefImageStack
        images={['https://example.com/girl.jpg']}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onUploadClick={vi.fn()}
        onRemove={onRemove}
      />,
    );

    const deleteBtn = screen.getByTitle('删除此素材');
    expect(deleteBtn).toBeInTheDocument();
    // 1. 位置定位在右上角
    expect(deleteBtn.className).toContain('-top-2');
    expect(deleteBtn.className).toContain('-right-2');
    // 2. 未悬浮时（参考图3）：隐藏且不响应事件
    expect(deleteBtn.className).toContain('opacity-0');
    expect(deleteBtn.className).toContain('pointer-events-none');
    expect(deleteBtn.className).toContain('group-hover/card1:opacity-100');

    // 3. 鼠标悬浮在卡片1上时（参考图4）：显示删除按钮
    const card1 = screen.getByTitle('点击放大查看素材');
    const card1Container = card1.closest('.group\\/card1')!;
    fireEvent.mouseEnter(card1Container);
    expect(deleteBtn.className).toContain('opacity-100');
    expect(deleteBtn.className).toContain('pointer-events-auto');

    // 4. 鼠标移出卡片1后：重新恢复隐藏（参考图3）
    fireEvent.mouseLeave(card1Container);
    expect(deleteBtn.className).toContain('opacity-0');
    expect(deleteBtn.className).toContain('pointer-events-none');

    // 5. 点击删除按钮触发删除
    fireEvent.click(deleteBtn);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('卡片容器在 DOM 流中保持紧凑占位(w-[72px] sm:w-[76px])且 overflow-visible，使展出卡片向右漂浮衬于文字上方而不挤压文本排版', () => {
    const { container } = render(
      <PromptBarRefImageStack
        images={['https://example.com/1.jpg', 'https://example.com/2.jpg']}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onUploadClick={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const stackContainer = container.querySelector('.relative.transition-all');
    expect(stackContainer?.className).toContain('w-[72px]');
    expect(stackContainer?.className).toContain('sm:w-[76px]');
    expect(stackContainer?.className).toContain('overflow-visible');
  });

  it('未悬浮时只显示单张（图2样式带右下角圆形加号），鼠标悬浮时向右展开多张素材卡片', () => {
    const { container } = render(
      <PromptBarRefImageStack
        images={['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg']}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onUploadClick={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const stackRoot = container.firstElementChild as HTMLElement;

    // 1. 未悬浮时：右下角加号圆形按钮可见
    const addBtn = screen.getByTitle('添加参考素材');
    expect(addBtn.className).toContain('opacity-100');

    // 2. 未悬浮时：后面的展开卡片和便签卡片处于收拢隐藏态 (opacity-0)
    const expandCard = screen.getByTitle(/点击展开全部素材卡片/);
    expect(expandCard.className).toContain('opacity-0');
    expect(expandCard.className).toContain('left-0');

    const addMemoCard = screen.getByTitle('添加更多参考素材');
    expect(addMemoCard.className).toContain('opacity-0');
    expect(addMemoCard.className).toContain('left-0');

    // 3. 鼠标悬浮到卡片堆叠容器上：向右平滑滑开展开
    fireEvent.mouseEnter(stackRoot);
    expect(expandCard.className).toContain('opacity-100');
    expect(expandCard.className).toContain('left-[50px]');

    expect(addMemoCard.className).toContain('opacity-100');
    expect(addMemoCard.className).toContain('left-[100px]');

    // 4. 鼠标移出容器：恢复收拢隐藏
    fireEvent.mouseLeave(stackRoot);
    expect(expandCard.className).toContain('opacity-0');
    expect(expandCard.className).toContain('left-0');
    expect(addMemoCard.className).toContain('opacity-0');
    expect(addMemoCard.className).toContain('left-0');
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import InspirationModal, { InspirationItem } from '../components/inspiration/InspirationModal';

describe('InspirationModal 详情模态框测试', () => {
  beforeEach(() => {
    cleanup();
  });

  const mockItem: InspirationItem = {
    id: 'test-1',
    category: '美食',
    tag: '小红书食谱',
    title: '番茄牛腩煲',
    prompt: '高分辨率中文菜谱信息图海报，番茄牛腩，成品特写，红亮番茄酱汁浓郁有光泽。',
    image: 'https://example.com/tomato-beef.jpg',
    model: 'gpt-image-2',
    aspectRatio: '3:4',
    quality: '2K',
  };

  it('使用 createPortal 渲染到 document.body，拥有顶级 z-[9999] 和暗色遮罩', () => {
    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem]}
        onClose={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    // 模态框根容器应该挂载在 document.body 下
    const modalOverlay = document.querySelector('.fixed.inset-0.z-\\[9999\\]');
    expect(modalOverlay).not.toBeNull();
    expect(document.body.contains(modalOverlay)).toBe(true);
  });

  it('显示贝壳云图官方头像和昵称，不包含复制提示词按钮', () => {
    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem]}
        onClose={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    // 验证官方 Logo
    const logoImg = screen.getByRole('img', { name: '贝壳云图' }) as HTMLImageElement;
    expect(logoImg).toBeDefined();
    expect(logoImg.src).toContain('/app_logo.png');

    // 验证昵称
    expect(screen.getByText('贝壳云图')).toBeDefined();

    // 验证彻底不存在复制按钮
    expect(screen.queryByText('复制')).toBeNull();
    expect(screen.queryByTitle('复制完整提示词')).toBeNull();
  });

  it('参数规格条 1:1 对齐图1无边框内联条展示模型、画质、比例，彻底移除边框胶囊与更多 ⓘ', () => {
    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem]}
        onClose={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    // 验证无边框内联条中的各个规格参数存在
    expect(screen.getByText('GPT Image 2')).toBeDefined();
    expect(screen.getByText('2K')).toBeDefined();
    expect(screen.getByText('3:4')).toBeDefined();
    // 验证不存在旧版“比例”硬编码前缀或“更多”
    expect(screen.queryByText('比例')).toBeNull();
    expect(screen.queryByText('更多')).toBeNull();
  });

  it('已移除右上角关闭叉号，支持点击遮罩空白处退出全屏，点击做同款与用作参考图触发回调', () => {
    const handleClose = vi.fn();
    const handleUsePromptOnly = vi.fn();
    const handleUseAsReference = vi.fn();

    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem]}
        onClose={handleClose}
        onUsePromptOnly={handleUsePromptOnly}
        onUseAsReference={handleUseAsReference}
      />
    );

    // 验证下载按钮存在且为图1标准浅灰圆角方块样式
    const downloadBtn = screen.getByTitle('下载高清原图');
    expect(downloadBtn).toBeDefined();
    expect(downloadBtn.className).toContain('bg-transparent');

    // 验证右上角关闭叉号已彻底移除（用户要求点击空白处退出）
    expect(screen.queryByTitle('关闭 (Esc)')).toBeNull();

    // 验证点击遮罩空白区域触发 onClose
    const overlay = document.querySelector('.fixed.inset-0.z-\\[9999\\]');
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // 验证做同款
    const doSameBtn = screen.getByText('做同款');
    fireEvent.click(doSameBtn);
    expect(handleUsePromptOnly).toHaveBeenCalledWith(mockItem.prompt);

    // 验证用作参考图
    const useRefBtn = screen.getByText('用作参考图');
    fireEvent.click(useRefBtn);
    expect(handleUseAsReference).toHaveBeenCalledWith(mockItem.prompt, mockItem.image, undefined);
  });

  it('提示词正文标题行不显示字数标签（如 82 字）', () => {
    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem]}
        onClose={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    // 验证提示词长度不作为标签显示
    expect(screen.queryByText(`${mockItem.prompt.length} 字`)).toBeNull();
    expect(screen.queryByText(/\d+\s*字/)).toBeNull();
    // 依然能正确渲染图片提示词标题
    expect(screen.getByText('图片提示词')).toBeDefined();
  });

  it('多图时外置渲染左右翻页控制器，点击触发导航回调', () => {
    const handleNavigate = vi.fn();
    const mockItem2 = { ...mockItem, id: 'test-2', title: '番茄牛腩 2' };

    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem, mockItem2]}
        onClose={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
        onNavigate={handleNavigate}
      />
    );

    // 验证左右翻页按钮存在且脱离图片边缘
    const prevBtn = screen.getByTitle('上一个 (←)');
    const nextBtn = screen.getByTitle('下一个 (→)');
    expect(prevBtn).toBeDefined();
    expect(nextBtn).toBeDefined();

    // 点击下一张
    fireEvent.click(nextBtn);
    expect(handleNavigate).toHaveBeenCalledWith(mockItem2);
  });

  it('对齐规范：正常展示日期与AI生成标记，不呈现点赞按钮', () => {
    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem]}
        onClose={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    // 验证展示日期与AI生成信息
    expect(screen.getByText(/内容由 AI 生成/)).toBeDefined();
    // 验证不呈现点赞按钮
    expect(screen.queryByTitle('点赞')).toBeNull();
  });

  it('长提示词默认处于展开状态，支持用户手动收起和再展开', () => {
    const longPromptItem: InspirationItem = {
      ...mockItem,
      prompt: '人物形象提示词：1.主视觉区以正面侧面背面三个核心视角为主体，直观呈现角色的整体身形、服饰搭配和标志性特征，是制作人员对人物整体造型的参考基础。2.补充信息区拆分出面部特写和配色板，补充主视角没覆盖的细节与色彩标准。3.局部细节图展示关键部件的设计，把主视角里的模糊细节拆分为精准的制作参考。',
    };

    render(
      <InspirationModal
        isOpen={true}
        item={longPromptItem}
        allItems={[longPromptItem]}
        onClose={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    // 默认即为展开状态，操作按钮应显示“收起”
    const toggleBtn = screen.getByTitle('收起长文本');
    expect(toggleBtn).toBeDefined();
    expect(screen.getByText('收起')).toBeDefined();
    expect(screen.queryByText('展开全文')).toBeNull();

    // 点击后收起
    fireEvent.click(toggleBtn);
    expect(screen.getByText('展开全文')).toBeDefined();
    expect(screen.queryByText('收起')).toBeNull();
  });

  it('点击模态框外部空白遮罩灵敏触发 onClose 退出全屏', () => {
    const onClose = vi.fn();
    render(
      <InspirationModal
        isOpen={true}
        item={mockItem}
        allItems={[mockItem]}
        onClose={onClose}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    const overlay = document.querySelector('.fixed.inset-0') as HTMLElement;
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import BatchStage1Collect from '../BatchStage1Collect';
import type { BatchProductItem } from '../batchTypes';

vi.mock('@/lib/apiClient', () => ({
  proxyMediaUrl: (url: string) => url,
}));

describe('BatchStage1Collect 工业级视觉与交互测试', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    batchMode: 'original' as const,
    batchInputText: '',
    setBatchInputText: vi.fn(),
    items: [] as BatchProductItem[],
    setItems: vi.fn(),
    isCollecting: false,
    collectProgress: { total: 0, current: 0, success: 0, failed: 0 },
    successfulItems: [] as BatchProductItem[],
    handleParseInput: vi.fn(),
    startBatchCollect: vi.fn().mockResolvedValue(undefined),
    handleRemoveItem: vi.fn(),
    onPreviewImage: vi.fn(),
    onNextStage: vi.fn(),
    selectedArchId: 'system-recipe-ecommerce',
    selectedShotCount: 5,
    selectedAspect: '3:4',
    selectedQuality: '4K',
    selectedImageGenModel: 'Doubao-Seedance-2.5',
    selectedVisionModel: 'Doubao-Vision-Pro',
    hasHumanPersona: true,
    onOpenSettings: vi.fn(),
  };

  it('初始状态下渲染全宽纯净采编工作舱，已移除顶部胶囊、预设看板与特性微卡', () => {
    render(<BatchStage1Collect {...defaultProps} />);

    // 验证居中主标题与说明
    expect(screen.getByText('输入商品，一键生成小红书种草内容')).toBeInTheDocument();
    expect(screen.getByText(/自动提取商品卖点，生成标题、正文与配图灵感/)).toBeInTheDocument();

    // 确保已彻底清除顶部胶囊标签
    expect(screen.queryByText('批量智能采编工作舱')).not.toBeInTheDocument();
    expect(screen.queryByText('多源自动化提取')).not.toBeInTheDocument();

    // 确保已彻底清除右侧预设看板
    expect(screen.queryByText('流水线预设看板')).not.toBeInTheDocument();
    expect(screen.queryByText('当前批次自动化生产参数')).not.toBeInTheDocument();

    // 确保已彻底清除旧版特性微卡
    expect(screen.queryByText('多源全自动采编')).not.toBeInTheDocument();
    expect(screen.queryByText('行业分镜脚本架构')).not.toBeInTheDocument();
    expect(screen.queryByText('高并发流水线交付')).not.toBeInTheDocument();
  });

  it('底部智能输入舱支持输入与圆形发送按钮交互', () => {
    const startBatchCollect = vi.fn().mockResolvedValue(undefined);
    const mockItems: BatchProductItem[] = [
      {
        id: 'item-1',
        platform: 'jd',
        itemId: '100279945637',
        status: 'pending',
        title: '测试商品',
        price: 99,
        category: '服饰',
        brand: '品牌',
        coverImage: '',
        mainImages: [],
        skuImages: [],
        detailImages: [],
        props: {},
        selected: true,
        allTypedImages: [],
        selectedProductImages: [],
        availableReferenceImages: [],
        selectedReferenceImages: [],
        prompts: [],
        tasks: [],
      },
    ];



    render(
      <BatchStage1Collect
        {...defaultProps}
        items={mockItems}
        batchInputText="https://item.jd.com/100279945637.html"
        startBatchCollect={startBatchCollect}
      />
    );

    // 验证圆形发送按钮
    const submitBtn = screen.getByRole('button', { name: /智能采编/i });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(startBatchCollect).toHaveBeenCalledTimes(1);
  });

  it('智能输入卡片保持纯净外观：彻底不展示快捷粘贴、填入示例与按键提示，但支持快捷键提交', () => {
    const startBatchCollect = vi.fn().mockResolvedValue(undefined);
    const mockItems: BatchProductItem[] = [
      {
        id: 'item-1',
        platform: 'jd',
        itemId: '100279945637',
        status: 'pending',
        title: '测试商品',
        price: 99,
        category: '服饰',
        brand: '品牌',
        coverImage: '',
        mainImages: [],
        skuImages: [],
        detailImages: [],
        props: {},
        selected: true,
        allTypedImages: [],
        selectedProductImages: [],
        availableReferenceImages: [],
        selectedReferenceImages: [],
        prompts: [],
        tasks: [],
      },
    ];

    render(
      <BatchStage1Collect
        {...defaultProps}
        items={mockItems}
        batchInputText="https://item.jd.com/100279945637.html"
        startBatchCollect={startBatchCollect}
      />
    );

    // 确认已彻底移除画框中的三处冗余信息
    expect(screen.queryByText('快捷粘贴')).not.toBeInTheDocument();
    expect(screen.queryByText('填入示例')).not.toBeInTheDocument();
    expect(screen.queryByText(/快速提交采编/i)).not.toBeInTheDocument();

    // 验证按下 Meta+Enter 依然具备快捷键提交能力
    const textarea = screen.getByPlaceholderText(/输入商品链接或纯数字 SKU/i);
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(startBatchCollect).toHaveBeenCalledTimes(1);
  });

  it('种草工坊采编工作舱渲染纯净居中标题与副标题，且已彻底移除胶囊标签、素材卡与AI顾问卡', () => {
    const setBatchInputText = vi.fn();
    render(
      <BatchStage1Collect
        {...defaultProps}
        items={[]}
        batchInputText=""
        setBatchInputText={setBatchInputText}
      />
    );

    // 1. 验证种草工坊业务居中大标题与副标题
    expect(screen.getByText('输入商品，一键生成小红书种草内容')).toBeInTheDocument();
    expect(screen.getByText(/自动提取商品卖点，生成标题、正文与配图灵感/)).toBeInTheDocument();

    // 2. 验证顶部胶囊标签已被彻底移除
    expect(screen.queryByText('种草工坊')).not.toBeInTheDocument();
    expect(screen.queryByText('批量智能采编工作舱')).not.toBeInTheDocument();
    expect(screen.queryByText('多源自动化提取')).not.toBeInTheDocument();

    // 3. 验证已有素材快捷操作微卡已被彻底移除
    expect(screen.queryByText('使用已有素材开启创作')).not.toBeInTheDocument();
    expect(screen.queryByText('本地上传')).not.toBeInTheDocument();
    expect(screen.queryByText('选择资产')).not.toBeInTheDocument();
    expect(screen.queryByText('填入示例')).not.toBeInTheDocument();
    expect(screen.queryByText('粘贴链接')).not.toBeInTheDocument();

    // 4. 验证 AI 顾问、类目拍摄架构与多平台支持标签已被彻底移除
    expect(screen.queryByText(/和AI顾问聊聊/)).not.toBeInTheDocument();
    expect(screen.queryByText('类目拍摄架构')).not.toBeInTheDocument();
    expect(screen.queryByText('参考站内灵感')).not.toBeInTheDocument();
    expect(screen.queryByText('京东')).not.toBeInTheDocument();
    expect(screen.queryByText('天猫 / 淘宝')).not.toBeInTheDocument();
    expect(screen.queryByText('1688')).not.toBeInTheDocument();
    expect(screen.queryByText('纯数字 SKU')).not.toBeInTheDocument();
  });

  it('录入商品后底部智能输入舱具备居中微收缩约束，避免全屏铺满与右下角 a 助手重叠', () => {
    const mockItems: BatchProductItem[] = [
      {
        id: 'item-1',
        platform: 'jd',
        itemId: '100279945637',
        status: 'pending',
        title: '测试商品',
        price: 99,
        category: '服饰',
        brand: '品牌',
        coverImage: '',
        mainImages: [],
        skuImages: [],
        detailImages: [],
        props: {},
        selected: true,
        allTypedImages: [],
        selectedProductImages: [],
        availableReferenceImages: [],
        selectedReferenceImages: [],
        prompts: [],
        tasks: [],
      },
    ];

    render(
      <BatchStage1Collect
        {...defaultProps}
        items={mockItems}
        batchInputText=""
      />
    );

    const inputDock = screen.getByTestId('stage1-input-dock');
    expect(inputDock).toBeInTheDocument();
    // 验证包含居中与宽度收缩关键类名，杜绝全宽占满屏幕压盖 a 助手
    expect(inputDock.className).toContain('mx-auto');
    expect(inputDock.className).toContain('md:max-w-4xl');
    expect(inputDock.className).toContain('xl:max-w-5xl');
    expect(inputDock.className).toContain('2xl:max-w-6xl');
  });

  it('采编清单与图库状态标题栏保持极简纯净：彻底移除统计徽章与顶栏按钮，保留底部推进按钮', () => {
    const mockItems: BatchProductItem[] = [
      {
        id: 'item-1',
        platform: 'jd',
        itemId: '100279945637',
        status: 'success',
        title: '测试商品1',
        price: 99,
        category: '服饰',
        brand: '品牌',
        coverImage: '',
        mainImages: [],
        skuImages: [],
        detailImages: [],
        props: {},
        selected: true,
        allTypedImages: [
          { url: 'https://img.example.com/1.jpg', type: 'main' },
        ],
        selectedProductImages: [],
        availableReferenceImages: [],
        selectedReferenceImages: [],
        prompts: [],
        tasks: [],
      },
    ];

    render(
      <BatchStage1Collect
        {...defaultProps}
        items={mockItems}
        successfulItems={mockItems}
      />
    );

    // 1. 标题正常渲染
    expect(screen.getByText('采编清单与图库状态')).toBeInTheDocument();

    // 2. 统计胶囊群已彻底移除
    expect(screen.queryByText(/共 \d+ 款商品/)).not.toBeInTheDocument();
    expect(screen.queryByText(/已就绪:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/累计提取素材/)).not.toBeInTheDocument();

    // 3. 顶栏按钮已彻底移除
    expect(screen.queryByText('清空重置')).not.toBeInTheDocument();
    expect(screen.queryByText(/下一步：选图与架构/)).not.toBeInTheDocument();

    // 4. 底部主推进大按钮依然保留
    expect(screen.getByText(/下一步：人工批量选图与提示词架构/)).toBeInTheDocument();
  });
});



// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import BatchStage2Config from '../BatchStage2Config';

vi.mock('../BatchConfigContext', () => ({
  useBatchConfig: () => ({
    batchMode: 'original',
    currentStage: 2,
    successfulItems: [],
    setItems: vi.fn(),
    recipes: [],
    selectedArchId: '',
    setSelectedArchId: vi.fn(),
    availableVisionModels: [],
    selectedVisionModel: '',
    setSelectedVisionModel: vi.fn(),
    availableImageModels: [],
    selectedImageGenModel: '',
    setSelectedImageGenModel: vi.fn(),
    hasHumanPersona: false,
    setHasHumanPersona: vi.fn(),
    selectedAspect: '3:4',
    setSelectedAspect: vi.fn(),
    selectedQuality: '2K',
    setSelectedQuality: vi.fn(),
    selectedShotCount: 4,
    setSelectedShotCount: vi.fn(),
    activeImgFilter: 'all',
    setActiveImgFilter: vi.fn(),
    toggleProductImageSelection: vi.fn(),
    batchSetProductImages: vi.fn(),
    toggleReferenceImageSelection: vi.fn(),
    handleRemoveItem: vi.fn(),
    onPreviewGallery: vi.fn(),
    onPreviewImage: vi.fn(),
    onNextStage: vi.fn(),
    openWorkshopConfig: vi.fn(),
  }),
}));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: (selector: any) => selector({
    setMasterSettingsOpen: vi.fn(),
    setActiveMasterTab: vi.fn(),
  }),
}));

describe('BatchStage2Config 界面精简与视觉纯净测试', () => {
  it('已彻底移除选图工作舱多余标题、第二步标签与提示文本', () => {
    render(<BatchStage2Config />);

    // 验证左侧标题与步骤标签已被彻底移除
    expect(screen.queryByText('人工批量选图工作舱')).not.toBeInTheDocument();
    expect(screen.queryByText('批量选图与对标配对工作舱')).not.toBeInTheDocument();
    expect(screen.queryByText(/第 2 步 · 素材与构图矩阵/)).not.toBeInTheDocument();

    // 验证右侧说明文案已被彻底移除
    expect(screen.queryByText(/挑选商品高清主图作为 AI 生成基准/)).not.toBeInTheDocument();
  });

  it('BatchSelectionDetail 底部操作栏已彻底移除【选第1张主图】、【全选主图】、【清空】三个快捷按钮', async () => {
    const { BatchSelectionDetail } = await import('../components/BatchSelectionDetail');
    const mockItem: any = {
      id: 'item-1',
      title: '商品1',
      images: ['https://example.com/1.jpg'],
      productImages: ['https://example.com/1.jpg'],
      selectedProductImages: ['https://example.com/1.jpg'],
      referenceImages: [],
      status: 'pending' as const,
    };

    const setFocusedIndex = vi.fn();
    const handleRemoveItem = vi.fn();
    const { rerender } = render(
      <BatchSelectionDetail
        currentItem={mockItem}
        focusedIndex={0}
        totalDisplayed={2}
        displayedItems={[mockItem]}
        activeImgFilter="all"
        onFilterChange={vi.fn()}
        filteredTypedImgs={[{ url: 'https://example.com/1.jpg', type: 'main' }]}
        selectedSet={new Set(['https://example.com/1.jpg'])}
        galleryReady={true}
        batchMode="original"
        setItems={vi.fn()}
        batchSetProductImages={vi.fn()}
        handleRemoveItem={handleRemoveItem}
        toggleReferenceImageSelection={vi.fn()}
        handleSelect={vi.fn()}
        handlePreview={vi.fn()}
        setFocusedIndex={setFocusedIndex}
        onConfirmAndNext={vi.fn()}
      />
    );

    // 验证用户截图红框圈出的三个按钮已被彻底移除
    expect(screen.queryByText(/选第1张主图/)).not.toBeInTheDocument();
    expect(screen.queryByText(/全选主图/)).not.toBeInTheDocument();
    expect(screen.queryByText(/清空/)).not.toBeInTheDocument();

    // 验证保留的按钮正常渲染
    expect(screen.getByText('放弃该商品')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认选图，进入下一步' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一款/ }));
    expect(setFocusedIndex).toHaveBeenCalledTimes(1);
    mockItem.selectedProductImages = [];
    rerender(<BatchSelectionDetail currentItem={mockItem} focusedIndex={0} totalDisplayed={2}
      activeImgFilter="all" onFilterChange={vi.fn()} filteredTypedImgs={[]} selectedSet={new Set()}
      galleryReady batchMode="original" setItems={vi.fn()} batchSetProductImages={vi.fn()}
      handleRemoveItem={handleRemoveItem} toggleReferenceImageSelection={vi.fn()}
      handleSelect={vi.fn()} handlePreview={vi.fn()} setFocusedIndex={setFocusedIndex} />);
    expect(screen.getByRole('button', { name: /下一款/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /下一款/ }));
    expect(setFocusedIndex).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '放弃该商品' }));
    expect(handleRemoveItem).toHaveBeenCalledWith('item-1');
  });
});

describe('选图完成流转', () => {
  it('最后一款显示完成按钮；队列未齐时不能继续且能定位待选商品', async () => {
    const { default: Panel } = await import('../components/BatchImageSelectionPanel');
    const item: any = { id: 'last', title: '最后一款', selectedProductImages: ['a'],
      allTypedImages: [{ url: 'a', type: 'main' }], selectedReferenceImages: [], availableReferenceImages: [] };
    const next = vi.fn();
    const filter = vi.fn();
    const focus = vi.fn();
    const props = { displayedItems: [item], focusedIndex: 0, activeImgFilter: 'all' as const,
      batchMode: 'original' as const, productFilter: 'all' as const, onFilterChange: vi.fn(),
      onProductFilterChange: filter, setFocusedIndex: focus, setItems: vi.fn(),
      batchSetProductImages: vi.fn(), handleRemoveItem: vi.fn(), toggleReferenceImageSelection: vi.fn(),
      onConfirmAndNext: next, pendingItems: [], completedItems: [item] };
    const { rerender } = render(<Panel {...props} />);
    expect(screen.queryByRole('button', { name: '放弃该商品' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /下一款/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认选图，进入下一步' }));
    expect(next).toHaveBeenCalledTimes(1);
    rerender(<Panel {...props} pendingItems={[{ ...item, id: 'pending', selectedProductImages: [] }]} />);
    expect(screen.queryByRole('button', { name: '确认选图，进入下一步' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '放弃该商品' })).toBeInTheDocument();
    expect(next).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /去补齐/ }));
    expect(filter).toHaveBeenCalledWith('pending');
    expect(focus).toHaveBeenCalledWith(0);
  });
});


afterEach(() => { cleanup(); });

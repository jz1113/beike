import { Children, createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BatchProductItem } from '../../model/batchTypes';
import { BatchStage4ProductItem } from './BatchStage4ProductItem';
import { BatchStage4GalleryView } from './BatchStage4GalleryView';
import BatchStage4Queue from './BatchStage4Queue';
import BatchStageFooter from './BatchStageFooter';

vi.mock('../delivery/WorkshopPromoteGroup', () => ({ WorkshopPromoteGroup: () => null }));
vi.mock('@client/shared/ui/LazyProxyImage', () => ({
  default: ({ src, alt, className }: { src: string; alt?: string; className?: string }) => createElement('img', { src, alt, className }),
}));

function product(id = 'phone', excluded = false): BatchProductItem {
  return { id, itemId: id, title: id, platform: 'jd', price: 0, category: '', brand: '', coverImage: '/product.jpg',
    mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
    allTypedImages: [], selectedProductImages: ['/product.jpg'],
    prompts: [{ shot_no: 1, title: '参考分镜', prompt: 'prompt', sourceReferenceImageUrl: `/reference-${id}.jpg` }],
    tasks: [{ id: `shot-${id}`, shot_no: 1, title: '成图', prompt: 'prompt', status: 'SUCCESS', resultUrl: '/storage/result.jpg', outputReview: excluded ? 'rejected' : 'unreviewed' }] };
}

type NodeProps = { children?: ReactNode; 'aria-label'?: string; 'aria-pressed'?: boolean; disabled?: boolean;
  onClick?: (event: { stopPropagation: () => void }) => void;
  primaryAction?: ComponentProps<typeof BatchStageFooter>['primaryAction']; secondaryActions?: ReactNode };

function find(node: ReactNode, predicate: (element: ReactElement<NodeProps>) => boolean): ReactElement<NodeProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<NodeProps>(child)) continue;
    if (predicate(child)) return child;
    const match = find(child.props.children, predicate);
    if (match) return match;
  }
}

function single(item: BatchProductItem, readOnly = false, isReviewingOutputs = false) {
  const onReviewTask = vi.fn();
  const preview = vi.fn();
  let tree!: ReactElement;
  function Harness() {
    tree = BatchStage4ProductItem({ item, readOnly, isReviewingOutputs, onReviewTask, selectedVisionModel: 'vision',
      isExportingZip: false, generateCopywritingForProduct: vi.fn(), setPreviewImageUrl: preview });
    return tree;
  }
  const html = renderToStaticMarkup(createElement(Harness));
  return { tree, html, onReviewTask, preview };
}

const queueProps = (items: BatchProductItem[]): ComponentProps<typeof BatchStage4Queue> => ({
  successfulItems: items, selectedVisionModel: 'vision', availableImageModels: [], selectedImageGenModel: 'image', selectedQuality: 'high',
  selectedAspect: '3:4', isGeneratingBatch: false, generateCopywritingForProduct: vi.fn(), isExportingZip: false,
  handleExportZip: vi.fn(), handleExportExcel: vi.fn(), setPreviewImageUrl: vi.fn(), onReviewBatch: vi.fn().mockResolvedValue(true),
});

describe('stage four image review UI', () => {
  it('shows product thumbnails instead of legacy samples and removes the old actions', () => {
    const html = renderToStaticMarkup(createElement(BatchStage4Queue, queueProps([product('one'), product('two')])));
    expect(html).toContain('src="/product.jpg"');
    expect(html).not.toContain('src="/reference-one.jpg"');
    expect(html).not.toContain('src="/reference-two.jpg"');
    expect(html).toContain('审核通过');
    expect(html).toContain('审核驳回');
    for (const label of ['评分反馈', '返回修改分镜', '下载本款图片与文案', '完成并归档本批次']) expect(html).not.toContain(label);
  });

  it('toggles exclusion by clicking the image and keeps zoom as a separate action', () => {
    const kept = single(product());
    const exclude = find(kept.tree, node => node.props['aria-label'] === '分镜 1：点击不采用');
    expect(exclude?.props['aria-pressed']).toBe(false);
    exclude?.props.onClick?.({ stopPropagation: vi.fn() });
    expect(kept.onReviewTask).toHaveBeenCalledExactlyOnceWith('phone', 'shot-phone', 'rejected');
    expect(kept.preview).not.toHaveBeenCalled();
    const excluded = single(product('phone', true));
    expect(excluded.html).toContain('grayscale opacity-35');
    const restore = find(excluded.tree, node => node.props['aria-label'] === '分镜 1：点击恢复采用');
    expect(restore?.props['aria-pressed']).toBe(true);
    restore?.props.onClick?.({ stopPropagation: vi.fn() });
    expect(excluded.onReviewTask).toHaveBeenCalledExactlyOnceWith('phone', 'shot-phone', 'accepted');
    expect(excluded.html).toContain('放大全屏预览');
  });

  it('previews read-only history and disables changes during a review', () => {
    const history = single(product(), true);
    const image = find(history.tree, node => node.props['aria-label'] === '分镜 1：放大预览');
    image?.props.onClick?.({ stopPropagation: vi.fn() });
    expect(history.preview).toHaveBeenCalledExactlyOnceWith('/storage/result.jpg');
    expect(history.onReviewTask).not.toHaveBeenCalled();
    const pending = single(product(), false, true);
    expect(find(pending.tree, node => node.props['aria-label'] === '分镜 1：点击不采用')?.props.disabled).toBe(true);
    expect(renderToStaticMarkup(createElement(BatchStage4Queue, { ...queueProps([product()]), readOnly: true }))).not.toContain('审核通过');
  });

  it('supports the same image toggle and preview separation in the gallery', () => {
    const onReviewTask = vi.fn();
    const onPreviewGallery = vi.fn();
    const tree = BatchStage4GalleryView({ successfulItems: [product('phone', true)], setActiveItemIndex: vi.fn(),
      setPreviewImageUrl: vi.fn(), onReviewTask, onPreviewGallery });
    expect(renderToStaticMarkup(tree)).toContain('grayscale opacity-35');
    find(tree, node => node.props['aria-label'] === '分镜 1：点击恢复采用')?.props.onClick?.({ stopPropagation: vi.fn() });
    expect(onReviewTask).toHaveBeenCalledExactlyOnceWith('phone', 'shot-phone', 'accepted');
    expect(onPreviewGallery).not.toHaveBeenCalled();
    find(tree, node => node.props['aria-label'] === '放大预览分镜 1')?.props.onClick?.({ stopPropagation: vi.fn() });
    expect(onPreviewGallery).toHaveBeenCalledExactlyOnceWith(['/storage/result.jpg'], 0, 'phone - 成图');
  });

  it('wires both batch decisions and prevents approving a batch with no retained image', () => {
    const props = queueProps([product()]);
    let tree!: ReactElement;
    function Harness() { tree = BatchStage4Queue(props); return tree; }
    renderToStaticMarkup(createElement(Harness));
    const footer = find(tree, node => node.type === BatchStageFooter)!;
    footer.props.primaryAction?.onClick();
    find(footer.props.secondaryActions, node => node.type === 'button')?.props.onClick?.({ stopPropagation: vi.fn() });
    expect(props.onReviewBatch).toHaveBeenNthCalledWith(1, 'accepted');
    expect(props.onReviewBatch).toHaveBeenNthCalledWith(2, 'rejected');
    props.successfulItems = [product('phone', true)];
    renderToStaticMarkup(createElement(Harness));
    expect(find(tree, node => node.type === BatchStageFooter)?.props.primaryAction?.disabled).toBe(true);
  });
});

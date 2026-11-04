import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { ImagePlus, Loader2, PanelLeftClose, Settings2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import {
  eligibleSalesImages,
  SALES_PRODUCT_AUDIENCE_OPTIONS,
  SALES_PRODUCT_CATEGORIES,
} from '@shared/domain/sales';
import { type SalesCollectionState } from '../model/salesCollectionDraft';
import { salesProductProfile } from '../model/salesProductProfile';
import { PRODUCT_IMAGE_ACCEPT, imagesFromDataTransfer } from '../model/productImageDrop';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import { SalesColorGallery } from './SalesColorGallery';
import { SalesProductSettings } from './SalesProductSettings';

interface Props {
  state: SalesCollectionState;
  updateState: (patch: Partial<SalesCollectionState>) => void;
  isBusy: boolean;
  selectionLocked?: boolean;
  isCollecting: boolean;
  isUploading: boolean;
  onCollect: () => void;
  onRetryUnavailable: () => void;
  onImageError: (index: number) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onAddOCRImages: (urls: string[]) => void;
  onImageDragging: (url: string | null) => void;
  onCollapse?: () => void;
  onConfirmSelection?: () => boolean | void;
  onRecognizeImages?: (urls: string[]) => void;
  galleryId?: string;
  onEditFaces?: (urls: string[]) => void;
  onResetProduct?: () => void;
}

export function ProductSetupPanel({
  selectionLocked = false,
  state,
  updateState,
  isBusy,
  isCollecting,
  isUploading,
  onCollect,
  onImageError,
  onUpload,
  onRetryUnavailable,
  onAddOCRImages,
  onImageDragging,
  onCollapse,
  onConfirmSelection,
  onRecognizeImages,
  galleryId,
  onResetProduct, onEditFaces,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState('');
  const usable = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const isCollected = Boolean(state.collectedProductUrl);
  const profile = salesProductProfile({ ...state, images: state.imageCatalog, isCollected });
  const selectionBusy = selectionLocked || isCollecting || isUploading;
  const thumb = state.productionPlan.productFaceEdits[usable[0]?.url]?.url || usable[0]?.url || state.imageCatalog[0]?.url || '';
  const hasProductCard = Boolean(state.productName.trim() || profile.hasData || state.imageCatalog.length > 0);
  const [showUrlRow, setShowUrlRow] = useState(!hasProductCard);

  useEffect(() => {
    if (!hasProductCard) setShowUrlRow(true);
  }, [hasProductCard]);

  const selectImages = useCallback((colorSelection: SalesCollectionState['colorSelection']) => updateState({ colorSelection }), [updateState]);
  const hasFiles = (event: DragEvent<HTMLDivElement>) => event.dataTransfer.types.includes('Files');
  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (isBusy) return;
    setDropError('');
    try { await onUpload(await imagesFromDataTransfer(event.dataTransfer)); }
    catch { setDropError('图片读取失败，请使用上传按钮重新选择。'); }
  };

  return (
    <section className="sales-product-media flex h-full min-h-0 flex-col">
      <div className="sales-product-link shrink-0 pb-2.5">
        {hasProductCard && (
          <div className="sales-product-card" aria-label="当前商品信息">
            {thumb && (
              <img
                src={proxyMediaUrl(thumb, { thumb: true, width: 96 })}
                alt=""
                className="sales-product-card-thumb"
                aria-hidden
              />
            )}
            <div className="sales-product-card-main">
              <strong title={state.productName}>{state.productName || '本地上传商品'}</strong>
              <p className="sales-product-card-meta" title={[profile.specification, state.brand].filter(Boolean).join(' · ')}>
                {[profile.specification || state.brand, SALES_PRODUCT_CATEGORIES.find((item) => item.id === state.category)?.label, SALES_PRODUCT_AUDIENCE_OPTIONS.find((item) => item.id === state.audience)?.label].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button ref={settingsTriggerRef} type="button" disabled={isBusy} onClick={() => setShowSettings(true)} title="编辑分类、受众及查看商品详情" className={`sales-product-settings-trigger ${salesFocusClass}`}><Settings2 size={13} aria-hidden /><span>商品设置</span></button>
          </div>
        )}

        <div hidden={hasProductCard && !showUrlRow} className={hasProductCard ? 'mt-2' : ''}>
          <label className="sr-only" htmlFor="sales-product-url">商品链接</label>
          <div className="sales-product-collect-row flex items-center gap-1.5 [&>input]:mt-0">
            <input
              ref={urlInputRef}
              id="sales-product-url"
              value={state.productUrl}
              disabled={isBusy}
              onChange={(event) => updateState({ productUrl: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter' && !isBusy) onCollect(); }}
              placeholder="粘贴商品链接或京东编号"
              className={`${salesInputClass} h-8 min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={onCollect}
              disabled={isBusy || !state.productUrl.trim()}
              className={`h-8 shrink-0 px-2.5 disabled:opacity-40 ${salesGhostButtonClass}`}
            >
              {isCollecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isCollected && state.productUrl.trim() === state.collectedProductUrl ? '更新' : '采集'}
            </button>
          </div>
          {state.collectedProductUrl && state.productUrl.trim() !== state.collectedProductUrl && (
            <p className="sales-source-change">采集新链接将替换当前商品资料和选图。</p>
          )}
        </div>

        <div className="sales-library-heading mt-2.5">
          <div>
            <h2>商品图片</h2>
            <span className="sales-panel-count">{state.imageCatalog.length}</span>
          </div>
          <div className="sales-gallery-heading-actions">
            <button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} title="上传商品图片" className={`sales-library-upload ${salesFocusClass}`}>
              <ImagePlus size={13} aria-hidden />上传图片
            </button>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-expanded={true}
                aria-controls={galleryId}
                aria-label="收起商品素材"
                title="收起商品素材"
                className={`sales-library-upload ${salesFocusClass}`}
              >
                <PanelLeftClose size={14} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        aria-label="上传商品图片"
        accept={PRODUCT_IMAGE_ACCEPT}
        multiple
        className="hidden"
        disabled={isBusy}
        onChange={(event) => {
          const files = [...(event.target.files || [])];
          event.target.value = '';
          if (files.length) void onUpload(files);
        }}
      />

      {dropError && <p role="alert" className="sales-ocr-report has-error">{dropError}</p>}
      <div
        className={`sales-product-gallery flex min-h-0 flex-1 flex-col pt-2.5 ${dragging ? 'rounded-[6px] ring-1 ring-stone-900 dark:ring-zinc-200' : ''}`}
        onDragEnter={(event) => { if (!hasFiles(event) || isBusy) return; event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
        onDragOver={(event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy'; }}
        onDragLeave={(event) => { if (!hasFiles(event)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
        onDrop={(event) => { void onDrop(event); }}
      >
        <SalesColorGallery
          initialGroup="all"
          onRetryUnavailable={onRetryUnavailable}
          images={state.imageCatalog}
          edits={state.productionPlan.productFaceEdits} onEditFaces={onEditFaces}
          metadata={state.variantMetadata}
          selection={state.colorSelection}
          ocrImageUrls={state.ocrImageUrls}
          disabled={selectionBusy}
          ocrDisabled={isBusy}
          onChange={selectImages}
          onImageError={onImageError}
          onAddOCRImages={onAddOCRImages}
          onImageDragging={onImageDragging}
          onConfirmSelection={onConfirmSelection}
          onRecognizeImages={onRecognizeImages}
          emptyContent={state.imageCatalog.length ? undefined : (
            <button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className={`sales-library-empty ${salesFocusClass}`}>
              <ImagePlus size={22} aria-hidden />
              <strong>{isUploading ? '正在上传图片' : dragging ? '松开以添加图片' : '采集链接，或上传商品图片'}</strong>
              <span>支持拖入本地图片或文件夹</span>
            </button>
          )}
        />
      </div>

      {showSettings && <SalesProductSettings state={state} profile={profile} imageUrl={thumb} disabled={isBusy} onChange={updateState} onClose={() => { setShowSettings(false); settingsTriggerRef.current?.focus(); }} onCollect={isCollected ? onCollect : undefined} onChangeLink={() => { setShowUrlRow(true); requestAnimationFrame(() => urlInputRef.current?.focus()); }} onResetProduct={onResetProduct} />}

    </section>
  );
}

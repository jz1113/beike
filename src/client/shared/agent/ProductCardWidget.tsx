import { useState, useEffect, useRef } from 'react';
import SocialCollectionGallery from './SocialCollectionGallery';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { 
  Copy, 
  Check, 
  Pin, 
  Sparkles, 
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Maximize2, X,
  ImageIcon
} from 'lucide-react';
import { ProductWidgetData } from '@client/store';

function dedupeUrls(urls: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const res: string[] = [];
  for (const item of urls) {
    if (!item || typeof item !== 'string') continue;
    const u = item.trim();
    if (!u.startsWith('http') && !u.startsWith('//')) continue;
    let canonical = u;
    try {
      const p = new URL(u.startsWith('//') ? 'https:' + u : u);
      canonical = `${p.hostname}${p.pathname}`.toLowerCase();
    } catch {
      canonical = u.split('?')[0].toLowerCase();
    }
    if (!seen.has(canonical)) {
      seen.add(canonical);
      res.push(u.startsWith('//') ? 'https:' + u : u);
    }
  }
  return res;
}

interface Props {
  product: ProductWidgetData;
  onAnalyzeImages?: () => void;
  onSetAsReference?: (imageUrl: string) => void;
  onGenerateShotsForProduct?: (productTitle: string) => void;
  onPreviewImage?: (imageUrl: string) => void;
}


export default function ProductCardWidget({
  product,
  onAnalyzeImages,
  onSetAsReference,
  onGenerateShotsForProduct,
  onPreviewImage
}: Props) {
  const isSocial = ['social', 'xiaohongshu', 'douyin', 'kuaishou', 'weibo'].includes(product.platform);
  useEffect(() => { setSelectedImage(null); setActiveTab('all'); setThumbnailPage(0); }, [product.itemId]);
  const [activeTab, setActiveTab] = useState<'all' | 'main' | 'detail' | 'sku'>('all');
  const [thumbnailPage, setThumbnailPage] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copiedSku, setCopiedSku] = useState(false);
  const [pinnedUrl, setPinnedUrl] = useState<string | null>(null);

  // 🌟 严格指纹去重（消除外站/电商跨 Tab 重复图片）
  const allImages = dedupeUrls(product.allImages?.length 
    ? product.allImages 
    : [...(product.mainImages || []), ...(product.detailImages || []), ...(product.skuImages || []), product.picUrl || '']);
  
  const mainImages = dedupeUrls(product.mainImages || []);
  const detailImages = dedupeUrls(product.detailImages || []).filter(u => !mainImages.includes(u));
  const skuImages = dedupeUrls(product.skuImages || []).filter(u => !mainImages.includes(u) && !detailImages.includes(u));

  const displayedImages = activeTab === 'main' 
    ? (mainImages.length > 0 ? mainImages : allImages) 
    : activeTab === 'detail' 
      ? (detailImages.length > 0 ? detailImages : allImages) 
      : activeTab === 'sku' 
        ? (skuImages.length > 0 ? skuImages : allImages) 
        : allImages;

  const currentImage = selectedImage && displayedImages.includes(selectedImage) ? selectedImage : displayedImages[0];

  const previewDialog = useRef<HTMLDialogElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copyImageStatus, setCopyImageStatus] = useState('');
  const copyOriginalImage = async () => {
    if (!currentImage) return;
    try {
      await navigator.clipboard.writeText(new URL(currentImage, window.location.href).href);
      setCopyImageStatus('已复制原图链接');
    } catch {
      setCopyImageStatus('复制失败，请重试');
    }
  };
  const [previewDimensions, setPreviewDimensions] = useState<{ url: string; ratio: number } | null>(null);
  const previewRatio = previewDimensions?.url === currentImage ? previewDimensions.ratio : 1;
  const recordPreviewDimensions = (image: HTMLImageElement) => {
    if (image.naturalWidth && image.naturalHeight) {
      setPreviewDimensions({ url: currentImage, ratio: image.naturalWidth / image.naturalHeight });
    }
  };
  const [originalStatus, setOriginalStatus] = useState<{ url: string; failed: boolean } | null>(null);
  const [loadedPreview, setLoadedPreview] = useState<string | null>(null);
  const imageIndex = displayedImages.indexOf(currentImage);
  const thumbnailsPerPage = 8;
  const lastThumbnailPage = Math.max(0, Math.ceil(displayedImages.length / thumbnailsPerPage) - 1);
  const page = Math.min(thumbnailPage, lastThumbnailPage);
  const thumbnailStart = page * thumbnailsPerPage;
  const thumbnailArrowClass = 'grid h-7 w-full shrink-0 place-items-center rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20';
  const changePreviewImage = (offset: number) => {
    const nextImage = displayedImages[imageIndex + offset];
    if (nextImage) {
      setCopyImageStatus('');
      setOriginalStatus(null);
      setSelectedImage(nextImage);
      setThumbnailPage(Math.floor((imageIndex + offset) / thumbnailsPerPage));
    }
  };

  const propsList = Object.entries(product.props || {});
  const detailFields = { ...product.props };
  if (product.itemId) detailFields['商品编号'] = product.itemId;
  if (product.shopName) detailFields['店铺'] = product.shopName;
  const featuredKeys = ['厚度', '版型', '上市时间', '面料', '材质'];
  const featuredDetails = featuredKeys.filter(key => detailFields[key] && detailFields[key].length <= 18);
  const otherDetails = Object.entries(detailFields).filter(([key]) => !featuredDetails.includes(key));
  const wideDetails = otherDetails.filter(([key, value]) => key === '材质' || value.length > 18);
  const compactDetails = otherDetails.filter(entry => !wideDetails.includes(entry));
  const currentSpecs = Object.entries(product.currentSpecs || {});
  const selectedColor = product.variantMetadata?.variants?.find(
    variant => variant.id === product.variantMetadata?.selectedVariantId,
  )?.color;
  const highlights = currentSpecs.length ? currentSpecs : [
    ...(selectedColor ? [['颜色', selectedColor]] : []),
    ...propsList.filter(([key]) => /^(尺码|尺寸|规格|size|specification)$/i.test(key) ||
      (!selectedColor && /^(颜色|颜色分类|color|colour)$/i.test(key))),
  ];

  const [copySkuError, setCopySkuError] = useState('');
  const handleCopySku = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.itemId) {
      try { await navigator.clipboard.writeText(product.itemId); setCopySkuError(''); setCopiedSku(true); setTimeout(() => setCopiedSku(false), 2000); }
      catch { setCopySkuError('复制失败，请手动复制商品编号'); }
    }
  };

  const handlePin = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedUrl(url);
    if (onSetAsReference) {
      onSetAsReference(url);
    }
  };

  if (isSocial) return <SocialCollectionGallery product={product} images={allImages} onAnalyzeImages={onAnalyzeImages} onSetAsReference={onSetAsReference} onPreviewImage={onPreviewImage} />;

  const platformName: Record<string, string> = { jd: '京东', taobao: '淘宝 / 天猫', tmall: '淘宝 / 天猫', '1688': '1688', pinduoduo: '拼多多' };
  const tabs = [
    { id: 'all' as const, label: '全部', count: allImages.length },
    { id: 'main' as const, label: '主图', count: mainImages.length },
    { id: 'detail' as const, label: '详情', count: detailImages.length },
    { id: 'sku' as const, label: '规格图', count: skuImages.length },
  ];

  return (
    <section aria-label="采集的商品信息" className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm dark:border-white/10 dark:bg-[#18191c] dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <span className="text-xs font-semibold text-rose-600">{platformName[product.platform] || product.platform} · {product.shopName?.trim() || '店铺未采集到'}</span>
        <button type="button" onClick={handleCopySku} className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10" title="复制商品编号">
          {copiedSku ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />} 商品编号 {product.itemId}
        </button>
      </div>
      {copySkuError && <p role="alert" className="px-4 pt-2 text-xs text-rose-600">{copySkuError}</p>}
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col self-start lg:self-stretch">
          <div className="flex flex-1 gap-2">
            <div aria-label="商品图片缩略图" className="flex w-14 shrink-0 flex-col gap-2">
              {lastThumbnailPage > 0 && <button type="button" aria-label="上一页缩略图" disabled={page === 0} onClick={() => setThumbnailPage(page - 1)} className={thumbnailArrowClass}><ChevronUp size={16} /></button>}
              {displayedImages.slice(thumbnailStart, thumbnailStart + thumbnailsPerPage).map((url, index) => <button type="button" key={url} onClick={() => setSelectedImage(url)} aria-label={`查看商品图片 ${thumbnailStart + index + 1}`} aria-pressed={currentImage === url} className={`h-14 w-full shrink-0 overflow-hidden rounded-md border bg-white lg:grow ${currentImage === url ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-white/10'}`}>
                <img src={proxyMediaUrl(url, { thumb: true, width: 160 })} alt="" loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" onError={(e) => { if (!e.currentTarget.dataset.retried) { e.currentTarget.dataset.retried = '1'; e.currentTarget.src = url; } }} className="h-full w-full object-contain" />
              </button>)}
              {lastThumbnailPage > 0 && <button type="button" aria-label="下一页缩略图" disabled={page === lastThumbnailPage} onClick={() => setThumbnailPage(page + 1)} className={thumbnailArrowClass}><ChevronDown size={16} /></button>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              {currentImage ? <button type="button" onClick={() => { previewDialog.current?.showModal(); setPreviewOpen(true); }} aria-label="放大查看当前商品图片" className="relative flex aspect-square w-full flex-1 cursor-zoom-in items-center justify-center overflow-hidden rounded-lg bg-white lg:aspect-auto lg:min-h-96">
                {loadedPreview !== currentImage && (
                  <img src={proxyMediaUrl(currentImage, { thumb: true, width: 160 })} alt="" aria-hidden="true" decoding="async" className="absolute inset-0 h-full w-full object-contain" />
                )}
                <img key={currentImage} src={proxyMediaUrl(currentImage, { thumb: true, width: 800 })} fetchPriority="high" decoding="async" onLoad={() => setLoadedPreview(currentImage)} alt={`${product.title} 商品图片`} referrerPolicy="no-referrer" onError={(e) => { const image = e.currentTarget; if (!image.dataset.retried) { image.dataset.retried = '1'; image.src = proxyMediaUrl(currentImage, { thumb: true, width: 160 }); } else if (image.dataset.retried === '1') { image.dataset.retried = '2'; image.src = currentImage; } }} className="absolute inset-0 h-full w-full object-contain" />
                <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-black/75 px-2.5 py-1.5 text-xs font-medium text-white">
                  <Maximize2 size={14} aria-hidden="true" /> 查看大图
                </span>
              </button> : <div className="flex aspect-square flex-1 items-center justify-center rounded-lg bg-slate-50 lg:aspect-auto lg:min-h-96 text-sm text-slate-400 dark:bg-white/5"><ImageIcon className="mr-2 h-5 w-5" />暂无图片</div>}
              {currentImage && onSetAsReference && <button type="button" onClick={(e) => handlePin(currentImage, e)} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10"><Pin className="h-3.5 w-3.5" />{pinnedUrl === currentImage ? '已添加为参考' : '添加当前图片为参考'}</button>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="图片分类">
            {tabs.filter(tab => tab.id === 'all' || tab.count > 0).map(tab => <button type="button" key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedImage(null); setThumbnailPage(0); }} aria-pressed={activeTab === tab.id} className={`rounded-md px-2.5 py-1.5 text-xs ${activeTab === tab.id ? 'bg-rose-50 font-semibold text-rose-600 dark:bg-rose-500/15' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300'}`}>{tab.label} {tab.count}</button>)}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div><h3 className="break-words text-lg font-semibold leading-snug text-slate-900 dark:text-white">{product.title || '未提供商品标题'}</h3>{product.category && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{product.category}</p>}</div>
          <div className="rounded-lg bg-rose-50 px-4 py-3 dark:bg-rose-500/10"><span className="mr-3 text-sm text-slate-600 dark:text-slate-400">采集价格</span>{product.price !== undefined && product.price !== '' ? <span className="text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-300">¥{product.price}</span> : <span className="text-sm text-slate-500">暂无价格</span>}</div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{currentSpecs.length || !highlights.length ? '当前规格' : '规格摘要'}</h4>
            {highlights.length ? (
              <dl className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {highlights.map(([key, value]) => (
                  <div key={key} className="flex min-w-0 flex-wrap gap-x-2 rounded-md bg-slate-100 px-3 py-2 dark:bg-white/5">
                    <dt className="text-slate-600 dark:text-slate-400">{key}</dt>
                    <dd className="min-w-0 break-words font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-slate-600 dark:text-slate-400">当前 SKU 暂无可核实的规格</p>}
            {(!product.shopName || !highlights.length) && product.platform === 'jd' && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                历史缓存可能缺少字段。可发送「重新采集 京东 {product.itemId}」更新，可能产生采集费用。
              </p>
            )}
          </div>
          {(featuredDetails.length > 0 || otherDetails.length > 0) && (
            <section className="border-t border-slate-200 pt-4 dark:border-white/10">
              <h4 className="mb-3 text-base font-semibold leading-6">商品详情</h4>
              {featuredDetails.length > 0 && (
                <dl className="mb-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-100 px-4 py-3.5 text-center sm:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] dark:bg-white/5">
                  {featuredDetails.map(key => (
                    <div key={key} className="flex min-w-0 flex-col">
                      <dt className="order-2 mt-0.5 text-xs font-normal leading-5 text-slate-600 dark:text-slate-400">{key}</dt>
                      <dd className="break-words text-sm font-semibold leading-6">{detailFields[key]}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <dl className="grid lg:grid-cols-2">
                {[...compactDetails, ...wideDetails].map(([key, value], index) => (
                  <div key={key} className={`grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-2 border-b border-slate-200 px-2 py-2 text-sm leading-6 dark:border-white/10 ${index >= compactDetails.length ? "lg:col-span-2" : ""}`}>
                    <dt className="break-words font-normal text-slate-600 dark:text-slate-400">{key}</dt>
                    <dd className="break-words font-normal tabular-nums text-slate-800 dark:text-slate-200">{value.replace(/[,，]\s*/g, '、')}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {onGenerateShotsForProduct && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            {onGenerateShotsForProduct && <button type="button" onClick={() => onGenerateShotsForProduct(product.title)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10"><Sparkles className="h-3.5 w-3.5" />构思生图提示词</button>}
          </div>}
        </div>
      </div>
      <dialog
        ref={previewDialog}
        aria-label="商品图片预览"
        onClose={() => {
          setPreviewOpen(false);
          setOriginalStatus(null);
          setCopyImageStatus('');
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          changePreviewImage(event.key === 'ArrowLeft' ? -1 : 1);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="fixed inset-0 m-auto max-h-none max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-black/85"
      >
        {previewOpen && currentImage && (
          <div className="relative mb-14"
            style={{ aspectRatio: previewRatio, width: `min(calc(100vw - 7rem), 1100px, ${78 * previewRatio}dvh, ${850 * previewRatio}px)` }}>
            <button type="button" aria-label="关闭预览" onClick={() => previewDialog.current?.close()} className={`absolute right-2 z-10 grid size-11 place-items-center rounded-full bg-black/75 hover:bg-black ${previewRatio > 4 ? "bottom-full mb-2" : "top-2"}`}><X size={22} /></button>
            {(!originalStatus || originalStatus.url !== currentImage || originalStatus.failed) && (
              <>
                <img src={proxyMediaUrl(currentImage, { thumb: true, width: 800 })} alt="" aria-hidden="true"
                  onLoad={(event) => recordPreviewDimensions(event.currentTarget)}
                  className="absolute inset-0 size-full rounded-lg object-contain" />
                <p role="status" className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-black/75 px-3 py-1.5 text-xs">
                  {originalStatus?.url === currentImage && originalStatus.failed ? '原图加载失败，正在显示预览' : '正在加载原图…'}
                </p>
              </>
            )}
            <img key={currentImage} src={proxyMediaUrl(currentImage)} alt={`商品图片 ${imageIndex + 1}`} referrerPolicy="no-referrer"
              onLoad={(event) => {
                recordPreviewDimensions(event.currentTarget);
                setOriginalStatus({ url: currentImage, failed: false });
              }}
              onError={(event) => {
                const image = event.currentTarget;
                if (!image.dataset.retried) {
                  image.dataset.retried = '1';
                  image.src = currentImage;
                } else {
                  setOriginalStatus({ url: currentImage, failed: true });
                }
              }}
              className={`absolute inset-0 size-full rounded-lg object-contain ${originalStatus?.url === currentImage && !originalStatus.failed ? '' : 'opacity-0'}`} />
            {displayedImages.length > 1 && (
              <>
                <button type="button" aria-label="上一张" disabled={imageIndex <= 0} onClick={() => changePreviewImage(-1)} className="absolute right-full top-1/2 mr-1 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-neutral-900/90 hover:bg-neutral-700 disabled:opacity-50 sm:mr-2"><ChevronLeft size={22} /></button>
                <button type="button" aria-label="下一张" disabled={imageIndex >= displayedImages.length - 1} onClick={() => changePreviewImage(1)} className="absolute left-full top-1/2 ml-1 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-neutral-900/90 hover:bg-neutral-700 disabled:opacity-50 sm:ml-2"><ChevronRight size={22} /></button>
              </>
            )}
            <div className="absolute left-1/2 top-full mt-2 flex w-max min-w-full -translate-x-1/2 items-center justify-between gap-3">
              <span className="whitespace-nowrap rounded-full bg-neutral-900 px-3 py-1 text-sm tabular-nums" aria-live="polite">
                {copyImageStatus || `${imageIndex + 1} / ${displayedImages.length}`}
              </span>
              <button type="button" onClick={() => void copyOriginalImage()}
                className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-700">
                <Copy size={16} aria-hidden="true" /> 复制原图链接
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

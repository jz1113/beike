'use client';
import { useState } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { 
  ShoppingBag, 
  ExternalLink, 
  Copy, 
  Check, 
  Pin, 
  Sparkles, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  ImageIcon,
  Eye
} from 'lucide-react';
import { ProductWidgetData } from '@/store/useAppStore';
import { JdIcon, TaobaoIcon } from '@/shared/ui/BrandIcons';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';

interface Props {
  product: ProductWidgetData;
  onSetAsReference?: (imageUrl: string) => void;
  onLoadToStudio?: (product: any, images: any) => void;
  onGenerateShotsForProduct?: (productTitle: string) => void;
  onPreviewImage?: (imageUrl: string) => void;
}

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

export default function ProductCardWidget({
  product,
  onSetAsReference,
  onLoadToStudio,
  onGenerateShotsForProduct,
  onPreviewImage
}: Props) {
  const [activeTab, setActiveTab] = useState<'all' | 'main' | 'detail' | 'sku'>('all');
  const [isPropsExpanded, setIsPropsExpanded] = useState(true);
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

  const propsList = Object.entries(product.props || {});

  const handleCopySku = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.itemId) {
      navigator.clipboard.writeText(product.itemId);
      setCopiedSku(true);
      setTimeout(() => setCopiedSku(false), 2000);
    }
  };

  const handlePin = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedUrl(url);
    if (onSetAsReference) {
      onSetAsReference(url);
    }
  };

  return (
    <div className="mt-3 rounded-2xl bg-white border border-slate-200/90 shadow-md overflow-hidden text-slate-800 animate-fade-in font-sans">
      {/* 1. 商品/社媒卡片顶部栏 */}
      <div className="p-3.5 bg-gradient-to-r from-blue-50/80 via-slate-50/60 to-purple-50/70 border-b border-slate-100 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {product.platform === 'xiaohongshu' ? (
              <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold flex items-center gap-1 shrink-0">
                🔴 小红书图集
              </span>
            ) : product.platform === 'douyin' ? (
              <span className="px-2 py-0.5 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 text-[10px] font-bold flex items-center gap-1 shrink-0">
                🎵 抖音图集
              </span>
            ) : product.platform === 'kuaishou' ? (
              <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold flex items-center gap-1 shrink-0">
                ⚡ 快手图集
              </span>
            ) : product.platform === 'weibo' ? (
              <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1 shrink-0">
                📱 微博图集
              </span>
            ) : product.platform === 'social' ? (
              <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold flex items-center gap-1 shrink-0">
                🌐 外站社媒
              </span>
            ) : product.platform === 'taobao' || product.platform === 'tmall' ? (
              <span className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold flex items-center gap-1 shrink-0">
                <TaobaoIcon className="w-3 h-3" /> 淘宝/天猫
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold flex items-center gap-1 shrink-0">
                <JdIcon className="w-3 h-3" /> 京东精选
              </span>
            )}
            
            <span className="text-xs font-bold text-slate-900 truncate" title={product.title}>
              {product.title}
            </span>
          </div>

          {/* SKU / 作品ID 复制 */}
          <button
            onClick={handleCopySku}
            className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-[10px] font-mono flex items-center gap-1 transition-colors shrink-0 cursor-pointer border border-slate-200 shadow-2xs"
            title="点击复制商品/作品 ID"
          >
            {copiedSku ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span className="max-w-[80px] truncate">{product.itemId}</span>
          </button>
        </div>

        {/* 创作者 / 价格与分类状态 */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            {product.author && (
              <span className="px-2 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200 text-[10px] font-medium shadow-2xs">
                👤 {product.author}
              </span>
            )}
            {product.price && (
              <span className="text-red-600 font-bold text-sm">
                ¥{product.price}
              </span>
            )}
            {product.category && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">
                {product.category}
              </span>
            )}
            {product.apiUsed && (
              <span className="text-[10px] text-emerald-600 font-mono font-medium">
                ● {product.apiUsed}
              </span>
            )}
          </div>

          <span className="text-[10px] text-slate-500">
            共提取到 <strong className="text-blue-600 font-bold">{allImages.length}</strong> 张高清素材
          </span>
        </div>
      </div>

      {/* 2. 核心规格参数 (Props 全量完整展示区) */}
      {propsList.length > 0 && (
        <div className="px-3.5 py-3 bg-slate-50/70 border-b border-slate-100 text-xs">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <span className="font-bold flex items-center gap-1.5 text-[12px] text-slate-800">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>商品全量规格参数 (Props 完整提取 · {propsList.length} 项)</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-mono font-medium">
                无删减
              </span>
            </div>
            
            <button
              onClick={() => setIsPropsExpanded(!isPropsExpanded)}
              className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 text-[10px] flex items-center gap-1 transition-colors cursor-pointer border border-slate-200 shadow-2xs"
            >
              <span>{isPropsExpanded ? '收起面板' : `展开全部 (${propsList.length} 项)`}</span>
              {isPropsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {isPropsExpanded && (
            <div className="mt-2.5 space-y-2 animate-fade-in max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {/* SKU 多规格选项展示 */}
              {product.props?.['可选配置/规格 (SKU)'] && (
                <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100">
                  <span className="text-[11px] font-bold text-blue-800 block mb-1.5">
                    ⚙️ 可选配置与外观规格 (SKU):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {product.props['可选配置/规格 (SKU)'].split('|').map((skuItem, sIdx) => {
                      const trimmed = skuItem.trim();
                      if (!trimmed) return null;
                      return (
                        <span 
                          key={sIdx}
                          className="px-2 py-0.5 rounded-md bg-white text-slate-700 text-[10px] font-medium border border-slate-200 shadow-2xs"
                        >
                          {trimmed}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 其余全部详细参数网格 (自适应换行，无删减截断) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {propsList
                  .filter(([key]) => key !== '可选配置/规格 (SKU)')
                  .map(([key, val], idx) => (
                    <div 
                      key={idx} 
                      className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 flex flex-col gap-0.5 text-[11px] transition-colors shadow-2xs"
                    >
                      <span className="text-slate-500 font-medium text-[10px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {key}
                      </span>
                      <span className="text-slate-800 font-semibold break-words leading-relaxed pl-2.5">
                        {val}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. 交互式素材图片画廊 */}
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          {/* 分类 Tab */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 border border-slate-200/80 text-[11px]">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                activeTab === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              全部 ({allImages.length})
            </button>
            {mainImages.length > 0 && (
              <button
                onClick={() => setActiveTab('main')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                  activeTab === 'main' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                主图 ({mainImages.length})
              </button>
            )}
            {detailImages.length > 0 && (
              <button
                onClick={() => setActiveTab('detail')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                  activeTab === 'detail' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                详情 ({detailImages.length})
              </button>
            )}
            {skuImages.length > 0 && (
              <button
                onClick={() => setActiveTab('sku')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                  activeTab === 'sku' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                SKU ({skuImages.length})
              </button>
            )}
          </div>

          <span className="text-[10px] text-slate-400 hidden sm:inline">
            💡 点击图片设为生图垫图
          </span>
        </div>

        {/* 图片缩略图网格 (支持点击放大预览与一键垫图) */}
        {displayedImages.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-1.5">
            <ImageIcon className="w-6 h-6 opacity-30" />
            <span>该分类下暂无图片素材</span>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
            {displayedImages.map((imgUrl, idx) => {
              const isPinned = pinnedUrl === imgUrl;
              return (
                <div 
                  key={idx}
                  onClick={() => onPreviewImage && onPreviewImage(imgUrl)}
                  className={`group relative aspect-square rounded-xl overflow-hidden bg-white border transition-all cursor-pointer shadow-2xs hover:border-blue-500 hover:scale-105 ${
                    isPinned ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-200'
                  }`}
                  title="点击查看大图"
                >
                  <img 
                    src={normalizeImageUrlToStandardJpg(imgUrl) || imgUrl} 
                    alt={`商品图 ${idx + 1}`} 
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.dataset.hasRetried && imgUrl) {
                        target.dataset.hasRetried = 'true';
                        target.src = proxyMediaUrl(imgUrl);
                      }
                    }}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* 悬浮操作层 */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                    <button
                      onClick={(e) => handlePin(imgUrl, e)}
                      className="px-1.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold flex items-center gap-0.5 shadow-md transition-transform active:scale-95 cursor-pointer"
                      title="设为生图垫图 (图1)"
                    >
                      <Pin className="w-2.5 h-2.5" />
                      <span>垫图</span>
                    </button>
                  </div>

                  {/* 已固定垫图标签 */}
                  {isPinned && (
                    <div className="absolute top-1 right-1 z-10 px-1 py-0.2 rounded-md bg-blue-600 text-white text-[8px] font-bold flex items-center gap-0.5 shadow-xs">
                      <Pin className="w-2 h-2" /> 垫图1
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 4. 底部快捷操作条 */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => {
              if (onGenerateShotsForProduct) {
                onGenerateShotsForProduct(product.title);
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 hover:from-red-500 hover:to-orange-400 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>🎨 一键为该商品构思6张分镜</span>
          </button>

          {onLoadToStudio && (
            <button
              onClick={() => {
                onLoadToStudio(
                  {
                    title: product.title,
                    itemId: product.itemId,
                    price: product.price || '---',
                    platform: product.platform
                  },
                  {
                    main: mainImages,
                    details: detailImages,
                    skus: skuImages
                  }
                );
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border border-slate-200"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
              <span>载入生图工坊</span>
              <ArrowRight className="w-3 h-3 ml-0.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

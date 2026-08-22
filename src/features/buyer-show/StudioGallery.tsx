'use client';
import { useState, useRef } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { downloadMediaOrOpen } from '@/lib/downloadMedia';
import { useAppStore } from '@/store/useAppStore';
import { compressImageToDataUrl } from '@/lib/image-utils';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { 
  Check, 
  Eye, 
  Download, 
  Copy, 
  Sparkles, 
  CheckSquare, 
  Square, 
  Camera, 
  ArrowRight,
  Maximize2,
  X,
  Headphones,
  Zap,
  Monitor,
  Layers,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Flame,
  Upload,
  Plus,
  Tag,
  Hash,
  Sparkle,
  Image as ImageIcon,
  CheckCircle2,
  Star,
  Crown,
  ArrowLeft
} from 'lucide-react';
import { JdIcon, TaobaoIcon } from '@/shared/ui/BrandIcons';

interface Props {
  onNextStep: () => void;
  hideFloatingCta?: boolean;
}

export default function StudioGallery({ onNextStep, hideFloatingCta }: Props) {
  const [filterType, setFilterType] = useState<'all' | 'main' | 'sku' | 'detail'>('all');
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isDraggingSupplement, setIsDraggingSupplement] = useState(false);

  const supplementInputRef = useRef<HTMLInputElement>(null);

  const { 
    images, 
    toggleImageSelection, 
    selectAllImages, 
    deselectAllImages, 
    product,
    workshopMode,
    socialGalleryTab,
    setSocialGalleryTab,
    setTargetProductImage,
    clonedSocialImages,
    toggleClonedSocialImage,
    selectAllClonedImages,
    modelPersona,
    anchorFaceImageUrl
  } = useAppStore();

  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>, rawUrl?: string) => {
    const target = e.currentTarget;
    if (!target.dataset.hasRetried && rawUrl) {
      target.dataset.hasRetried = 'true';
      target.src = proxyMediaUrl(rawUrl);
    }
  };

  const selectedCount = images.filter(img => img.selected).length;
  const selectedClonedCount = clonedSocialImages.filter(img => img.selected).length;
  const mainCount = images.filter(img => img.type === 'main').length;
  const skuCount = images.filter(img => img.type === 'sku').length;
  const detailCount = images.filter(img => img.type === 'detail').length;

  const filteredImages = filterType === 'all' 
    ? images 
    : images.filter(img => img.type === filterType);

  const loadDemoProduct = (type: 'headphone' | 'dyson' | 'monitor') => {
    let title = '';
    let picUrl = '';
    let mainImages: string[] = [];
    let skuImages: string[] = [];
    let detailImages: string[] = [];

    if (type === 'headphone') {
      title = 'Sony WH-1000XM5 旗舰无线降噪头戴式耳机 (银白金)';
      picUrl = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80';
      mainImages = [
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80'
      ];
      skuImages = [
        'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&auto=format&fit=crop&q=80'
      ];
      detailImages = [
        'https://images.unsplash.com/photo-1524678606370-a47ad25cb82a?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1577174881658-0f30ed549adc?w=800&auto=format&fit=crop&q=80'
      ];
    } else if (type === 'dyson') {
      title = '戴森 Supersonic HD15 智能温控高速负离子吹风机';
      picUrl = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80';
      mainImages = [
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=800&auto=format&fit=crop&q=80'
      ];
      skuImages = [
        'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&auto=format&fit=crop&q=80'
      ];
      detailImages = [
        'https://images.unsplash.com/photo-1585751119414-ef2636f8aede?w=800&auto=format&fit=crop&q=80'
      ];
    } else {
      title = 'AOC 27英寸 4K 144Hz IPS 高清广色域专业电竞显示器';
      picUrl = 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80';
      mainImages = [
        'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1586210579191-33b45e38fa2c?w=800&auto=format&fit=crop&q=80'
      ];
      skuImages = [
        'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80'
      ];
      detailImages = [
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80'
      ];
    }

    const demoProduct = {
      id: 'demo_' + Date.now(),
      platform: 'jd',
      itemId: 'DEMO_' + Date.now(),
      title,
      picUrl,
      createdAt: new Date().toISOString()
    };

    useAppStore.getState().setProductData(
      demoProduct,
      { main: mainImages, skus: skuImages, details: detailImages },
      '🚀 官方演示商品一键载入'
    );
    showToast(`已载入示范商品: ${title.slice(0, 16)}...`);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const copyUrl = (url: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedIdx(idx);
    showToast('图片链接已复制');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const downloadSingle = async (url: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await downloadMediaOrOpen(url, `product_img_${idx + 1}.jpg`);
  };

  // 补充上传本地图片到当前商品素材池
  const handleSupplementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const newImgs: any[] = [];
      for (let i = 0; i < files.length; i++) {
        const url = await compressImageToDataUrl(files[i], 1200, 0.85);
        newImgs.push({
          url,
          type: 'detail',
          selected: true
        });
      }
      const existing = useAppStore.getState().images;
      useAppStore.setState({ images: [...existing, ...newImgs] });
      showToast(`已成功补充 ${newImgs.length} 张本地素材`);
    } catch (err) {
      console.error('补充上传失败:', err);
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8F9FA] relative select-none">
      {/* Toast message popup */}
      {toastMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700 animate-fade-in flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 隐藏的补充图片文件输入 */}
      <input
        ref={supplementInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleSupplementUpload}
        className="hidden"
      />

      {/* 爆款换人换品工坊画廊模式 (支持双源素材 Tab 切换：爆款分镜参考图 vs 目标商品实拍素材) */}
      {workshopMode === 'social_face_product_swap' ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header Bar: 双源素材 Tab 切换器 + 快捷操作 */}
          <div className="px-5 py-3 border-b border-slate-200/80 bg-white/90 backdrop-blur-md flex items-center justify-between flex-shrink-0 gap-3 flex-wrap">
            {/* Tab 切换药丸 */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-100/90 border border-slate-200/80 text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => setSocialGalleryTab('social')}
                className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                  socialGalleryTab === 'social'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>参考分镜</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  socialGalleryTab === 'social' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {selectedClonedCount}/{clonedSocialImages.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSocialGalleryTab('product')}
                className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                  socialGalleryTab === 'product'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>商品图库</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  socialGalleryTab === 'product' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {images.length}
                </span>
              </button>
            </div>

            {/* 右侧快捷工具栏 */}
            {socialGalleryTab === 'social' ? (
              <div className="flex items-center gap-2">
                {clonedSocialImages.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => selectAllClonedImages(true)}
                      className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => selectAllClonedImages(false)}
                      className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                    >
                      清空
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSocialGalleryTab('product')}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-slate-200"
                  title="查看或切换目标商品的实物素材"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>商品 ({images.length})</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Filter Tabs in Product Tab */}
                <div className="hidden md:flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer ${
                      filterType === 'all' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    全部 ({images.length})
                  </button>
                  {mainCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('main')}
                      className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer ${
                        filterType === 'main' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      主图 ({mainCount})
                    </button>
                  )}
                  {skuCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('sku')}
                      className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer ${
                        filterType === 'sku' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      SKU ({skuCount})
                    </button>
                  )}
                  {detailCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('detail')}
                      className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer ${
                        filterType === 'detail' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      详情 ({detailCount})
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => supplementInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>补充实拍</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSocialGalleryTab('social')}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-slate-200"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>返回分镜图集 ({selectedClonedCount})</span>
                </button>
              </div>
            )}
          </div>

          {/* Tab 1 内容：爆款分镜参考图集 */}
          {socialGalleryTab === 'social' ? (
            clonedSocialImages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 animate-fade-in max-w-md mx-auto">
                <div className="w-20 h-20 rounded-3xl bg-indigo-50 border border-indigo-100 p-4 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-indigo-500" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    等待载入参考图
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    在左侧粘贴笔记链接或上传本地图片，采集后在此勾选要用的分镜
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* 目标资产与模特绑定摘要横幅 */}
                <div className="p-3 rounded-2xl bg-white border border-slate-200 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">商品:</span>
                      {product?.picUrl ? (
                        <div 
                          onClick={() => setSocialGalleryTab('product')}
                          className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200 cursor-pointer hover:border-indigo-300 group"
                          title="更换主图"
                        >
                          <img 
                            src={normalizeImageUrlToStandardJpg(product.picUrl)} 
                            alt="" 
                            referrerPolicy="no-referrer"
                            onError={(e) => handleImgError(e, product.picUrl)}
                            className="w-5 h-5 rounded-lg object-cover border border-slate-100" 
                          />
                          <span className="text-xs font-bold text-slate-900 max-w-[140px] truncate">{product.title || '目标实物'}</span>
                          <span className="text-[10px] text-indigo-600 font-bold ml-1 group-hover:underline">更换</span>
                        </div>
                      ) : (
                        <span 
                          onClick={() => setSocialGalleryTab('product')}
                          className="text-xs text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded-xl border border-amber-200 cursor-pointer hover:bg-amber-100"
                        >
                          未绑定商品
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">人脸:</span>
                      {anchorFaceImageUrl ? (
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                          <img 
                            src={anchorFaceImageUrl} 
                            alt="" 
                            referrerPolicy="no-referrer"
                            onError={(e) => handleImgError(e, anchorFaceImageUrl)}
                            className="w-5 h-5 rounded-full object-cover border border-slate-200" 
                          />
                          <span className="text-xs font-bold text-rose-700">已锁定专属真人脸</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600 bg-white px-2 py-1 rounded-xl border border-slate-200">
                          {modelPersona ? modelPersona.split(' ')[0] : '纯商品无模特'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-pink-700 font-bold bg-pink-100/70 border border-pink-200 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-pink-600" />
                    <span>已勾选 {selectedClonedCount} 组爆款机位（将生成 {selectedClonedCount} 张大片）</span>
                  </div>
                </div>

                {/* 参考图集网格 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-24">
                  {clonedSocialImages.map((img, idx) => (
                    <div
                      key={idx}
                      onClick={() => toggleClonedSocialImage(idx)}
                      className={`relative group cursor-pointer rounded-2xl overflow-hidden aspect-square border-2 transition-all duration-200 bg-white ${
                        img.selected
                          ? 'border-pink-500 shadow-[0_4px_20px_rgba(244,63,94,0.25)] ring-2 ring-pink-500/20 scale-[0.98]'
                          : 'border-slate-200/80 hover:border-pink-300 hover:shadow-md opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* Badge */}
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] text-white font-bold tracking-wider pointer-events-none shadow-sm">
                        参考分镜 #{idx + 1}
                      </div>

                      {/* Checkmark */}
                      <div className={`absolute top-2 right-2 z-10 transition-all duration-200 ${img.selected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                        <div className="p-1 rounded-full bg-pink-500 text-white shadow-md border border-white">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>

                      <img
                        src={normalizeImageUrlToStandardJpg(img.url)}
                        alt={`参考图${idx + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleImgError(e, img.url)}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* Action Overlay */}
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-white">
                        <span className="text-[10px] font-mono text-pink-200">
                          分镜 {idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewIdx(idx); }}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="放大查看"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            /* Tab 2 内容：目标商品实物图库 (支持一键星标设为核心实物主垫图) */
            images.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 animate-fade-in max-w-md mx-auto">
                <div className="w-20 h-20 rounded-3xl bg-indigo-50 border border-indigo-200 p-4 flex items-center justify-center shadow-lg shadow-indigo-100">
                  <ShoppingBag className="w-10 h-10 text-indigo-600" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    尚未采集或上传商品实物素材
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    请在左侧【2. 绑定目标商品实物图】中输入京东/淘宝链接或上传本地图片，系统将在此处呈现全套实物多角度画册供您挑选
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => supplementInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-sm hover:shadow-md cursor-pointer transition-all"
                >
                  立即上传本地商品图
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* 核心主图提示横幅 */}
                <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                      <Star className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        点击卡片设为核心商品主图
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        建议选择背景干净、形态完整的正面或 45° 实拍
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSocialGalleryTab('social')}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                  >
                    <span>返回参考图 ({selectedClonedCount})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 商品图网格 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-24">
                  {filteredImages.map((img, idx) => {
                    const isCurrentTarget = img.url === (product?.picUrl || images[0]?.url);
                    return (
                      <div
                        key={idx}
                        onClick={() => setTargetProductImage(img.url)}
                        className={`relative group cursor-pointer rounded-2xl overflow-hidden aspect-square border-2 transition-all duration-200 bg-white ${
                          isCurrentTarget
                            ? 'border-emerald-500 shadow-[0_4px_20px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500 scale-[0.98]'
                            : 'border-slate-200/90 hover:border-indigo-400 hover:shadow-md'
                        }`}
                      >
                        {/* Type Badge */}
                        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] text-white font-bold tracking-wider pointer-events-none shadow-sm">
                          {img.type === 'main' ? '主图' : img.type === 'sku' ? 'SKU规格' : '详情切片'} #{idx + 1}
                        </div>

                        {/* Active Target Indicator Badge */}
                        {isCurrentTarget ? (
                          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-extrabold px-2 py-1 rounded-lg shadow-md border border-white animate-fade-in">
                            <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                            <span>主实物图</span>
                          </div>
                        ) : (
                          <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-slate-900/80 hover:bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-md backdrop-blur-md flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              <span>设为主图</span>
                            </div>
                          </div>
                        )}

                        <img
                          src={normalizeImageUrlToStandardJpg(img.url) || img.url}
                          alt={`商品实物图${idx + 1}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => handleImgError(e, img.url)}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />

                        {/* Bottom Overlay */}
                        <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-white">
                          <span className="text-[10px] font-mono text-emerald-200">
                            {isCurrentTarget ? '⭐ 当前生效实物' : '点击设为主实物'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewIdx(idx); }}
                            className="p-1 rounded-lg bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="放大查看"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        /* 原生电商商品素材画廊模式 */
        /* 原生电商商品素材画廊模式 */
        images.length === 0 ? (
          /* 全景素材采编就绪工作看板 (结构化指引 + 官方示例秒级体验) */
          <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-center max-w-5xl mx-auto w-full space-y-8 animate-fade-in select-none">
            {/* 顶部标题与状态指示 */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-extrabold shadow-2xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Step 1 · 全景电商素材采编工作台</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                准备素材 ➔ 智能视觉分析 ➔ 4K 商业生图
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
                支持在左侧输入京东、淘宝/天猫链接或直接拖入本地素材，系统将秒级分离全套高清原图
              </p>
            </div>

            {/* 3 步全链路指引卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-2.5 group">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-black text-sm group-hover:scale-110 transition-transform">
                  1
                </div>
                <div className="font-extrabold text-sm text-slate-900">多源链接 / 本地拖拽导入</div>
                <div className="text-xs text-slate-500 leading-relaxed">
                  支持商品链接、商品 ID 或本地多张商品实拍图批量导入。
                </div>
              </div>

              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-2.5 group">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm group-hover:scale-110 transition-transform">
                  2
                </div>
                <div className="font-extrabold text-sm text-slate-900">智能分拣主图 / SKU / 详情</div>
                <div className="text-xs text-slate-500 leading-relaxed">
                  AI 自动识别并归类全套商品无水印高清画册，精准剔除废图与广告水印。
                </div>
              </div>

              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-2.5 group">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 font-black text-sm group-hover:scale-110 transition-transform">
                  3
                </div>
                <div className="font-extrabold text-sm text-slate-900">一键进入 Step 2 视觉策划</div>
                <div className="text-xs text-slate-500 leading-relaxed">
                  多模态大模型智能分析商品卖点，自动生成高质感种草买家秀分镜提示词。
                </div>
              </div>
            </div>

            {/* 🌟 官方精选演示商品一键载入体验区 */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50/60 via-purple-50/30 to-slate-50 border border-indigo-100/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900">还没有商品链接？点击一键载入官方精选商品示例：</span>
                </div>
                <span className="text-[11px] text-indigo-600 font-bold hidden sm:inline">即刻体验完整 4 步出图</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Demo 1: Sony Headphone */}
                <button
                  type="button"
                  onClick={() => loadDemoProduct('headphone')}
                  className="p-3.5 rounded-2xl bg-white hover:bg-indigo-50/50 border border-slate-200/90 hover:border-indigo-300 text-left transition-all shadow-2xs hover:shadow-sm cursor-pointer group flex items-center gap-3 active:scale-95"
                >
                  <img
                    src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&auto=format&fit=crop&q=80"
                    alt="Sony Headphone"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-100 flex-shrink-0 group-hover:scale-105 transition-transform"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-xs text-slate-900 truncate">Sony WH-1000XM5</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">数码办公 · 无线降噪耳机</div>
                    <div className="text-[10px] font-bold text-indigo-600 mt-1 flex items-center gap-0.5">
                      <span>载入素材</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </div>
                  </div>
                </button>

                {/* Demo 2: Dyson */}
                <button
                  type="button"
                  onClick={() => loadDemoProduct('dyson')}
                  className="p-3.5 rounded-2xl bg-white hover:bg-pink-50/50 border border-slate-200/90 hover:border-pink-300 text-left transition-all shadow-2xs hover:shadow-sm cursor-pointer group flex items-center gap-3 active:scale-95"
                >
                  <img
                    src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=200&auto=format&fit=crop&q=80"
                    alt="Dyson Hair Dryer"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-100 flex-shrink-0 group-hover:scale-105 transition-transform"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-xs text-slate-900 truncate">戴森 Supersonic 吹风机</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">个护美妆 · 智能温控</div>
                    <div className="text-[10px] font-bold text-pink-600 mt-1 flex items-center gap-0.5">
                      <span>载入素材</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </div>
                  </div>
                </button>

                {/* Demo 3: AOC Monitor */}
                <button
                  type="button"
                  onClick={() => loadDemoProduct('monitor')}
                  className="p-3.5 rounded-2xl bg-white hover:bg-purple-50/50 border border-slate-200/90 hover:border-purple-300 text-left transition-all shadow-2xs hover:shadow-sm cursor-pointer group flex items-center gap-3 active:scale-95"
                >
                  <img
                    src="https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=200&auto=format&fit=crop&q=80"
                    alt="AOC Monitor"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-100 flex-shrink-0 group-hover:scale-105 transition-transform"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-xs text-slate-900 truncate">AOC 27寸 4K 电竞屏</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">电脑办公 · 高刷电竞屏</div>
                    <div className="text-[10px] font-bold text-purple-600 mt-1 flex items-center gap-0.5">
                      <span>载入素材</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 🌟 原生电商商品素材画廊：全新专业全景看板 */
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Top Control & Filter Header Bar */}
            <div className="px-5 py-3 border-b border-slate-200/80 bg-white/90 backdrop-blur-md flex items-center justify-between flex-shrink-0 gap-3">
              {/* Left Product Metadata Summary */}
              <div className="flex items-center gap-3 min-w-0">
                {product?.picUrl && (
                  <img
                    src={normalizeImageUrlToStandardJpg(product.picUrl)}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => handleImgError(e, product.picUrl)}
                    className="w-8 h-8 rounded-lg object-cover bg-white border border-slate-200 flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 truncate max-w-xs md:max-w-md">
                      {product?.title || '目标实物商品'}
                    </span>
                    {product?.platform && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 font-bold uppercase text-slate-600 flex-shrink-0">
                        {product.platform}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                    <span>ID: {product?.itemId || 'LOCAL'}</span>
                    <span>·</span>
                    <span className="text-indigo-600 font-bold">
                      已勾选 {selectedCount} / {images.length} 张素材
                    </span>
                  </div>
                </div>
              </div>

              {/* Center Filter Tabs */}
              <div className="hidden md:flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  全部素材 ({images.length})
                </button>
                {mainCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterType('main')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      filterType === 'main'
                        ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    主图 ({mainCount})
                  </button>
                )}
                {skuCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterType('sku')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      filterType === 'sku'
                        ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    SKU规格 ({skuCount})
                  </button>
                )}
                {detailCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterType('detail')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      filterType === 'detail'
                        ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    详情切片 ({detailCount})
                  </button>
                )}
              </div>

              {/* Right Quick Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => selectAllImages()}
                  className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => deselectAllImages()}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                >
                  清空
                </button>
                <button
                  type="button"
                  onClick={() => supplementInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="上传本地细节图/补充实拍图"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">补充实拍图</span>
                </button>
              </div>
            </div>

            {/* Main Canvas Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* 🌟 特别优化：当素材只有 1~2 张时（如仅抓取到单张主图），展示专业视觉特征锚定工作台 */}
              {images.length <= 2 ? (
                <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* 左侧：主图特写卡片 */}
                    <div className="space-y-3">
                      <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                          <span>商品外观基准底图 (已绑定)</span>
                        </span>
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          已锁定为生图垫图底图
                        </span>
                      </div>

                      <div
                        onClick={() => toggleImageSelection(0)}
                        className={`relative group cursor-pointer rounded-3xl overflow-hidden aspect-square border-2 transition-all duration-200 bg-white shadow-md ${
                          images[0]?.selected
                            ? 'border-indigo-600 ring-4 ring-indigo-500/10'
                            : 'border-slate-200 opacity-70'
                        }`}
                      >
                        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-[11px] text-white font-bold tracking-wider pointer-events-none shadow-sm">
                          首选实物素材 #1
                        </div>

                        <div className={`absolute top-3 right-3 z-10 transition-all duration-200 ${images[0]?.selected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                          <div className="p-1.5 rounded-full bg-indigo-600 text-white shadow-md border-2 border-white">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        </div>

                        <img
                          src={normalizeImageUrlToStandardJpg(images[0]?.url)}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => handleImgError(e, images[0]?.url)}
                          className="w-full h-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                        />

                        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-white">
                          <span className="text-xs font-mono text-slate-200">点击切换勾选状态</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPreviewIdx(0); }}
                              className="p-2 rounded-xl bg-white/20 hover:bg-white/40 text-white transition-colors"
                              title="大图预览"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => copyUrl(images[0]?.url, 0, e)}
                              className="p-2 rounded-xl bg-white/20 hover:bg-white/40 text-white transition-colors"
                              title="复制链接"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => downloadSingle(images[0]?.url, 0, e)}
                              className="p-2 rounded-xl bg-white/20 hover:bg-white/40 text-white transition-colors"
                              title="下载原图"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 右侧：AI 实物特征指纹与快速补充区域 */}
                    <div className="space-y-4">
                      {/* Card 1: 视觉特征锚定 */}
                      <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-50/70 via-purple-50/30 to-white border border-indigo-100/90 shadow-xs space-y-3">
                        <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-xs">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          <span>多模态视觉特征指纹已就绪</span>
                        </div>

                        <div className="space-y-2 text-xs text-slate-600">
                          <div className="flex items-start gap-2 bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
                            <span className="text-indigo-600 font-bold flex-shrink-0">📦 商品名称:</span>
                            <span className="text-slate-900 font-bold line-clamp-2">{product?.title || '目标实物商品'}</span>
                          </div>

                          <div className="flex items-center gap-2 bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
                            <span className="text-indigo-600 font-bold flex-shrink-0">🔒 控形机制:</span>
                            <span className="text-slate-700">全套分镜 100% 垫图控形，严禁外观材质变异</span>
                          </div>

                          <div className="flex items-center gap-2 bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
                            <span className="text-indigo-600 font-bold flex-shrink-0">🚀 下一步:</span>
                            <span className="text-slate-700">点击左下角按钮即可直接启动分镜策划</span>
                          </div>
                        </div>
                      </div>

                      {/* Card 2: 补充更多实拍图 (可选拖拽上传区) */}
                      <div
                        onClick={() => supplementInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingSupplement(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingSupplement(false);
                        }}
                        onDrop={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingSupplement(false);
                          const files = e.dataTransfer.files;
                          if (files && files.length > 0) {
                            try {
                              const newImgs: any[] = [];
                              for (let i = 0; i < files.length; i++) {
                                const url = await compressImageToDataUrl(files[i], 1200, 0.85);
                                newImgs.push({ url, type: 'detail', selected: true });
                              }
                              const existing = useAppStore.getState().images;
                              useAppStore.setState({ images: [...existing, ...newImgs] });
                              showToast(`已成功补充 ${newImgs.length} 张实拍图`);
                            } catch (err) {
                              console.error('拖入上传失败:', err);
                            }
                          }
                        }}
                        className={`p-6 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 text-center cursor-pointer group ${
                          isDraggingSupplement
                            ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/20 scale-[1.01]'
                            : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/30'
                        }`}
                      >
                        <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform shadow-2xs">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800">
                            {isDraggingSupplement ? '松开鼠标即可添加' : '有更多实拍图/细节图？可直接拖入此处补充'}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            支持拖入多张商品背面、接口、特写照片补充到画廊中
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* 多张素材时的常规摄影网格 */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-24">
                  {filteredImages.map((img, idx) => (
                    <div
                      key={idx}
                      onClick={() => toggleImageSelection(images.indexOf(img))}
                      className={`relative group cursor-pointer rounded-2xl overflow-hidden aspect-square border-2 transition-all duration-200 bg-white [content-visibility:auto] [contain-intrinsic-size:200px] ${
                        img.selected
                          ? 'border-indigo-600 shadow-[0_4px_20px_rgba(99,102,241,0.25)] ring-2 ring-indigo-500/20 scale-[0.98]'
                          : 'border-slate-200/80 hover:border-indigo-300 hover:shadow-md'
                      }`}
                    >
                      {/* Category Badge */}
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-lg bg-white/90 backdrop-blur-md text-[10px] text-slate-700 uppercase font-bold tracking-wider pointer-events-none border border-slate-200 shadow-sm">
                        {img.type === 'main' ? '主图' : img.type === 'sku' ? 'SKU' : '详情'}
                      </div>

                      {/* Checkmark */}
                      <div className={`absolute top-2 right-2 z-10 transition-all duration-200 ${img.selected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                        <div className="p-1 rounded-full bg-indigo-600 text-white shadow-md border border-white">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>

                      {/* Image */}
                      <img
                        src={normalizeImageUrlToStandardJpg(img.url)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleImgError(e, img.url)}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* Quick Action Overlay (Preview / Download / Copy) */}
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-white">
                        <span className="text-[10px] font-mono text-slate-200">
                          #{images.indexOf(img) + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewIdx(images.indexOf(img)); }}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="大图预览"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => copyUrl(img.url, idx, e)}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="复制链接"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => downloadSingle(img.url, idx, e)}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="下载图片"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Lightbox Preview Modal */}
      {previewIdx !== null && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setPreviewIdx(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl p-2" onClick={e => e.stopPropagation()}>
            <img
              src={normalizeImageUrlToStandardJpg(workshopMode === 'social_face_product_swap' ? clonedSocialImages[previewIdx]?.url : images[previewIdx]?.url) || (workshopMode === 'social_face_product_swap' ? clonedSocialImages[previewIdx]?.url : images[previewIdx]?.url) || ''}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => handleImgError(e, workshopMode === 'social_face_product_swap' ? clonedSocialImages[previewIdx]?.url : images[previewIdx]?.url)}
              className="w-full h-full max-h-[82vh] object-contain rounded-2xl"
            />
            <div className="p-3 flex items-center justify-between bg-white text-slate-900 border-t border-slate-100">
              <span className="text-xs font-mono font-bold">
                {workshopMode === 'social_face_product_swap' 
                  ? `社媒参考分镜 #${previewIdx + 1}` 
                  : `素材 #${previewIdx + 1} (${images[previewIdx]?.type?.toUpperCase()})`}
              </span>
              <button
                type="button"
                onClick={() => setPreviewIdx(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

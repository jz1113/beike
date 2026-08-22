'use client';
import {apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { isImageFile } from '@/lib/mediaUpload';
import { compressImageFilesToDataUrls } from '@/lib/workshopFileDrop';
import { useAppStore } from '@/store/useAppStore';
import { MODEL_PERSONAS } from '@/lib/vision';
import { compressImageToDataUrl } from '@/lib/image-utils';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { formatUserError } from '@/lib/upstreamErrors';
import { 
  Search, 
  Loader2, 
  Database, 
  RefreshCcw, 
  Link2, 
  Upload, 
  ClipboardPaste, 
  X, 
  ShoppingBag, 
  ArrowRight, 
  CheckCircle2, 
  Edit2, 
  Check, 
  Tag, 
  Hash, 
  Dices,
  Sparkles,
  Users,
  Image as ImageIcon,
  Star,
  ChevronDown
} from 'lucide-react';
import { JdIcon, TaobaoIcon, AIExtractIcon, WorkflowNextIcon, StudioConsoleIcon } from '@/shared/ui/BrandIcons';
import CollapsibleSidePanel from '@/shared/ui/CollapsibleSidePanel';
import { ProductRecord } from '@/types';

interface Props {
  onOpenHistory: () => void;
  onNextStep: () => void;
  /** 顶栏已提供主 CTA 时隐藏底部下一步按钮 */
  hideFooterCta?: boolean;
}

export default function StudioSidebar({ onOpenHistory, onNextStep, hideFooterCta }: Props) {
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');
  const [platform, setPlatform] = useState<'jd' | 'taobao'>('jd');
  const [numIid, setNumIid] = useState('');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [recentProducts, setRecentProducts] = useState<ProductRecord[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 爆款换人换品工坊专属状态
  const [socialUrl, setSocialUrl] = useState('');
  const [isScrapingSocial, setIsScrapingSocial] = useState(false);
  const [socialInputMode, setSocialInputMode] = useState<'url' | 'upload'>('url');
  const [targetCollectMethod, setTargetCollectMethod] = useState<'url' | 'upload'>('url');
  const [targetPlatform, setTargetPlatform] = useState<'jd' | 'taobao'>('jd');
  const [targetNumIid, setTargetNumIid] = useState('');
  const [targetForceRefresh, setTargetForceRefresh] = useState(false);
  const [isFetchingTarget, setIsFetchingTarget] = useState(false);
  const [targetProductImage, setTargetProductImage] = useState<string>('');
  const [targetProductTitle, setTargetProductTitle] = useState<string>('');
  const targetProductInputRef = useRef<HTMLInputElement>(null);
  const socialFileInputRef = useRef<HTMLInputElement>(null);
  
  // 本地上传相关状态
  const [localFiles, setLocalFiles] = useState<{ name: string; url: string }[]>([]);
  const [localTitle, setLocalTitle] = useState('');
  const [localItemId, setLocalItemId] = useState('');
  const [isSavingLocal, setIsSavingLocal] = useState(false);

  // 编辑当前工作商品信息
  const [isEditingCurrent, setIsEditingCurrent] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editItemId, setEditItemId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);

  const { 
    setLoading, 
    setError, 
    setProductData, 
    isLoading, 
    product, 
    images, 
    apiUsed,
    workshopMode,
    clonedSocialImages,
    setClonedSocialImages,
    modelPersona,
    setModelPersona,
    anchorFaceImageUrl,
    setAnchorFaceImageUrl,
    isAnchorFaceConfirmed,
    setIsAnchorFaceConfirmed
  } = useAppStore();

  const fetchRecentProducts = async () => {
    try {
      const res = await apiFetch('/api/catalog/products');
      const data = await res.json();
      if (data.success && data.products) {
        setRecentProducts(data.products.slice(0, 5));
      }
    } catch (e) {
      console.error('加载最近商品失败:', e);
    }
  };

  useEffect(() => {
    fetchRecentProducts();
  }, []);

  useEffect(() => {
    if (product) {
      setEditTitle(product.title || '');
      setEditItemId(product.itemId || '');
    }
  }, [product]);

  const selectedCount = images.filter(img => img.selected).length;

  const handleFetch = async (overrideId?: string, overridePlatform?: 'jd' | 'taobao') => {
    const targetId = (overrideId || numIid).trim();
    const targetPlatform = overridePlatform || platform;

    if (!targetId) {
      setError('请输入商品ID或商品详情链接');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let extractedId = targetId;
      const numMatch = targetId.match(/(?:item\.jd\.com\/|id=|itemId=|item_id=|\/)(\d+)/i) || targetId.match(/\d+/);
      if (numMatch) {
        extractedId = numMatch[1] || numMatch[0];
      }

      const res = await apiFetch('/api/catalog/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetId,
          num_iid: extractedId,
          platform: targetPlatform,
          force_refresh: forceRefresh,
          forceRefresh,
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '采集失败，请检查链接或网络');
      }

      setProductData(
        data.product,
        data.images,
        data.apiUsed ? `万邦官方专线 (${data.apiUsed})` : '本地已存缓存'
      );
      fetchRecentProducts();
    } catch (err: any) {
      setError(formatUserError(err, '网络连接超时，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRecent = (rp: ProductRecord) => {
    let imagesObj = { main: [] as string[], details: [] as string[], skus: [] as string[] };
    if (typeof rp.detailUrls === 'string') {
      try {
        const parsed = JSON.parse(rp.detailUrls);
        if (Array.isArray(parsed)) {
          imagesObj.main = parsed;
        } else if (parsed && typeof parsed === 'object') {
          imagesObj.main = Array.isArray(parsed.main) ? parsed.main : [];
          imagesObj.skus = Array.isArray(parsed.skus) ? parsed.skus : [];
          imagesObj.details = Array.isArray(parsed.details) ? parsed.details : [];
        }
      } catch {}
    } else if (rp.detailUrls && typeof rp.detailUrls === 'object') {
      imagesObj = rp.detailUrls as any;
    }

    if (imagesObj.main.length === 0 && rp.picUrl) {
      imagesObj.main = [rp.picUrl];
    }

    setProductData(
      rp,
      imagesObj,
      `${rp.platform.toUpperCase()} 库内秒级调用`
    );
    setTargetProductTitle(rp.title || '');
    setTargetProductImage(rp.picUrl || (imagesObj.main?.[0] || ''));
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setNumIid(text.trim());
        if (text.includes('jd.com')) setPlatform('jd');
        if (text.includes('taobao.com') || text.includes('tmall.com')) setPlatform('taobao');
      }
    } catch (err) {
      console.warn('剪贴板读取被拒绝:', err);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: { name: string; url: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const url = await compressImageToDataUrl(file, 1600, 0.85);
        if (url?.startsWith('data:image/')) newFiles.push({ name: file.name, url });
      } catch {
        /* 不回退 blob:，避免提交后服务端读不到 */
      }
    }
    if (newFiles.length === 0) return;
    setLocalFiles(prev => [...prev, ...newFiles]);
    if (!localTitle && newFiles.length > 0) {
      const baseName = newFiles[0].name.replace(/\.[^/.]+$/, "");
      setLocalTitle(baseName);
      setLocalItemId('LOCAL_' + Date.now().toString().slice(-6));
    }
    e.target.value = '';
  };

  const acceptLocalImage = useCallback(
    (file: File) => isImageFile(file),
    [],
  );

  const ingestLocalFiles = useCallback(
    async (files: File[]) => {
      setActiveTab('upload');
      const newFiles: { name: string; url: string }[] = [];
      for (const file of files) {
        if (!acceptLocalImage(file)) continue;
        try {
          const url = await compressImageToDataUrl(file, 1600, 0.85);
          if (url?.startsWith('data:image/')) newFiles.push({ name: file.name, url });
        } catch {
          /* skip */
        }
      }
      if (newFiles.length > 0) {
        setLocalFiles((prev) => [...prev, ...newFiles]);
        if (!localTitle && newFiles.length > 0) {
          const baseName = newFiles[0].name.replace(/\.[^/.]+$/, '');
          setLocalTitle(baseName);
          setLocalItemId('LOCAL_' + Date.now().toString().slice(-6));
        }
      }
    },
    [acceptLocalImage, localTitle],
  );

  const { dropZoneProps: localDropZoneProps } = useFileDropZone({
    onFiles: (files) => {
      setActiveTab('upload');
      void ingestLocalFiles(files);
    },
    accept: acceptLocalImage,
  });

  const handleRemoveLocalFile = (idx: number) => {
    setLocalFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleGenerateRandomSku = () => {
    const prefix = 'SKU_';
    const rand = Math.floor(100000 + Math.random() * 900000);
    setLocalItemId(prefix + rand);
  };

  const handleSaveLocalProduct = async () => {
    if (localFiles.length === 0) {
      alert('请至少上传一张商品图片');
      return;
    }
    const finalTitle = localTitle.trim() || `本地导入素材_${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const finalItemId = localItemId.trim() || `LOCAL_${Date.now()}`;

    setIsSavingLocal(true);
    try {
      const imageUrls = localFiles.map(f => f.url);
      const detailUrlsObj = {
        main: imageUrls,
        details: [],
        skus: []
      };

      // 🌟 用户明确要求：本地上传的图片属于临时会话素材，不要记录/写入商品库中
      const localProduct = {
        id: 'local_temp_' + Date.now(),
        platform: 'local',
        itemId: finalItemId,
        title: finalTitle,
        picUrl: imageUrls[0] || '',
        createdAt: new Date().toISOString()
      };

      // 直接载入当前会话工作区，不调用 POST /api/catalog/products，不入库
      setProductData(localProduct, detailUrlsObj, '📁 本地文件导入 (未入库)');
      setLocalFiles([]);
      setLocalTitle('');
      setLocalItemId('');
    } catch (err: unknown) {
      setError(formatUserError(err, '载入本地商品素材失败'));
    } finally {
      setIsSavingLocal(false);
    }
  };

  const handleSaveCurrentEdit = async () => {
    if (!product) return;

    // 若当前为本地未入库素材，直接更新本地状态
    if (product.platform === 'local' || (typeof product.id === 'string' && product.id.startsWith('local_temp_'))) {
      useAppStore.setState({
        product: {
          ...product,
          title: editTitle,
          itemId: editItemId
        }
      });
      setIsEditingCurrent(false);
      return;
    }

    try {
      const res = await apiFetch(`/api/catalog/products?id=${product.id || product.itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          itemId: editItemId
        })
      });
      const data = await res.json();
      if (data.success && data.product) {
        useAppStore.setState({
          product: {
            ...product,
            title: editTitle,
            itemId: editItemId
          }
        });
        setIsEditingCurrent(false);
        fetchRecentProducts();
      }
    } catch (e: unknown) {
      setError(formatUserError(e, '更新商品信息失败'));
    }
  };

  const handleFetchSocial = async () => {
    if (!socialUrl.trim()) {
      setError('请输入小红书或抖音笔记链接');
      return;
    }
    setIsScrapingSocial(true);
    setError(null);
    try {
      const res = await apiFetch('/api/catalog/styles/parse-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: socialUrl.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '采集外站图集失败，请检查链接有效性');
      }
      if (data.images && data.images.length > 0) {
        setClonedSocialImages(data.images);
      } else if (data.cover) {
        setClonedSocialImages([data.cover]);
      } else {
        throw new Error('未在该笔记中提取到有效高清图片');
      }
    } catch (err: any) {
      setError(formatUserError(err, '采集外站图集失败'));
    } finally {
      setIsScrapingSocial(false);
    }
  };

  const processTargetProductFile = (file: File) => {
    if (!isImageFile(file)) return;
    setTargetCollectMethod('upload');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setTargetProductImage(dataUrl);
      const title = targetProductTitle || file.name.replace(/\.[^/.]+$/, "");
      const dummyProd = {
        id: 'target_' + Date.now(),
        title: title,
        itemId: 'TARGET_' + Date.now(),
        picUrl: dataUrl,
        platform: 'custom'
      };
      setProductData(dummyProd, { main: [dataUrl], details: [], skus: [] }, '目标商品实物绑定');
    };
    reader.readAsDataURL(file);
  };

  const handleTargetProductUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processTargetProductFile(file);
  };

  const { dropZoneProps: targetDropZoneProps } = useFileDropZone({
    onFiles: (files) => {
      setTargetCollectMethod('upload');
      if (files[0]) processTargetProductFile(files[0]);
    },
    accept: acceptLocalImage,
    onDropWithoutFiles: (e) => {
      const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/'))) {
        setTargetCollectMethod('upload');
        setTargetProductImage(text);
        const dummyProd = {
          id: 'target_' + Date.now(),
          title: targetProductTitle || '拖入的目标商品',
          itemId: 'TARGET_' + Date.now(),
          picUrl: text,
          platform: 'custom',
        };
        setProductData(dummyProd, { main: [text], details: [], skus: [] }, '目标商品实物绑定');
      }
    },
  });

  const ingestSocialRefFiles = useCallback(
    async (files: File[]) => {
      setSocialInputMode('upload');
      const urls = await compressImageFilesToDataUrls(files);
      if (urls.length > 0) setClonedSocialImages(urls);
    },
    [setClonedSocialImages],
  );

  const { dropZoneProps: socialRefDropProps } = useFileDropZone({
    onFiles: (files) => {
      void ingestSocialRefFiles(files);
    },
    accept: acceptLocalImage,
  });

  const handleFetchTargetProduct = async () => {
    const targetId = targetNumIid.trim();
    if (!targetId) {
      setError('请输入商品ID或商品详情链接');
      return;
    }

    setIsFetchingTarget(true);
    setError(null);

    try {
      let extractedId = targetId;
      const numMatch = targetId.match(/(?:item\.jd\.com\/|id=|itemId=|item_id=|\/)(\d+)/i) || targetId.match(/\d+/);
      if (numMatch) {
        extractedId = numMatch[1] || numMatch[0];
      }

      const res = await apiFetch('/api/catalog/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetId,
          num_iid: extractedId,
          platform: targetPlatform,
          force_refresh: targetForceRefresh,
          forceRefresh: targetForceRefresh,
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '采集失败，请检查链接或网络');
      }

      setProductData(
        data.product,
        data.images,
        data.apiUsed ? `万邦官方专线 (${data.apiUsed})` : '本地已存缓存'
      );
      if (data.product) {
        setTargetProductTitle(data.product.title || '');
        setTargetProductImage(data.product.picUrl || (data.images?.main?.[0] || ''));
      }
      fetchRecentProducts();
    } catch (err: any) {
      setError(formatUserError(err, '网络连接超时，请重试'));
    } finally {
      setIsFetchingTarget(false);
    }
  };

  return (
    <CollapsibleSidePanel
      storageKey="studio-sidebar"
      title="素材准备"
      widthClass="w-[380px] md:w-[420px] lg:w-[460px] xl:w-[480px] 2xl:w-[520px]"
    >
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
            <StudioConsoleIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">素材准备</div>
            <div className="text-[10px] text-slate-500">参考图 · 商品 · 人脸</div>
          </div>
        </div>

        <button
          onClick={onOpenHistory}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer flex items-center gap-1 hover:underline"
          title="打开已存商品库"
        >
          <span>商品库</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {workshopMode === 'social_face_product_swap' ? (
          /* 爆款复刻：三槽位 + 高级折叠 */
          <div className="space-y-3">
            {/* 1. 参考图 */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-bold">1</span>
                  参考图
                </span>
                <span className="text-[10px] text-slate-500">小红书 / 抖音 / 本地</span>
              </div>

              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSocialInputMode('url')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    socialInputMode === 'url'
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>链接采集</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSocialInputMode('upload')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    socialInputMode === 'upload'
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>本地上传</span>
                </button>
              </div>

              {socialInputMode === 'url' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={socialUrl}
                      onChange={e => setSocialUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleFetchSocial()}
                      placeholder="粘贴小红书/抖音笔记链接..."
                      className="w-full pl-3 pr-14 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const t = await navigator.clipboard.readText();
                          if (t) setSocialUrl(t.trim());
                        } catch {}
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] font-bold cursor-pointer"
                    >
                      粘贴
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleFetchSocial}
                    disabled={isScrapingSocial}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {isScrapingSocial ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{isScrapingSocial ? '正在采集...' : '采集参考图'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    ref={socialFileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      const urls: string[] = [];
                      for (let i = 0; i < files.length; i++) {
                        try {
                          const dataUrl = await compressImageToDataUrl(files[i], 1600, 0.85);
                          urls.push(dataUrl);
                        } catch {
                          console.warn('[StudioSidebar] 参考图压缩失败，已跳过该文件');
                        }
                      }
                      if (urls.length > 0) setClonedSocialImages(urls);
                      e.target.value = '';
                    }}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    {...socialRefDropProps}
                    onClick={() => socialFileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') socialFileInputRef.current?.click();
                    }}
                    className="w-full py-6 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/40 text-xs font-bold text-slate-700 flex flex-col items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <span>点击或拖入参考图（可多选）</span>
                  </div>
                </div>
              )}

              {clonedSocialImages.length > 0 && (
                <div className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>已载入 {clonedSocialImages.length} 张，右侧勾选要用的分镜</span>
                </div>
              )}
            </div>

            {/* 2. 商品图 */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-bold">2</span>
                  商品图
                </span>
              </div>

              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setTargetCollectMethod('url')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    targetCollectMethod === 'url'
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>电商链接</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetCollectMethod('upload')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    targetCollectMethod === 'upload'
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>本地上传</span>
                </button>
              </div>

              {targetCollectMethod === 'url' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={targetNumIid}
                      onChange={e => {
                        setTargetNumIid(e.target.value);
                        if (e.target.value.includes('jd.com')) setTargetPlatform('jd');
                        if (e.target.value.includes('taobao.com') || e.target.value.includes('tmall.com')) setTargetPlatform('taobao');
                      }}
                      onKeyDown={e => e.key === 'Enter' && handleFetchTargetProduct()}
                      placeholder="商品链接或 ID..."
                      className="w-full pl-3 pr-14 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const t = await navigator.clipboard.readText();
                          if (t) {
                            setTargetNumIid(t.trim());
                            if (t.includes('jd.com')) setTargetPlatform('jd');
                            if (t.includes('taobao.com') || t.includes('tmall.com')) setTargetPlatform('taobao');
                          }
                        } catch {}
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] font-bold cursor-pointer"
                    >
                      粘贴
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleFetchTargetProduct}
                    disabled={isFetchingTarget}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {isFetchingTarget ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                    <span>{isFetchingTarget ? '采集中...' : '采集并绑定商品'}</span>
                  </button>
                </div>
              ) : (
                <div
                  {...targetDropZoneProps}
                  className="p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 transition-all space-y-2"
                >
                  <input
                    ref={targetProductInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleTargetProductUpload}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => targetProductInputRef.current?.click()}
                      className="w-14 h-14 rounded-xl border border-dashed border-slate-300 hover:border-indigo-500 bg-white flex flex-col items-center justify-center cursor-pointer flex-shrink-0 overflow-hidden"
                    >
                      {targetProductImage || product?.picUrl ? (
                        <img
                          src={normalizeImageUrlToStandardJpg(targetProductImage || product?.picUrl)}
                          alt="目标商品"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const src = targetProductImage || product?.picUrl;
                            if (!target.dataset.hasRetried && src) {
                              target.dataset.hasRetried = 'true';
                              target.src = proxyMediaUrl(src);
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Upload className="w-4 h-4 text-indigo-500" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        value={targetProductTitle || product?.title || ''}
                        onChange={e => {
                          setTargetProductTitle(e.target.value);
                          if (product) {
                            useAppStore.setState({ product: { ...product, title: e.target.value } });
                          }
                        }}
                        placeholder="商品名称（选填）"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 outline-none focus:border-indigo-500"
                      />
                      <div className="text-[10px] text-slate-400">支持拖拽图片到此处</div>
                    </div>
                  </div>
                </div>
              )}

              {(product?.picUrl || targetProductImage) && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={normalizeImageUrlToStandardJpg(targetProductImage || product?.picUrl)}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        const src = targetProductImage || product?.picUrl;
                        if (!target.dataset.hasRetried && src) {
                          target.dataset.hasRetried = 'true';
                          target.src = proxyMediaUrl(src);
                        }
                      }}
                      className="w-9 h-9 rounded-lg object-cover border border-emerald-200 bg-white flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-emerald-950 truncate">
                        {product?.title || targetProductTitle || '商品已绑定'}
                      </div>
                      <div className="text-[9px] text-emerald-700 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>已设为外观参考</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetProductImage('');
                      setTargetProductTitle('');
                      setTargetNumIid('');
                      useAppStore.setState({ product: null, images: [] });
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-[10px] font-bold hover:bg-emerald-100 flex-shrink-0 cursor-pointer"
                  >
                    更换
                  </button>
                </div>
              )}
            </div>

            {/* 3. 人脸 / 纯商品 */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-bold">3</span>
                  人脸（可选）
                </span>
                <span className="text-[10px] text-slate-500">
                  {(!modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物'))
                    ? '纯商品'
                    : '换脸'}
                </span>
              </div>

              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    const isNo = !modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');
                    if (isNo) {
                      setModelPersona('亚洲清纯甜美女生 (自然裸妆 · 微表情灵动)');
                    }
                  }}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                    (!modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物'))
                      ? 'text-slate-600 hover:text-slate-800'
                      : 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                  }`}
                >
                  真人换脸
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModelPersona('纯商品实物 (无需模特/无人脸)');
                    setAnchorFaceImageUrl(undefined);
                    setIsAnchorFaceConfirmed(false);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                    (!modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物'))
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  纯商品
                </button>
              </div>

              {(!modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物')) ? (
                <p className="text-[11px] text-slate-500 leading-relaxed px-0.5">
                  将复刻参考图构图与光影，画面不添加人物。
                </p>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <input
                    ref={faceInputRef}
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const compressedUrl = await compressImageToDataUrl(file, 1024, 0.85);
                        setAnchorFaceImageUrl(compressedUrl);
                        setIsAnchorFaceConfirmed(true);
                      } catch (err) {
                        console.error('压缩人脸图片失败:', err);
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2.5">
                    <div
                      onClick={() => faceInputRef.current?.click()}
                      className="w-12 h-12 rounded-xl border border-dashed border-slate-300 hover:border-indigo-500 bg-white flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                      title="上传正脸照"
                    >
                      {anchorFaceImageUrl ? (
                        <img src={anchorFaceImageUrl} alt="正脸" className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-4 h-4 text-indigo-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-700">
                        {anchorFaceImageUrl ? '已上传正脸照' : '上传正脸照（推荐）'}
                      </div>
                      <div className="text-[10px] text-slate-400">全套分镜按此脸定身份</div>
                    </div>
                    {anchorFaceImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setAnchorFaceImageUrl(undefined);
                          setIsAnchorFaceConfirmed(false);
                        }}
                        className="text-[10px] text-slate-400 hover:text-red-600 cursor-pointer font-bold px-1.5"
                      >
                        清除
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 高级 */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <span>高级选项</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
              {showAdvanced && (
                <div className="px-3.5 pb-3.5 space-y-3 border-t border-slate-100 pt-3">
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-700">电商平台</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetPlatform('jd')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                          targetPlatform === 'jd'
                            ? 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <JdIcon className="w-3.5 h-3.5" />
                        <span>京东</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetPlatform('taobao')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                          targetPlatform === 'taobao'
                            ? 'bg-orange-50 border-orange-300 text-orange-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <TaobaoIcon className="w-3.5 h-3.5" />
                        <span>淘宝/天猫</span>
                      </button>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={targetForceRefresh}
                        onChange={e => setTargetForceRefresh(e.target.checked)}
                        className="rounded text-indigo-600 w-3.5 h-3.5"
                      />
                      <span>强制重新采集（不读缓存）</span>
                    </label>
                  </div>

                  {images.length > 1 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-700">切换主图（{images.length}）</span>
                        <button
                          type="button"
                          onClick={() => useAppStore.getState().setSocialGalleryTab('product')}
                          className="text-indigo-600 font-bold cursor-pointer hover:underline"
                        >
                          打开图库
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {images.map((img, idx) => {
                          const isCurrent = img.url === (targetProductImage || product?.picUrl || images[0]?.url);
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setTargetProductImage(img.url);
                                useAppStore.getState().setTargetProductImage(img.url);
                              }}
                              className={`relative flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden border-2 cursor-pointer ${
                                isCurrent ? 'border-indigo-500' : 'border-slate-200 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={normalizeImageUrlToStandardJpg(img.url)}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              {isCurrent && (
                                <div className="absolute inset-0 bg-indigo-900/20 flex items-center justify-center">
                                  <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {product && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700">商品信息</span>
                        <button
                          onClick={() => setIsEditingCurrent(!isEditingCurrent)}
                          className="text-[10px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>{isEditingCurrent ? '取消' : '编辑'}</span>
                        </button>
                      </div>
                      {isEditingCurrent ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            placeholder="商品名称"
                            className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 text-xs outline-none"
                          />
                          <input
                            type="text"
                            value={editItemId}
                            onChange={e => setEditItemId(e.target.value)}
                            placeholder="SKU / ID"
                            className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 text-xs font-mono outline-none"
                          />
                          <button
                            onClick={handleSaveCurrentEdit}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold"
                          >
                            保存
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-700 truncate">{product.title}</div>
                      )}
                    </div>
                  )}

                  {!((!modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物')) || anchorFaceImageUrl) && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-700">虚拟人设（无正脸时）</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {MODEL_PERSONAS.filter(p => p.id !== 'pure_product_no_human').map(p => {
                          const isSelected = modelPersona.includes(p.name.slice(0, 4)) || modelPersona === p.facePromptSnippet;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setModelPersona(`${p.name} (${p.desc})`)}
                              className={`p-2 rounded-xl border text-left cursor-pointer text-xs ${
                                isSelected
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold'
                                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="truncate block">{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {recentProducts.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-700">最近商品</div>
                      {recentProducts.slice(0, 3).map((rp) => (
                        <button
                          key={rp.id}
                          type="button"
                          onClick={() => {
                            /* load via existing recent product click if available below - simplified: fetch by id */
                            setTargetNumIid(rp.itemId);
                            setTargetPlatform((rp.platform === 'taobao' || rp.platform === 'tmall' ? 'taobao' : 'jd') as 'jd' | 'taobao');
                            setTargetCollectMethod('url');
                          }}
                          className="w-full flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 text-left cursor-pointer"
                        >
                          {rp.picUrl ? (
                            <img src={rp.picUrl} alt="" className="w-7 h-7 rounded-lg object-cover border border-slate-200" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                              <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-slate-700 truncate">{rp.title}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 原生电商采编模式 */
          <>
            {/* Tab Switcher */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-100 border border-slate-200/80">
              <button
                onClick={() => setActiveTab('url')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                  activeTab === 'url'
                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>电商链接 / ID</span>
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                  activeTab === 'upload'
                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>本地多图导入</span>
              </button>
            </div>

            {activeTab === 'url' ? (
              /* URL Extraction Form */
              <div className="space-y-4">
                {/* Platform Selector Buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setPlatform('jd')}
                    className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                      platform === 'jd'
                        ? 'bg-red-50 border border-red-200 text-red-700 shadow-sm ring-1 ring-red-500/20'
                        : 'bg-slate-50 border border-slate-200/80 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <JdIcon className="w-4 h-4 flex-shrink-0" />
                    <span>京东商城</span>
                  </button>

                  <button
                    onClick={() => setPlatform('taobao')}
                    className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                      platform === 'taobao'
                        ? 'bg-orange-50 border border-orange-200 text-orange-700 shadow-sm ring-1 ring-orange-500/20'
                        : 'bg-slate-50 border border-slate-200/80 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <TaobaoIcon className="w-4 h-4 flex-shrink-0" />
                    <span>淘宝 / 天猫</span>
                  </button>
                </div>

                {/* Input with Paste */}
                <div className="relative">
                  <input
                    type="text"
                    value={numIid}
                    onChange={e => setNumIid(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleFetch()}
                    placeholder={platform === 'jd' ? '输入京东商品ID或链接...' : '输入淘宝商品ID或链接...'}
                    className="w-full pl-3.5 pr-18 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs transition-all"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {numIid ? (
                      <button
                        onClick={() => setNumIid('')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={handlePaste}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                      >
                        <ClipboardPaste className="w-3 h-3" />
                        <span>粘贴</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Options */}
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                    优先读库 (0消耗秒载)
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={forceRefresh}
                      onChange={e => setForceRefresh(e.target.checked)}
                      className="rounded accent-indigo-600 cursor-pointer w-3.5 h-3.5"
                    />
                    <span>强制爬取</span>
                  </label>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleFetch()}
                  disabled={isLoading}
                  className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AIExtractIcon className="w-4 h-4" />}
                  <span>{isLoading ? '正在提取素材...' : '开始提取商品素材'}</span>
                </button>
              </div>
            ) : (
              /* Local Upload Form */
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  {...localDropZoneProps}
                  className="w-full py-6 px-3 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer text-center group"
                >
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-bold text-slate-800">
                    {localFiles.length > 0
                      ? `已选择 ${localFiles.length} 张本地图片 (可继续拖入)`
                      : '点击或拖拽本地商品图片至此处'}
                  </div>
                  <div className="text-[10px] text-slate-500">支持拖入多张 JPG / PNG / WEBP</div>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={localTitle}
                    onChange={e => setLocalTitle(e.target.value)}
                    placeholder="素材组名称 (选填)..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={handleSaveLocalProduct}
                  disabled={isSavingLocal || localFiles.length === 0}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isSavingLocal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>直接载入工作区 (不入库)</span>
                </button>

                <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1 font-medium pt-0.5">
                  <span className="text-emerald-500">✓</span>
                  <span>本地文件仅供当前创作使用，不写入商品库</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Current Working Product Info Card — 原创模式；爆款模式已收进高级 */}
        {workshopMode !== 'social_face_product_swap' && product && (
          <div className="p-3.5 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                当前工作商品
              </span>
              <button
                onClick={() => setIsEditingCurrent(!isEditingCurrent)}
                className="text-[10px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer font-medium"
              >
                <Edit2 className="w-3 h-3" />
                <span>{isEditingCurrent ? '取消' : '修改信息'}</span>
              </button>
            </div>

            <div className="flex items-start gap-3">
              {normalizeImageUrlToStandardJpg(product.picUrl) ? (
                <img
                  src={normalizeImageUrlToStandardJpg(product.picUrl)}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.hasRetried && product.picUrl) {
                      target.dataset.hasRetried = 'true';
                      target.src = proxyMediaUrl(product.picUrl);
                    }
                  }}
                  className="w-12 h-12 rounded-xl object-cover bg-white border border-slate-200 flex-shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0 shadow-sm">
                  <ShoppingBag className="w-6 h-6 text-indigo-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {isEditingCurrent ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      placeholder="商品名称"
                      className="w-full px-2 py-1 rounded-lg bg-white border border-indigo-300 text-slate-900 text-xs outline-none"
                    />
                    <input
                      type="text"
                      value={editItemId}
                      onChange={e => setEditItemId(e.target.value)}
                      placeholder="商品SKU/ID"
                      className="w-full px-2 py-1 rounded-lg bg-white border border-indigo-300 text-slate-900 text-xs font-mono outline-none"
                    />
                    <button
                      onClick={handleSaveCurrentEdit}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold shadow-sm"
                    >
                      保存更新
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                      {product.title}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 mt-1 uppercase flex items-center gap-2">
                      <span className="px-1.5 py-0.2 rounded bg-white border border-slate-200 font-bold text-slate-700">
                        {product.platform}
                      </span>
                      <span>ID: {product.itemId}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-indigo-100/60 font-medium">
              <span>已勾选素材: <strong className="text-indigo-700">{selectedCount}</strong> / {images.length} 张</span>
              <span className="text-[10px] text-slate-400 font-mono">{apiUsed || '本地缓存'}</span>
            </div>
          </div>
        )}

        {/* Recent Products Fast Load — 原创模式 */}
        {workshopMode !== 'social_face_product_swap' && recentProducts.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-200/80">
            <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
              <span>最近采编商品 (点击快速载入)</span>
            </div>

            <div className="space-y-1.5">
              {recentProducts.map(rp => {
                const cleanPic = normalizeImageUrlToStandardJpg(rp.picUrl);
                return (
                  <button
                    key={rp.id}
                    onClick={() => handleSelectRecent(rp)}
                    className="w-full p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 hover:border-indigo-300 text-left transition-all flex items-center gap-2.5 cursor-pointer group shadow-sm"
                  >
                    {cleanPic ? (
                      <img
                        src={cleanPic}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.dataset.hasRetried && rp.picUrl) {
                            target.dataset.hasRetried = 'true';
                            target.src = proxyMediaUrl(rp.picUrl);
                          }
                        }}
                        className="w-7 h-7 rounded-lg object-cover bg-white border border-slate-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-slate-200/80 flex items-center justify-center text-slate-400 flex-shrink-0">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-slate-700 group-hover:text-indigo-700 font-medium truncate">
                        {rp.title}
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 uppercase">
                        {rp.platform} · {rp.itemId}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {workshopMode === 'social_face_product_swap' && (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-[11px] font-bold text-slate-700">进入「提示词」步骤需完成：</div>
            <ul className="space-y-1.5 text-[11px]">
              <li className={`flex items-center gap-2 ${clonedSocialImages.filter(i => i.selected).length > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>至少勾选 1 张参考分镜</span>
              </li>
              <li className={`flex items-center gap-2 ${product ? 'text-emerald-700' : 'text-amber-700'}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>载入目标商品（槽位 2）</span>
              </li>
              <li className={`flex items-center gap-2 ${selectedCount > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>在「商品图库」勾选至少 1 张商品图</span>
              </li>
            </ul>
          </div>
        )}
      </div>

      {!hideFooterCta && (
      <div className="p-4 border-t border-slate-200/80 bg-slate-50/80">
        {workshopMode === 'social_face_product_swap' ? (
          <button
            onClick={() => {
              const count = clonedSocialImages.filter(i => i.selected).length;
              if (count > 0) {
                useAppStore.setState({ shotCount: count });
              }
              onNextStep();
            }}
            disabled={
              clonedSocialImages.filter(i => i.selected).length === 0
              || !product
              || selectedCount === 0
            }
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
          >
            <WorkflowNextIcon className="w-3.5 h-3.5" />
            <span>下一步：提示词 ({clonedSocialImages.filter(i => i.selected).length})</span>
          </button>
        ) : (
          <button
            onClick={onNextStep}
            disabled={!product || selectedCount === 0}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
          >
            <WorkflowNextIcon className="w-3.5 h-3.5" />
            <span>下一步：提示词 ({selectedCount})</span>
          </button>
        )}
      </div>
      )}
    </CollapsibleSidePanel>
  );
}

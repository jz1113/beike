import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { getCachedProducts, setCachedProducts } from '@/lib/catalogCache';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { confirmAction } from '@/lib/confirmAction';
import { useAppStore } from '@/store/useAppStore';
import AssetProductLibrary from '@/features/assets/AssetProductLibrary';
import { useSafeTimeout } from '@/lib/useSafeTimeout';

interface Props {
  onEnterStudio: () => void;
}

let globalProductsCache: any[] | null = getCachedProducts() as any[] | null;

export default function WorkshopProductView({ onEnterStudio }: Props) {
  const setProductData = useAppStore((s) => s.setProductData);
  const setStep = useAppStore((s) => s.setStep);

  const [products, setProducts] = useState<any[]>(() => globalProductsCache || []);
  const [isLoading, setIsLoading] = useState(() => !globalProductsCache);
  const { setSafeTimeout } = useSafeTimeout();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 2500);
  };

  const fetchProducts = useCallback(async (force = false) => {
    if (!globalProductsCache || force) {
      setIsLoading(true);
    }
    try {
      const res = await apiFetch('/api/catalog/products').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success) {
          globalProductsCache = data.products || [];
          setCachedProducts(globalProductsCache || []);
          setProducts(globalProductsCache || []);
        }
      }
    } catch (err) {
      console.warn('加载商品物料轻微异常:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const handleDeleteProduct = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmAction('确定删除该商品资产吗？'))) return;
    try {
      await apiFetch(`/api/catalog/products?id=${id}`, { method: 'DELETE' });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showToast('🗑️ 商品已从主体库删除');
    } catch (err) {
      showToast(`❌ 删除商品失败: ${formatUserError(err, '请稍后重试')}`);
    }
  };

  const handleLoadProduct = (prod: any) => {
    let details: string[] = [];
    try {
      if (typeof prod.detailUrls === 'string') {
        const parsed = JSON.parse(prod.detailUrls);
        if (Array.isArray(parsed)) {
          details = parsed;
        } else if (parsed && typeof parsed === 'object') {
          details = Array.isArray(parsed.details) ? parsed.details : [];
        } else if (typeof parsed === 'string') {
          details = [parsed];
        }
      } else if (Array.isArray(prod.detailUrls)) {
        details = prod.detailUrls;
      }
    } catch {
      details = typeof prod.detailUrls === 'string' && prod.detailUrls ? [prod.detailUrls] : [];
    }

    setProductData(
      {
        title: prod.title || '已存商品',
        itemId: prod.itemId || '',
        price: prod.price || '---',
        platform: prod.platform || 'jd',
      },
      {
        main: prod.picUrl ? [prod.picUrl] : [],
        details: Array.isArray(details) ? details : [],
        skus: [],
      },
      'database_cache',
    );

    setStep(2);
    showToast(`📦 已将【${prod.title || '商品'}】载入批量制作工作台！`);
    onEnterStudio();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FAFAFC] overflow-y-auto">
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-2xl shadow-xl backdrop-blur-md animate-in fade-in duration-200">
          {toastMsg}
        </div>
      )}

      {/* 头部辅助栏 */}
      <div className="px-6 lg:px-8 py-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onEnterStudio}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回制作台</span>
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-xs text-slate-500 font-medium">
            留存历史抓取与导入的商品主体素材，无需重复采集即可随时载入工坊批量制作
          </span>
        </div>

        {isLoading && (
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>加载中...</span>
          </div>
        )}
      </div>

      {/* 商品网格列表 */}
      <div className="flex-1 px-6 lg:px-8 py-6">
        <AssetProductLibrary
          products={products}
          onEnterWorkshop={onEnterStudio}
          onDeleteProduct={handleDeleteProduct}
          onLoadProduct={handleLoadProduct}
        />
      </div>
    </div>
  );
}

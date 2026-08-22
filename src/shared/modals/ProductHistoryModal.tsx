'use client';
import {apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Database, 
  Trash2, 
  ArrowUpRight, 
  RefreshCw, 
  Search,
  Check,
  Sparkles,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { useAppStore, ProductData } from '@/store/useAppStore';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { JdIcon, TaobaoIcon } from '@/shared/ui/BrandIcons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ProductRecord {
  id: string;
  itemId: string;
  title: string;
  platform: string;
  price?: string;
  picUrl?: string;
  imageCount: number;
  mainUrls?: string;
  skuUrls?: string;
  detailUrls?: string;
  createdAt: string;
}

export default function ProductHistoryModal({ isOpen, onClose }: Props) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const { setProductData } = useAppStore();

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/catalog/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
    }
  }, [isOpen]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const q = searchTerm.toLowerCase();
    return products.filter(p => 
      p.title?.toLowerCase().includes(q) || 
      p.itemId?.toLowerCase().includes(q) ||
      p.platform?.toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  const handleSelectProduct = (p: ProductRecord) => {
    try {
      let main: string[] = [];
      let skus: string[] = [];
      let details: string[] = [];

      if (p.detailUrls) {
        try {
          const parsed = JSON.parse(p.detailUrls);
          if (Array.isArray(parsed)) {
            main = parsed;
          } else if (parsed && typeof parsed === 'object') {
            main = Array.isArray(parsed.main) ? parsed.main : [];
            skus = Array.isArray(parsed.skus) ? parsed.skus : [];
            details = Array.isArray(parsed.details) ? parsed.details : [];
          }
        } catch (e) {
          console.warn('detailUrls json parse error:', e);
        }
      }

      if (main.length === 0 && p.picUrl) {
        main = [p.picUrl];
      }

      const productObj: ProductData = {
        id: p.id,
        itemId: p.itemId,
        title: p.title,
        platform: p.platform,
        price: p.price,
        picUrl: p.picUrl || main[0] || '',
        createdAt: p.createdAt
      };

      setProductData(productObj, { main, skus, details }, '💾 本地数据库调入 (0消耗)');
      onClose();
    } catch (err: any) {
      console.error('[ProductHistoryModal] 调入异常:', err);
      showToast('调入数据解析异常: ' + (err?.message || ''));
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => {
        setConfirmDeleteId(prev => (prev === id ? null : prev));
      }, 3500);
      return;
    }
    setConfirmDeleteId(null);
    try {
      const res = await apiFetch(`/api/catalog/products?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProducts(prev => prev.filter(item => item.id !== id));
        showToast('商品缓存记录已删除');
      }
    } catch (err) {
      showToast('删除失败，请重试');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in select-none">
      {/* 悬浮 Toast */}
      {toastMsg && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-60 animate-bounce-in">
          <div className="px-4 py-2 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-700 text-white text-xs font-bold shadow-2xl flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-2xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                本地商品资产库
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 font-mono border border-indigo-100">
                  {products.length} 个已存商品
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                已留存本地的商品可直接秒级调入工坊使用，永久避免二次采集与接口计费
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* 搜索过滤框 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索已存商品..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 w-44 sm:w-56"
              />
            </div>

            <button 
              onClick={fetchProducts} 
              title="刷新列表"
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-all cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={onClose} 
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-all cursor-pointer shadow-2xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
              <span className="text-xs font-medium">正在读取本地数据...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-slate-400 flex flex-col items-center gap-2">
              <Database className="w-12 h-12 opacity-30 text-slate-400" />
              <span className="font-bold text-slate-600">
                {searchTerm ? '未找到符合搜索条件的商品' : '本地数据库暂无采集记录'}
              </span>
              <span className="text-xs text-slate-500">采编过的商品会自动在此表格中存档</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
              <table className="w-full text-left text-sm text-slate-700 min-w-[760px]">
                <thead className="bg-slate-50/80 text-xs text-slate-500 uppercase border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="px-5 py-3.5">商品名称与主图</th>
                    <th className="px-4 py-3.5 w-28 text-center whitespace-nowrap">平台</th>
                    <th className="px-4 py-3.5 w-40 whitespace-nowrap">商品 ID</th>
                    <th className="px-4 py-3.5 w-28 text-center whitespace-nowrap">图集数量</th>
                    <th className="px-4 py-3.5 w-32 whitespace-nowrap">采集时间</th>
                    <th className="px-5 py-3.5 w-36 text-right whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p) => (
                    <tr 
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3 flex items-center gap-3.5">
                        {normalizeImageUrlToStandardJpg(p.picUrl) ? (
                          <img 
                            src={normalizeImageUrlToStandardJpg(p.picUrl)} 
                            alt="" 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (!target.dataset.hasRetried && p.picUrl) {
                                target.dataset.hasRetried = 'true';
                                target.src = proxyMediaUrl(p.picUrl);
                              }
                            }}
                            className="w-11 h-11 rounded-xl object-cover bg-slate-100 border border-slate-200 flex-shrink-0 group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0">
                            <ImageIcon className="w-5 h-5 opacity-40" />
                          </div>
                        )}
                        <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 max-w-sm">
                          {p.title}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {p.platform === 'jd' ? (
                          <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap flex-shrink-0">
                            <JdIcon className="w-4 h-4 rounded-[3px] shadow-2xs flex-shrink-0" />
                            <span>京东</span>
                          </span>
                        ) : p.platform === 'taobao' ? (
                          <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 whitespace-nowrap flex-shrink-0">
                            <TaobaoIcon className="w-4 h-4 rounded-[3px] flex-shrink-0" />
                            <span>淘宝</span>
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                            {p.platform}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {p.itemId}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-mono">
                          <ImageIcon className="w-3 h-3 text-indigo-500" />
                          {p.imageCount} 张
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap font-mono">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleSelectProduct(p)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm flex items-center gap-1 transition-all cursor-pointer hover:scale-105 active:scale-95"
                          >
                            <span>载入</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(p.id, e)}
                            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                              confirmDeleteId === p.id 
                                ? 'bg-red-600 text-white border-red-600 animate-pulse px-2'
                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50 border-transparent'
                            }`}
                            title={confirmDeleteId === p.id ? "再次点击确认删除" : "删除缓存"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { ShoppingBag, FileImage, Trash2, ArrowRight } from 'lucide-react';
import { proxyMediaUrl } from '@/shared/api/apiClient';
import { JdIcon, TaobaoIcon } from '@/shared/icons';
import { normalizeImageUrlToStandardJpg } from '@beike/domain/drawing';

interface Props {
  products: any[];
  onEnterWorkshop: () => void;
  onDeleteProduct: (id: string, e: React.MouseEvent) => void;
  onLoadProduct: (prod: any) => void;
}

export default function AssetProductLibrary({
  products,
  onEnterWorkshop,
  onDeleteProduct,
  onLoadProduct,
}: Props) {
  return (
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  已在本地留存的电商商品素材 ({products.length})
                </span>
                <button
                  onClick={onEnterWorkshop}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <span>+ 采集新商品</span>
                </button>
              </div>

              {products.length === 0 ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200/80">
                  <ShoppingBag className="w-10 h-10 opacity-30" />
                  <span className="font-bold text-slate-600 text-sm">暂无商品素材资产</span>
                  <span className="text-xs text-slate-500">在工坊采集过的京东/淘宝商品将永久保存在此，无需重复消耗 API 额度</span>
                  <button
                    onClick={onEnterWorkshop}
                    className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer"
                  >
                    去采集商品 ➔
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map(prod => {
                    let imgCount = 0;
                    try {
                      const parsed = typeof prod.detailUrls === 'string' ? JSON.parse(prod.detailUrls) : (prod.detailUrls || []);
                      imgCount = (prod.picUrl ? 1 : 0) + parsed.length;
                    } catch {
                      imgCount = prod.picUrl ? 1 : 0;
                    }

                    return (
                      <div
                        key={prod.id}
                        className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3 group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 relative">
                            {prod.picUrl ? (
                              <img 
                                src={proxyMediaUrl(normalizeImageUrlToStandardJpg(prod.picUrl), { thumb: true, width: 240 })} 
                                alt="" 
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (!target.dataset.hasRetried && prod.picUrl) {
                                    target.dataset.hasRetried = 'true';
                                    target.src = proxyMediaUrl(prod.picUrl);
                                  } else {
                                    target.src = '/inspirations/insp_1.jpg';
                                  }
                                }}
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <FileImage className="w-6 h-6 text-slate-300 absolute inset-0 m-auto" />
                            )}
                            <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-mono text-center py-0.5">
                              {imgCount} 张图
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug mb-1">
                              {prod.title || '未命名商品'}
                            </h4>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                              {prod.platform === 'taobao' ? (
                                <span className="px-1.5 py-0.2 rounded bg-orange-50 text-orange-600 border border-orange-100 flex items-center gap-0.5 font-bold">
                                  <TaobaoIcon className="w-3 h-3" /> 淘宝
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded bg-red-50 text-red-600 border border-red-100 flex items-center gap-0.5 font-bold">
                                  <JdIcon className="w-3 h-3" /> 京东
                                </span>
                              )}
                              <span className="truncate">ID: {prod.itemId}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                          <span>{new Date(prod.createdAt).toLocaleDateString()}</span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => onDeleteProduct(prod.id, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="删除商品"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onLoadProduct(prod)}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer text-xs"
                            >
                              <span>载入工坊</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

  );
}

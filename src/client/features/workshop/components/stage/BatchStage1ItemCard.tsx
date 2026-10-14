import React from 'react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { 
  Loader2, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon,
  ZoomIn,
} from 'lucide-react';
import { BatchProductItem } from '../../model/batchTypes';
import { extractActionCategories } from '@shared/domain/products/productCategory';

export interface BatchStage1ItemCardProps {
  item: BatchProductItem;
  handleRemoveItem: (id: string) => void;
  removeDisabled?: boolean;
  onPreviewImage?: (url: string) => void;
}

export const BatchStage1ItemCard: React.FC<BatchStage1ItemCardProps> = ({
  item,
  handleRemoveItem,
  removeDisabled = false,
  onPreviewImage,
}) => {
  return (
    <div
      className={`p-4 rounded-2xl border transition-all duration-200 flex items-start gap-3.5 relative group/itemcard ${
        item.status === 'success'
          ? 'bg-transparent border-slate-200/60 hover:border-indigo-300'
          : item.status === 'failed'
          ? 'bg-rose-50/40 border-rose-200 opacity-80'
          : 'bg-slate-50/80 border-slate-200'
      }`}
    >
      {/* 🌟 商品大号封面缩略图 (点击大图预览) */}
      <div 
        onClick={() => item.coverImage && onPreviewImage?.(item.coverImage)}
        className={`w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center shadow-2xs relative group ${item.coverImage ? 'cursor-zoom-in' : ''}`}
        title={item.coverImage ? '点击查看高清大图' : undefined}
      >
        {item.coverImage ? (
          <>
            <img
              src={proxyMediaUrl(item.coverImage, { thumb: true, width: 200 })}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-108"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.fallback && item.coverImage) {
                  target.dataset.fallback = 'true';
                  target.src = item.coverImage;
                }
              }}
            />
            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white backdrop-blur-[1px]">
              <ZoomIn className="w-5 h-5" />
            </div>
          </>
        ) : (
          <ImageIcon className="w-8 h-8 text-slate-300" />
        )}
      </div>

      {/* 🌟 核心信息区 */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-900 text-white uppercase tracking-wider font-mono">
            {item.platform}
          </span>
          <span className="text-xs font-mono text-slate-400 truncate">
            SKU: {item.itemId}
          </span>
        </div>

        <h4 
          className="text-xs sm:text-[13px] font-bold text-slate-800 line-clamp-2 leading-snug group-hover/itemcard:text-indigo-950 transition-colors" 
          title={item.title}
        >
          {item.title}
        </h4>

        {item.status === 'success' && (() => {
          const badges = extractActionCategories({
            title: item.title,
            tags: item.category,
          });
          return (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {badges.slice(0, 2).map((b) => (
                <span
                  key={b.id}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${b.colorClass}`}
                >
                  {b.label}
                </span>
              ))}
              {item.price && (
                <span className="text-rose-600 font-extrabold text-xs">
                  ¥{item.price}
                </span>
              )}
              <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md text-[10px] border border-indigo-100/80">
                可用图 {item.allTypedImages?.length || 0} 张
              </span>
            </div>
          );
        })()}

        {item.status === 'failed' && (
          <p className="text-xs text-rose-600 font-medium">
            ❌ 采集失败: {item.errorMsg || '未获取到数据'}
          </p>
        )}

        {item.status === 'collecting' && (
          <p className="text-xs text-indigo-600 font-medium flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在解析图库数据...
          </p>
        )}
      </div>

      {/* 🌟 右侧状态与操作 */}
      <div className="shrink-0 flex flex-col items-end justify-between h-full min-h-[72px] gap-2">
        <button
          type="button"
          onClick={() => handleRemoveItem(item.id)}
          disabled={removeDisabled || item.status === 'collecting'}
          className="p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="放弃/剔除此商品"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {item.status === 'success' && (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
        )}
        {item.status === 'failed' && (
          <AlertCircle className="w-5 h-5 text-rose-500 fill-rose-50" />
        )}
      </div>
    </div>
  );
};

import { isUsableWorkshopResult } from '../model/generation/workshopReadiness';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import { BatchProductItem } from '../model/batchTypes';

export interface BatchStage4GalleryViewProps {
  successfulItems: BatchProductItem[];
  setActiveItemIndex: (index: number) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  setPreviewImageUrl: (url: string | null) => void;
}

export function BatchStage4GalleryView({
  successfulItems,
  setActiveItemIndex,
  onPreviewGallery,
  setPreviewImageUrl,
}: BatchStage4GalleryViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {successfulItems.map((item) => {
        const tasks = item.tasks || [];
        const successTasks = tasks.filter(isUsableWorkshopResult);
        const previewUrls = successTasks.map(t => t.resultUrl).filter((url): url is string => !!url);

        return (
          <div
            key={item.id}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            {/* 商品头部 */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 truncate">{item.title}</h4>
                <p className="text-[11px] text-slate-500">
                  {successTasks.length}/{tasks.length} 张已完成
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveItemIndex(successfulItems.findIndex(i => i.id === item.id))}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                查看详情
              </button>
            </div>

            {/* 图片画廊网格 */}
            {previewUrls.length > 0 ? (
              <div className="grid grid-cols-2 gap-1 p-1">
                {previewUrls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (onPreviewGallery) {
                        onPreviewGallery(previewUrls, idx, `${item.title} - 成图`);
                      } else {
                        setPreviewImageUrl(url);
                      }
                    }}
                    className="aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 cursor-pointer group"
                  >
                    <LazyProxyImage
                      src={url}
                      alt={`成图 ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      thumb={true}
                      width={600}
                    />
                  </button>
                ))}
                {previewUrls.length > 4 && (
                  <div className="aspect-[3/4] rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold">
                    +{previewUrls.length - 4}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                暂无生成的图片
              </div>
            )}

            {/* 文案预览 */}
            {item.copywriting?.title && (
              <div className="px-4 py-3 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-800 truncate">{item.copywriting.title}</p>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  {item.copywriting.content}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

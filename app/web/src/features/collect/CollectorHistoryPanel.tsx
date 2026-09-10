
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { confirmAction } from '@/lib/confirmAction';
import {
  History, Search, Check, Loader2, Download, Trash2, Sparkles, Bot, FolderDown, Play
} from 'lucide-react';
import {
  COLLECTOR_STORAGE_KEY,
  displayMediaSrc,
  handleImgError,
} from '@/features/collect/collectorShared';
import {
  HISTORY_ROW_HEIGHT,
  HISTORY_ROW_GAP,
  computeHistoryColumnCount,
  groupHistoryIntoRows,
} from '@/features/collect/historyVirtualScroll';

export interface CollectorHistoryPanelProps {
  historyItems: any[];
  setHistoryItems: React.Dispatch<React.SetStateAction<any[]>>;
  historyFilter: 'all' | 'ecommerce' | 'social';
  setHistoryFilter: (v: 'all' | 'ecommerce' | 'social') => void;
  historySearch: string;
  setHistorySearch: (v: string) => void;
  filteredHistory: any[];
  selectedHistoryIds: string[];
  setSelectedHistoryIds: React.Dispatch<React.SetStateAction<string[]>>;
  isDownloadingZip: boolean;
  handleBatchDownloadSelectedHistory: () => void;
  handleDownloadSingleZip: (item: any) => void;
  handleImportToAIAssistant: (item: any, prompt?: string, images?: string[], includeVideo?: boolean) => void;
  handleImportToWorkshop: (item: any) => void;
  setInspectingItem: (v: any | null) => void;
  setInspectingSelectedImages: (v: string[]) => void;
  showToast: (msg: string) => void;
}

export default function CollectorHistoryPanel({
  historyItems,
  setHistoryItems,
  historyFilter,
  setHistoryFilter,
  historySearch,
  setHistorySearch,
  filteredHistory,
  selectedHistoryIds,
  setSelectedHistoryIds,
  isDownloadingZip,
  handleBatchDownloadSelectedHistory,
  handleDownloadSingleZip,
  handleImportToAIAssistant,
  handleImportToWorkshop,
  setInspectingItem,
  setInspectingSelectedImages,
  showToast,
}: CollectorHistoryPanelProps) {
  // 容器 ref，用于虚拟滚动测量
  const parentRef = useRef<HTMLDivElement>(null);

  // 响应式列数计算
  const [containerWidth, setContainerWidth] = useState(1024);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // 根据容器宽度计算列数，与 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 保持一致
  const columnCount = useMemo(
    () => computeHistoryColumnCount(containerWidth),
    [containerWidth]
  );

  // 将一维列表转换为二维行数组
  const rows = useMemo(
    () => groupHistoryIntoRows(filteredHistory, columnCount),
    [filteredHistory, columnCount]
  );

  // 虚拟行渲染器
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => HISTORY_ROW_HEIGHT + HISTORY_ROW_GAP,
    overscan: 3, // 预渲染上下各 3 行，减少滚动白边
  });

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* 搜索、筛选与批量打包操作条 */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 分类筛选 */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('all')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${historyFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      全部 ({historyItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('ecommerce')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${historyFilter === 'ecommerce' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      电商商品 ({historyItems.filter(i => i.type === 'ecommerce').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('social')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${historyFilter === 'social' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      社媒图集 ({historyItems.filter(i => i.type === 'social').length})
                    </button>
                  </div>

                  {/* 搜索框 */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="搜索商品或作者..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white"
                    />
                  </div>
                </div>

                {/* 批量操作控制 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedHistoryIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBatchDownloadSelectedHistory}
                      disabled={isDownloadingZip}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      {isDownloadingZip ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FolderDown className="w-3.5 h-3.5" />
                      )}
                      <span>批量打包下载选中 ({selectedHistoryIds.length}款)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedHistoryIds.length === filteredHistory.length) {
                        setSelectedHistoryIds([]);
                      } else {
                        setSelectedHistoryIds(filteredHistory.map(i => i.id));
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer shadow-2xs"
                  >
                    {selectedHistoryIds.length === filteredHistory.length ? '取消全选' : '全选'}
                  </button>

                  {selectedHistoryIds.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirmAction(`确定要从汇总库删除选中的 ${selectedHistoryIds.length} 条记录吗？`)) {
                          const updated = historyItems.filter(it => !selectedHistoryIds.includes(it.id));
                          try {
                            localStorage.setItem(COLLECTOR_STORAGE_KEY, JSON.stringify(updated));
                          } catch {}
                          setHistoryItems(updated);
                          setSelectedHistoryIds([]);
                          showToast('🗑 已批量删除选中的记录');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-medium cursor-pointer"
                    >
                      批量删除
                    </button>
                  )}
                </div>
              </div>

              {/* 汇总库卡片网格 - 虚拟滚动 */}
              {filteredHistory.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-200 text-center space-y-2">
                  <History className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400">暂无符合条件的采集记录</p>
                </div>
              ) : (
                <div
                  ref={parentRef}
                  className="overflow-auto"
                  style={{ contain: 'strict' }}
                >
                  {/* 虚拟滚动内容层 */}
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const rowItems = rows[virtualRow.index];
                      return (
                        <div
                          key={virtualRow.key}
                          data-index={virtualRow.index}
                          ref={rowVirtualizer.measureElement}
                          className="grid gap-4 mb-4"
                          style={{
                            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          {rowItems.map((item) => {
                            const isSelected = selectedHistoryIds.includes(item.id);
                            return (
                              <div
                                key={item.id}
                                className={`group relative rounded-2xl bg-white border p-3.5 transition-all space-y-3 ${isSelected
                                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                                    : 'border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
                                  }`}
                              >
                                {/* 顶部多选框与平台标签 */}
                                <div className="flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedHistoryIds(prev => prev.filter(id => id !== item.id));
                                      } else {
                                        setSelectedHistoryIds(prev => [...prev, item.id]);
                                      }
                                    }}
                                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white hover:border-slate-400'
                                      }`}
                                  >
                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                  </button>

                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold font-mono">
                                    {item.type === 'social' ? '社媒图集' : (item.platform?.toUpperCase() || '电商')}
                                  </span>
                                </div>

                                {/* 封面与信息 */}
                                <div
                                  onClick={() => {
                                    setInspectingItem(item);
                                    setInspectingSelectedImages(item.images || []);
                                  }}
                                  className="flex items-start gap-3 cursor-pointer"
                                >
                                  <div className="relative w-20 h-24 rounded-xl overflow-hidden border border-slate-200/90 flex-shrink-0 bg-slate-50 group-hover:shadow-md transition-all">
                                    <img
                                      src={displayMediaSrc(item.coverImage || item.images?.[0]) || item.coverImage || item.images?.[0] || undefined}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                      onError={(e) => handleImgError(e, item.coverImage || item.images?.[0])}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                    {item.video || item.videoUrl ? (
                                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-rose-600/90 backdrop-blur-xs text-[9px] font-bold text-white leading-none flex items-center gap-0.5">
                                        <Play className="w-2.5 h-2.5 fill-current" />
                                        视频
                                      </span>
                                    ) : item.images && item.images.length > 1 ? (
                                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[9px] font-bold text-white leading-none">
                                        {item.images.length}P
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="space-y-1.5 min-w-0 flex-1 py-0.5">
                                    <h3 className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
                                      {item.title}
                                    </h3>
                                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                                      <span className="font-medium text-slate-500">
                                        {item.video || item.videoUrl
                                          ? `${item.images?.length || 0} 张图 + 原视频`
                                          : `${item.images?.length || 0} 张素材`}
                                      </span>
                                      <span>{item.time ? item.time.split(' ')[0].replace(/-/g, '/') : ''}</span>
                                    </div>
                                    {/* 多图微型缩略图横排预览 (最多展示后续 3 张) */}
                                    {item.images && item.images.length > 1 && (
                                      <div className="flex items-center gap-1 pt-0.5">
                                        {item.images.slice(1, 4).map((subUrl: string, sIdx: number) => (
                                          <img
                                            key={sIdx}
                                            src={displayMediaSrc(subUrl) || subUrl}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            onError={(e) => handleImgError(e, subUrl)}
                                            className="w-6 h-6 rounded-md object-cover border border-slate-200/80 bg-slate-50 shrink-0"
                                          />
                                        ))}
                                        {item.images.length > 4 && (
                                          <span className="text-[10px] text-slate-400 font-mono pl-0.5">
                                            +{item.images.length - 4}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* 底部操作快捷按钮 */}
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadSingleZip(item)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium flex items-center gap-1 cursor-pointer"
                                    title="下载 ZIP"
                                  >
                                    <Download className="w-3 h-3 text-blue-600" />
                                    <span>ZIP</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const hasVid = Boolean(item.video || item.videoUrl);
                                      handleImportToAIAssistant(item, undefined, undefined, hasVid ? true : undefined);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium flex items-center gap-1 cursor-pointer border border-indigo-200/80"
                                    title="导入 AI 助手"
                                  >
                                    <Bot className="w-3 h-3 text-indigo-600" />
                                    <span>AI助手</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleImportToWorkshop(item)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black text-white font-medium flex items-center gap-1 cursor-pointer"
                                    title="带入工坊"
                                  >
                                    <Sparkles className="w-3 h-3 text-amber-300" />
                                    <span>工坊</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (await confirmAction('确定要删除此采集条目吗？')) {
                                        const updated = historyItems.filter(it => it.id !== item.id);
                                        try {
                                          localStorage.setItem(COLLECTOR_STORAGE_KEY, JSON.stringify(updated));
                                        } catch {}
                                        setHistoryItems(updated);
                                        showToast('🗑 已从汇总库删除');
                                      }
                                    }}
                                    className="p-1 text-slate-300 hover:text-red-600 transition-colors cursor-pointer"
                                    title="删除条目"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {/* 填充末尾行以保持对齐 */}
                          {Array.from({ length: columnCount - rowItems.length }).map((_, idx) => (
                            <div key={`placeholder-${idx}`} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
  );
}

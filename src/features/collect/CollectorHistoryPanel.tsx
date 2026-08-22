'use client';

import React from 'react';
import { confirmAction } from '@/lib/confirmAction';
import {
  History, Search, Check, Loader2, Download, Trash2, Sparkles, Bot, FolderDown
} from 'lucide-react';
import {
  COLLECTOR_STORAGE_KEY,
  displayMediaSrc,
  handleImgError,
} from '@/features/collect/collectorShared';

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
  handleImportToAIAssistant: (item: any) => void;
  handleImportToBuyerShow: (item: any) => void;
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
  handleImportToBuyerShow,
  setInspectingItem,
  setInspectingSelectedImages,
  showToast,
}: CollectorHistoryPanelProps) {
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

              {/* 汇总库卡片网格 */}
              {filteredHistory.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-200 text-center space-y-2">
                  <History className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400">暂无符合条件的采集记录</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredHistory.map((item) => {
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
                          <img
                            src={displayMediaSrc(item.coverImage || item.images?.[0]) || item.coverImage || item.images?.[0] || ''}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={(e) => handleImgError(e, item.coverImage || item.images?.[0])}
                            className="w-16 h-16 rounded-xl object-cover border border-slate-200 flex-shrink-0 bg-slate-50 group-hover:opacity-90 transition-opacity"
                          />
                          <div className="space-y-1 min-w-0 flex-1">
                            <h3 className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug">
                              {item.title}
                            </h3>
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>{item.images?.length || 0} 张素材</span>
                              <span>{item.time?.slice(0, 10)}</span>
                            </div>
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
                            onClick={() => handleImportToAIAssistant(item)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium flex items-center gap-1 cursor-pointer border border-indigo-200/80"
                            title="导入 AI 助手"
                          >
                            <Bot className="w-3 h-3 text-indigo-600" />
                            <span>AI助手</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleImportToBuyerShow(item)}
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
                </div>
              )}
            </div>

  );
}

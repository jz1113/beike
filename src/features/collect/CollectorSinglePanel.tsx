'use client';

import React from 'react';
import {
  X, ShoppingBag, Sparkles, Check, Loader2, Link2, Download, Maximize2,
  Square, Film, Bot, Send, Compass
} from 'lucide-react';
import {
  displayMediaSrc,
  displayVideoSrc,
  handleImgError,
  mediaAssetCount,
  secondaryBtnClass,
} from '@/features/collect/collectorShared';

export interface CollectorSinglePanelProps {
  singlePlatform: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social';
  setSinglePlatform: (v: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social') => void;
  singleInput: string;
  setSingleInput: (v: string) => void;
  handleSingleCollect: () => void;
  isCollectingSingle: boolean;
  forceRefresh: boolean;
  setForceRefresh: (v: boolean) => void;
  singleCollectedResult: any | null;
  selectedSingleImages: string[];
  setSelectedSingleImages: React.Dispatch<React.SetStateAction<string[]>>;
  selectedVideo: boolean;
  setSelectedVideo: React.Dispatch<React.SetStateAction<boolean>>;
  singleImageFilter: 'all' | 'main' | 'sku' | 'desc' | 'video';
  setSingleImageFilter: (v: 'all' | 'main' | 'sku' | 'desc' | 'video') => void;
  aiAssistantPrompt: string;
  setAiAssistantPrompt: (v: string) => void;
  isDownloadingVideo: boolean;
  isDownloadingZip: boolean;
  setPreviewImageUrl: (v: string | null) => void;
  setInspectingItem: (v: any | null) => void;
  setIsStyleExtractOpen: (v: boolean) => void;
  handleDownloadSingleVideo: (item: any) => void;
  handleDownloadSingleZip: (item: any) => void;
  handleImportToBuyerShow: (item: any) => void;
  handleImportToAIAssistant: (item: any, prompt?: string) => void;
  showToast: (msg: string) => void;
}

export default function CollectorSinglePanel({
  singlePlatform,
  setSinglePlatform,
  singleInput,
  setSingleInput,
  handleSingleCollect,
  isCollectingSingle,
  forceRefresh,
  setForceRefresh,
  singleCollectedResult,
  selectedSingleImages,
  setSelectedSingleImages,
  selectedVideo,
  setSelectedVideo,
  singleImageFilter,
  setSingleImageFilter,
  aiAssistantPrompt,
  setAiAssistantPrompt,
  isDownloadingVideo,
  isDownloadingZip,
  setPreviewImageUrl,
  setInspectingItem,
  setIsStyleExtractOpen,
  handleDownloadSingleVideo,
  handleDownloadSingleZip,
  handleImportToBuyerShow,
  handleImportToAIAssistant,
  showToast,
}: CollectorSinglePanelProps) {
  return (
            <div className="max-w-5xl mx-auto space-y-5">
              {/* 输入控制卡片 */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
                {/* 平台选择胶囊群 */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                  <span className="text-slate-400 mr-1 text-xs">选择专线:</span>
                  {[
                    { id: 'auto', name: '智能识别', color: 'text-blue-700 bg-blue-50 border-blue-200' },
                    { id: 'jd', name: '京东', color: 'text-red-700 bg-red-50 border-red-200' },
                    { id: 'taobao', name: '淘宝/天猫', color: 'text-orange-700 bg-orange-50 border-orange-200' },
                    { id: '1688', name: '1688', color: 'text-amber-800 bg-amber-50 border-amber-200' },
                    { id: 'pinduoduo', name: '拼多多', color: 'text-rose-700 bg-rose-50 border-rose-200' },
                    { id: 'social', name: '社媒', color: 'text-pink-700 bg-pink-50 border-pink-200' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSinglePlatform(p.id as any)}
                      className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-xs ${singlePlatform === p.id
                          ? `${p.color} font-bold shadow-2xs`
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                {/* 核心输入框与操作按钮 */}
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 relative flex items-center">
                    <Link2 className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
                    <input
                      type="text"
                      value={singleInput}
                      onChange={(e) => setSingleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSingleCollect();
                      }}
                      placeholder="粘贴商品详情链接（如 https://item.jd.com/... 或淘宝/1688）或小红书/抖音/快手作品链接..."
                      className="w-full pl-11 pr-28 py-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                    />
                    <div className="absolute right-2.5 flex items-center gap-1.5">
                      {singleInput && (
                        <button
                          type="button"
                          onClick={() => setSingleInput('')}
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                          title="清空输入"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text) setSingleInput(text.trim());
                          } catch {
                            showToast('⚠️ 无法读取剪贴板，请手动粘贴');
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 text-slate-700 text-xs hover:bg-slate-50 font-semibold cursor-pointer shadow-2xs transition-colors"
                      >
                        粘贴
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSingleCollect}
                    disabled={isCollectingSingle || !singleInput.trim()}
                    className={`h-12 px-6 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer flex-shrink-0 select-none ${isCollectingSingle || !singleInput.trim()
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md shadow-blue-500/25'
                      }`}
                  >
                    {isCollectingSingle ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在解析穿透...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>一键采集商品</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex justify-end">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceRefresh}
                      onChange={(e) => setForceRefresh(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span>强制穿透刷新缓存</span>
                  </label>
                </div>
              </div>

              {/* 采集结果展示卡片 */}
              {singleCollectedResult ? (
                <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-5 animate-fade-in">
                  {/* 顶部：元信息纵向堆叠 + 工具栏 */}
                  <div className="flex flex-col gap-3 pb-4.5 border-b border-slate-100">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {displayMediaSrc(singleCollectedResult.coverImage) ? (
                        <img
                          src={displayMediaSrc(singleCollectedResult.coverImage)}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => handleImgError(e, singleCollectedResult.coverImage)}
                          className="w-16 h-16 rounded-2xl object-cover border border-slate-200/80 shadow-2xs flex-shrink-0 bg-slate-50 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImageUrl(singleCollectedResult.coverImage)}
                        />
                      ) : null}
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-bold font-mono shrink-0 mt-0.5">
                            {singleCollectedResult.type === 'social' ? '社媒图集' : (singleCollectedResult.platform?.toUpperCase() || '电商')}
                          </span>
                          <h2
                            className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug"
                            title={singleCollectedResult.title}
                          >
                            {singleCollectedResult.title}
                          </h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                          {singleCollectedResult.price > 0 && (
                            <span className="font-mono text-sm font-black text-rose-600">
                              ¥{singleCollectedResult.price}
                            </span>
                          )}
                          {singleCollectedResult.author && (
                            <span>作者: <strong className="text-slate-700">{singleCollectedResult.author}</strong></span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                            素材总数: <strong className="text-slate-900 font-mono">{mediaAssetCount(singleCollectedResult)}</strong>
                            {singleCollectedResult.video ? '（含视频）' : ' 张'}
                          </span>
                          {singleCollectedResult.video && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold font-mono flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              <span>高清原视频</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {singleCollectedResult.video && (
                        <button
                          type="button"
                          onClick={() => handleDownloadSingleVideo(singleCollectedResult)}
                          disabled={isDownloadingVideo}
                          className={secondaryBtnClass}
                        >
                          <Film className="w-3.5 h-3.5 text-rose-600" />
                          <span>{isDownloadingVideo ? '下载中...' : '下载 MP4'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDownloadSingleZip(singleCollectedResult)}
                        disabled={isDownloadingZip}
                        className={secondaryBtnClass}
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                        <span>下载 ZIP 素材包</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setInspectingItem(singleCollectedResult);
                          setIsStyleExtractOpen(true);
                        }}
                        className={secondaryBtnClass}
                      >
                        <Compass className="w-3.5 h-3.5 text-purple-600" />
                        <span>提炼视觉风格</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleImportToBuyerShow(singleCollectedResult)}
                        className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-slate-900/10 shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>带入商用工坊</span>
                      </button>
                    </div>
                  </div>

                  {/* 图集分类切换与全选控制 */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit max-w-full">
                      <button
                        type="button"
                        onClick={() => setSingleImageFilter('all')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${singleImageFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                      >
                        全部 ({mediaAssetCount(singleCollectedResult)})
                      </button>
                      {singleCollectedResult.video && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('video')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${singleImageFilter === 'video' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          原视频
                        </button>
                      )}
                      {singleCollectedResult.mainImages?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('main')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${singleImageFilter === 'main' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          主图 ({singleCollectedResult.mainImages.length})
                        </button>
                      )}
                      {singleCollectedResult.skuImages?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('sku')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${singleImageFilter === 'sku' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          SKU ({singleCollectedResult.skuImages.length})
                        </button>
                      )}
                      {singleCollectedResult.descImages?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('desc')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${singleImageFilter === 'desc' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          详情 ({singleCollectedResult.descImages.length})
                        </button>
                      )}
                    </div>

                    {singleImageFilter !== 'video' && (
                      <div className="flex items-center gap-3 text-slate-500 shrink-0">
                        <span>已选 <strong>{selectedSingleImages.length}</strong> 张</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedSingleImages.length === singleCollectedResult.images.length) {
                              setSelectedSingleImages([]);
                            } else {
                              setSelectedSingleImages(singleCollectedResult.images || []);
                            }
                          }}
                          className="text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          {selectedSingleImages.length === singleCollectedResult.images.length ? '取消全选' : '全选'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 缩略图矩阵 + 视频预览格 */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-96 overflow-y-auto pr-1">
                    {singleCollectedResult.video && (singleImageFilter === 'all' || singleImageFilter === 'video') && (
                      <div
                        className={`group relative aspect-square rounded-2xl overflow-hidden border bg-slate-900 col-span-2 sm:col-span-2 cursor-pointer transition-all ${selectedVideo
                            ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xs'
                            : 'border-rose-200 ring-1 ring-rose-100'
                          }`}
                        onClick={() => setSelectedVideo(v => !v)}
                      >
                        <video
                          src={displayVideoSrc(singleCollectedResult.video)}
                          poster={displayMediaSrc(singleCollectedResult.coverImage) || undefined}
                          controls
                          playsInline
                          muted
                          preload="metadata"
                          className="w-full h-full object-contain bg-black"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold flex items-center gap-1 pointer-events-none">
                          <Film className="w-3 h-3" />
                          原视频
                        </div>
                        <div className={`absolute top-2 right-2 w-5 h-5 rounded-md flex items-center justify-center transition-all pointer-events-none ${selectedVideo ? 'bg-blue-600 text-white' : 'bg-black/40 text-white/70 backdrop-blur-xs'
                          }`}>
                          {selectedVideo ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImageUrl(singleCollectedResult.video);
                          }}
                          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-black/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="全屏预览视频"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {singleImageFilter !== 'video' &&
                      (singleImageFilter === 'main'
                        ? singleCollectedResult.mainImages
                        : singleImageFilter === 'sku'
                          ? singleCollectedResult.skuImages
                          : singleImageFilter === 'desc'
                            ? singleCollectedResult.descImages
                            : singleCollectedResult.images
                      )?.map((imgUrl: string, idx: number) => {
                        const isSelected = selectedSingleImages.includes(imgUrl);
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedSingleImages(prev => prev.filter(u => u !== imgUrl));
                              } else {
                                setSelectedSingleImages(prev => [...prev, imgUrl]);
                              }
                            }}
                            className={`group relative aspect-square rounded-2xl overflow-hidden border cursor-pointer transition-all bg-slate-100 ${isSelected
                                ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xs'
                                : 'border-slate-200 hover:border-slate-300'
                              }`}
                          >
                            <img
                              src={displayMediaSrc(imgUrl) || imgUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => handleImgError(e, imgUrl)}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                            <div className={`absolute top-2 left-2 w-5 h-5 rounded-md flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white' : 'bg-black/40 text-white/70 backdrop-blur-xs opacity-0 group-hover:opacity-100'
                              }`}>
                              {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImageUrl(imgUrl);
                              }}
                              className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-black/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              title="查看大图"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  {/* AI 底栏：唯一导入入口 */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-pink-50/40 border border-indigo-200/80 space-y-3 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900">AI 视觉导演</span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-mono font-bold">
                        已挂载 {selectedSingleImages.length + (selectedVideo && singleCollectedResult.video ? 1 : 0)} 项素材
                      </span>
                    </div>

                    {(selectedSingleImages.length > 0 || (selectedVideo && singleCollectedResult.video)) ? (
                      <div className="flex items-center gap-2 overflow-x-auto py-0.5 custom-scrollbar">
                        {selectedVideo && singleCollectedResult.video && (
                          <div className="relative group/mini w-12 h-12 rounded-xl overflow-hidden border border-rose-300 flex-shrink-0 bg-slate-900 shadow-2xs">
                            <img
                              src={displayMediaSrc(singleCollectedResult.coverImage) || displayMediaSrc(singleCollectedResult.images?.[0]) || ''}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => handleImgError(e, singleCollectedResult.coverImage)}
                              className="w-full h-full object-cover opacity-90"
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <Film className="w-4 h-4 text-white drop-shadow" />
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVideo(false);
                              }}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-red-500 text-white flex items-center justify-center opacity-80 group-hover/mini:opacity-100 transition-all cursor-pointer shadow-2xs"
                              title="取消挂载视频"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                        {selectedSingleImages.slice(0, 20).map((imgUrl: string, idx: number) => (
                          <div key={`${imgUrl}-${idx}`} className="relative group/mini w-12 h-12 rounded-xl overflow-hidden border border-indigo-200 flex-shrink-0 bg-white shadow-2xs">
                            <img
                              src={displayMediaSrc(imgUrl) || imgUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => handleImgError(e, imgUrl)}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSingleImages(prev => prev.filter(u => u !== imgUrl));
                              }}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-red-500 text-white flex items-center justify-center opacity-80 group-hover/mini:opacity-100 transition-all cursor-pointer shadow-2xs"
                              title="取消挂载"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-indigo-700/80">
                        请在上方勾选图片或原视频；若都未勾选，发送时将默认带入全部图片。
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={aiAssistantPrompt}
                        onChange={(e) => setAiAssistantPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleImportToAIAssistant(singleCollectedResult, aiAssistantPrompt);
                          }
                        }}
                        placeholder={`输入对【${singleCollectedResult.title || '当前商品'}】的创作需求...`}
                        className="flex-1 pl-3.5 pr-3.5 py-2.5 rounded-xl bg-white border border-indigo-200/90 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => handleImportToAIAssistant(singleCollectedResult, aiAssistantPrompt)}
                        className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-indigo-600/20 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>发送到 AI</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {[
                        '深度分析商品材质与工业光影',
                        '规划4组小红书高转化买家秀分镜',
                        '提炼核心卖点并写一段种草文案'
                      ].map((chip, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => setAiAssistantPrompt(chip)}
                          className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-[11px] font-medium text-indigo-900 border border-indigo-100 hover:border-indigo-300 transition-all cursor-pointer shadow-2xs"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* 空状态引导 */
                <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-200/90 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">尚未采集电商或社媒商品</h3>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    支持粘贴京东、淘宝、天猫、1688、拼多多等全网主流平台的商品链接或数字 ID，以及小红书笔记/抖音视频作品，一键穿透提取全量主图、SKU 图与详情高清素材。
                  </p>
                </div>
              )}
            </div>

  );
}

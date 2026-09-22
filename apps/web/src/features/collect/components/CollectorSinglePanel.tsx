
import React from 'react';
import {
  X, Sparkles, Check, Loader2, Download, Maximize2, ArrowUp,
  Square, Film, Bot, Send, Compass
} from 'lucide-react';
import {
  displayMediaSrc,
  displayVideoSrc,
  collectedVideos,
  handleImgError,
  mediaAssetCount,
  secondaryBtnClass,
} from '@/features/collect/utils/collectorTypes';
import Skeleton from '@/shared/ui/Skeleton';

export interface CollectorSinglePanelProps {
  singlePlatform: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social';
  setSinglePlatform: (v: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social') => void;
  singleInput: string;
  setSingleInput: (v: string) => void;
  handleSingleCollect: () => void;
  isCollectingSingle: boolean;
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
  handleImportToWorkshop: (item: any) => void;
  handleImportToAIAssistant: (item: any, prompt?: string, images?: string[], includeVideo?: boolean) => void;
}

export default function CollectorSinglePanel({
  singlePlatform,
  setSinglePlatform,
  singleInput,
  setSingleInput,
  handleSingleCollect,
  isCollectingSingle,
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
  handleImportToWorkshop,
  handleImportToAIAssistant,
}: CollectorSinglePanelProps) {
  const collectedVideoList = collectedVideos(singleCollectedResult);

  return (
            <div className="mx-auto max-w-[980px] space-y-5">
              {/* 输入控制卡片 */}
              <div className="space-y-5 rounded-[32px] border border-slate-200/80 bg-white/80 p-6 sm:p-8">
                <div className="flex flex-col gap-3">
                  <div>
                    <h2 className="text-base font-black tracking-tight text-slate-900">粘贴链接，自动收集整套素材</h2>
                    <p className="mt-1 text-xs text-slate-400">识别平台后，统一提取主图、SKU、详情图与原视频。</p>
                  </div>
                </div>

                {/* 平台选择胶囊群 */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                  <span className="text-slate-500 mr-1 text-xs">来源平台:</span>
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

                {/* 大面积链接输入区：按 Ctrl/Cmd + Enter 采集 */}
                <div className="relative">
                  <textarea
                    rows={3}
                    value={singleInput}
                    onChange={(e) => setSingleInput(e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData('text/plain')?.trim();
                      if (text) {
                        e.preventDefault();
                        setSingleInput(text);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSingleCollect();
                      }
                    }}
                    placeholder={'粘贴商品或社媒作品链接到这里\n支持商品链接、数字 ID 或社媒作品链接'}
                    className="block min-h-[124px] w-full resize-y rounded-[24px] border-2 border-dashed border-slate-300 bg-white/70 px-6 py-5 pr-24 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-blue-300 hover:bg-white focus:border-blue-400 focus:bg-white focus:ring-0"
                    aria-label="商品或社媒作品链接"
                  />
                  {singleInput && (
                    <button
                      type="button"
                      onClick={() => setSingleInput('')}
                      className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600 cursor-pointer"
                      title="清空输入"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSingleCollect}
                    disabled={isCollectingSingle || !singleInput.trim()}
                    className={`absolute bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-full transition-all cursor-pointer select-none ${isCollectingSingle || !singleInput.trim()
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-900 text-white shadow-md shadow-slate-900/15 hover:bg-black active:scale-95'
                      }`}
                    title={isCollectingSingle ? '正在采集' : '开始采集'}
                    aria-label={isCollectingSingle ? '正在采集' : '开始采集'}
                  >
                    {isCollectingSingle ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  </button>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" />自动识别平台</span>
                    <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" />高清素材提取</span>
                    <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" />结果可入库</span>
                  </div>
                </div>
              </div>

              {/* 🌟 加载中的骨架占位（避免布局跳动） */}
              {isCollectingSingle && !singleCollectedResult && (
                <div
                  className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-5 animate-fade-in"
                  aria-busy="true"
                >
                  <div className="flex items-start gap-3.5 pb-4.5 border-b border-slate-100">
                    <Skeleton radius="card" width="4rem" height="4rem" ariaLabel="封面加载中" />
                    <div className="flex-1 space-y-2">
                      <Skeleton width="30%" height="1rem" ariaLabel="平台标签加载中" />
                      <Skeleton width="85%" height="1.25rem" ariaLabel="标题加载中" />
                      <div className="flex items-center gap-2 pt-1">
                        <Skeleton width="4rem" height="0.875rem" radius="chip" />
                        <Skeleton width="6rem" height="0.875rem" radius="chip" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Skeleton width="6rem" height="2.25rem" radius="btn" />
                      <Skeleton width="6rem" height="2.25rem" radius="btn" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {Array.from({ length: 12 }).map((_, idx) => (
                      <Skeleton
                        key={idx}
                        radius="card"
                        width="100%"
                        height="0"
                        className="aspect-square"
                        ariaLabel="图片素材加载中"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 采集完成后直接展示素材画廊；未采集时不占用页面空间 */}
              {singleCollectedResult && (
                <section className="space-y-4 animate-fade-in" aria-label="已采集素材画廊">
                  {/* 画廊信息与操作 */}
                  <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_14px_32px_-24px_rgba(15,23,42,0.28)]">
                    <div className="flex flex-col gap-3">
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
                            {collectedVideoList.length > 0 ? `（含 ${collectedVideoList.length} 条视频/动态）` : ' 张'}
                          </span>
                          {collectedVideoList.length > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold font-mono flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              <span>{collectedVideoList.length > 1 ? `${collectedVideoList.length} 条视频/动态` : '高清原视频'}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {collectedVideoList.length > 0 && (
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
                        onClick={() => handleImportToWorkshop(singleCollectedResult)}
                        className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-slate-900/10 shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>带入商用工坊</span>
                      </button>
                    </div>
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
                      {collectedVideoList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('video')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${singleImageFilter === 'video' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          视频 / 动态 ({collectedVideoList.length})
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

                  {/* 画廊缩略图矩阵 + 视频预览格 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {collectedVideoList.length > 0 && (singleImageFilter === 'all' || singleImageFilter === 'video') && collectedVideoList.map((videoUrl, videoIndex) => (
                      <div
                        key={videoUrl}
                        className={`group relative aspect-square rounded-2xl overflow-hidden border bg-slate-900 col-span-2 sm:col-span-2 cursor-pointer transition-all ${selectedVideo
                            ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xs'
                            : 'border-rose-200 ring-1 ring-rose-100'
                          }`}
                        onClick={() => setSelectedVideo(v => !v)}
                      >
                        <video
                          src={displayVideoSrc(videoUrl)}
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
                          视频/动态 {videoIndex + 1}
                        </div>
                        <div className={`absolute top-2 right-2 w-5 h-5 rounded-md flex items-center justify-center transition-all pointer-events-none ${selectedVideo ? 'bg-blue-600 text-white' : 'bg-black/40 text-white/70 backdrop-blur-xs'
                          }`}>
                          {selectedVideo ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImageUrl(videoUrl);
                          }}
                          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-black/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="全屏预览视频"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

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
                              src={displayMediaSrc(singleCollectedResult.coverImage) || displayMediaSrc(singleCollectedResult.images?.[0]) || undefined}
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
                          // Enter 发送；Ctrl/Cmd + Enter 也可发送（与富文本框保持一致）
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const hasVid = Boolean(singleCollectedResult.video || singleCollectedResult.videoUrl);
                            handleImportToAIAssistant(
                              singleCollectedResult,
                              aiAssistantPrompt,
                              selectedSingleImages,
                              selectedVideo && hasVid
                            );
                          }
                        }}
                        placeholder={`输入对【${singleCollectedResult.title || '当前商品'}】的创作需求...`}
                        className="flex-1 pl-3.5 pr-3.5 py-2.5 rounded-xl bg-white border border-indigo-200/90 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const hasVid = Boolean(singleCollectedResult.video || singleCollectedResult.videoUrl);
                          handleImportToAIAssistant(
                            singleCollectedResult,
                            aiAssistantPrompt,
                            selectedSingleImages,
                            selectedVideo && hasVid
                          );
                        }}
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
                </section>
              )}
            </div>

  );
}

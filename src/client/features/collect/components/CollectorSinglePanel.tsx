
import React from 'react';
import {
  X, Sparkles, Loader2, Download, ArrowUp, ChevronDown, Film, Compass
} from 'lucide-react';
import {
  displayMediaSrc,
  collectedVideos,
  handleImgError,
  mediaAssetCount,
  secondaryBtnClass,
} from '@client/features/collect/utils/collectorTypes';
import Skeleton from '@client/shared/ui/Skeleton';
import CollectorMediaGallery from './CollectorMediaGallery';
import CollectorAssistantPanel from './CollectorAssistantPanel';

import type { CollectorSinglePanelProps } from './collectorSinglePanelTypes';
export type { CollectorSinglePanelProps } from './collectorSinglePanelTypes';

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
  onExtractStyle,
  handleDownloadSingleVideo,
  handleDownloadSingleZip,
  handleImportToWorkshop,
  handleImportToAIAssistant,
}: CollectorSinglePanelProps) {
  const collectedVideoList = collectedVideos(singleCollectedResult);
  const platformSelectId = React.useId();
  const canCollect = Boolean(singleInput.trim()) && !isCollectingSingle;

  return (
            <div className="mx-auto max-w-[980px] space-y-5">
              {/* 将输入和操作合并，平台选项按需展开。 */}
              <div className="relative mx-auto w-full max-w-[980px] overflow-hidden rounded-[32px] border-2 border-dashed border-rose-200 bg-white transition-colors hover:border-rose-300 focus-within:border-rose-400">
                <div className="relative">
                  <textarea
                    rows={8}
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
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (canCollect) handleSingleCollect();
                      }
                    }}
                    placeholder={singlePlatform === 'auto' || singlePlatform === 'social'
                      ? '在这里粘贴商品或社媒链接，支持直接粘贴分享文案\n系统会自动识别平台，提取商品图片与社媒素材'
                      : '在这里粘贴商品链接或输入商品 ID…'}
                    className="block h-[300px] w-full resize-none bg-transparent px-6 pb-20 pt-7 pr-14 text-sm leading-[1.85] text-slate-700 outline-none placeholder:text-slate-400 sm:px-9 sm:pt-8 sm:pr-16"
                    aria-label="商品链接、商品 ID 或社媒作品链接"
                  />
                  {singleInput && (
                    <button
                      type="button"
                      onClick={() => setSingleInput('')}
                      className="absolute right-4 top-5 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 cursor-pointer"
                      title="清空输入"
                      aria-label="清空输入"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="absolute bottom-6 left-5 right-6 flex items-center justify-between gap-3 sm:left-7 sm:right-9">
                  <div className="relative min-w-0">
                    <label htmlFor={platformSelectId} className="sr-only">来源平台</label>
                    <select
                      id={platformSelectId}
                      value={singlePlatform}
                      onChange={(e) => setSinglePlatform(e.target.value as CollectorSinglePanelProps['singlePlatform'])}
                      className="h-10 max-w-full cursor-pointer appearance-none rounded-xl bg-transparent py-2 pl-3 pr-9 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      title="默认自动识别；输入商品 ID 时可手动选择平台"
                    >
                      <option value="auto">自动识别平台</option>
                      <option value="jd">京东</option>
                      <option value="taobao">淘宝 / 天猫</option>
                      <option value="1688">1688</option>
                      <option value="pinduoduo">拼多多</option>
                      <option value="social">社媒</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  </div>
                  <button
                    type="button"
                    onClick={handleSingleCollect}
                    disabled={!canCollect}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    title="开始采集（⌘ / Ctrl + Enter）"
                    aria-label={isCollectingSingle ? '正在采集' : '开始采集'}
                  >
                    {isCollectingSingle ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
                    <span className="sr-only">{isCollectingSingle ? '正在采集…' : '开始采集'}</span>
                  </button>
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
                          onExtractStyle(selectedSingleImages, singleCollectedResult.title);
                        }}
                        disabled={selectedSingleImages.length === 0}
                        className={`${secondaryBtnClass} disabled:opacity-50 disabled:cursor-not-allowed`}
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
                  <CollectorMediaGallery
                    singleCollectedResult={singleCollectedResult}
                    singleImageFilter={singleImageFilter}
                    selectedSingleImages={selectedSingleImages}
                    setSelectedSingleImages={setSelectedSingleImages}
                    selectedVideo={selectedVideo}
                    setSelectedVideo={setSelectedVideo}
                    setPreviewImageUrl={setPreviewImageUrl}
                  />

                  <CollectorAssistantPanel
                    singleCollectedResult={singleCollectedResult}
                    selectedSingleImages={selectedSingleImages}
                    setSelectedSingleImages={setSelectedSingleImages}
                    selectedVideo={selectedVideo}
                    setSelectedVideo={setSelectedVideo}
                    aiAssistantPrompt={aiAssistantPrompt}
                    setAiAssistantPrompt={setAiAssistantPrompt}
                    handleImportToAIAssistant={handleImportToAIAssistant}
                  />
                </section>
              )}
            </div>

  );
}

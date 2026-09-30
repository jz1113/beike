import { Check, Film, Maximize2, Square } from 'lucide-react';
import { collectedVideos, displayMediaSrc, displayVideoSrc, handleImgError } from '../utils/collectorTypes';
import type { CollectorSinglePanelProps } from './collectorSinglePanelTypes';

type Props = Pick<CollectorSinglePanelProps, 'singleCollectedResult' | 'singleImageFilter' | 'selectedSingleImages' | 'setSelectedSingleImages' | 'selectedVideo' | 'setSelectedVideo' | 'setPreviewImageUrl'>;

export default function CollectorMediaGallery({ singleCollectedResult, singleImageFilter, selectedSingleImages, setSelectedSingleImages, selectedVideo, setSelectedVideo, setPreviewImageUrl }: Props) {
  const collectedVideoList = collectedVideos(singleCollectedResult);
  return (
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
  );
}

import { Bot, Film, Send, X } from 'lucide-react';
import { collectedVideos, displayMediaSrc, handleImgError } from '../model/collectorTypes';
import type { CollectorSinglePanelProps } from './collectorSinglePanelTypes';

type Props = Pick<CollectorSinglePanelProps, 'singleCollectedResult' | 'selectedSingleImages' | 'setSelectedSingleImages' | 'selectedVideo' | 'setSelectedVideo' | 'aiAssistantPrompt' | 'setAiAssistantPrompt' | 'handleImportToAIAssistant'>;

export default function CollectorAssistantPanel({ singleCollectedResult, selectedSingleImages, setSelectedSingleImages, selectedVideo, setSelectedVideo, aiAssistantPrompt, setAiAssistantPrompt, handleImportToAIAssistant }: Props) {
  const collectedVideoList = collectedVideos(singleCollectedResult);
  const hasSelectedVideo = selectedVideo && collectedVideoList.length > 0;
  const canSend = selectedSingleImages.length > 0 || hasSelectedVideo;
  return (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-pink-50/40 border border-indigo-200/80 space-y-3 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900">AI 视觉导演</span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-mono font-bold">
                        已挂载 {selectedSingleImages.length + (hasSelectedVideo ? collectedVideoList.length : 0)} 项素材
                      </span>
                    </div>

                    {canSend ? (
                      <div className="flex items-center gap-2 overflow-x-auto py-0.5 custom-scrollbar">
                        {hasSelectedVideo && collectedVideoList.map((videoUrl, videoIndex) => (
                          <div key={videoUrl} className="relative group/mini w-12 h-12 rounded-xl overflow-hidden border border-rose-300 flex-shrink-0 bg-slate-900 shadow-2xs">
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
                              title={`取消挂载全部视频（当前视频 ${videoIndex + 1}）`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
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
                        请先在上方勾选要发送的图片或原视频。
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={aiAssistantPrompt}
                        onChange={(e) => setAiAssistantPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter 发送；Ctrl/Cmd + Enter 也可发送（与富文本框保持一致）
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && canSend) {
                            e.preventDefault();
                            const hasVid = collectedVideoList.length > 0;
                            handleImportToAIAssistant(
                              singleCollectedResult,
                              aiAssistantPrompt,
                              selectedSingleImages,
                              selectedVideo && hasVid
                            );
                          }
                        }}
                        placeholder={`输入对【${singleCollectedResult.title || '当前商品'}】的创作需求...`}
                        className="min-w-0 flex-1 pl-3.5 pr-3.5 py-2.5 rounded-xl bg-white border border-indigo-200/90 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const hasVid = collectedVideoList.length > 0;
                          handleImportToAIAssistant(
                            singleCollectedResult,
                            aiAssistantPrompt,
                            selectedSingleImages,
                            selectedVideo && hasVid
                          );
                        }}
                        disabled={!canSend}
                        className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-indigo-600/20 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}

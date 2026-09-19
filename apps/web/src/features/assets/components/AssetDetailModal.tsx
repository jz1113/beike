import React, { type MouseEvent } from 'react';
import {
  X,
  Edit2,
  Tag,
  Image as ImageIcon,
  ZoomIn,
  Check,
  Copy,
  Sparkles,
  FileCode,
} from 'lucide-react';
import {
  type AssetSubTab,
  humanizeShotType,
  humanizeImageType,
  parseAssetDimensions,
  parsePersonaLayers,
} from '../utils/assetPromptConstants';
import { resolveActionCardDisplayBadges } from '@beike/domain/productCategory';

export interface AssetDetailModalProps {
  detailItem: any | null;
  activeSubTab: AssetSubTab;
  detailLoading: boolean;
  detailActiveImageIndex: number;
  copiedId: string | null;
  onClose: () => void;
  onSelectImageIndex: (index: number) => void;
  onZoomImage: (url: string) => void;
  onCopyPrompt: (text: string, id: string, e: MouseEvent) => void;
  onOpenTagEdit: (item: any) => void;
  onDeleteAsset: (id: string, e: MouseEvent) => void;
  onApplyToWorkshop: (item: any) => void;
  getAssetPreviewText: (item: any) => string;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({
  detailItem,
  activeSubTab,
  detailLoading,
  detailActiveImageIndex,
  copiedId,
  onClose,
  onSelectImageIndex,
  onZoomImage,
  onCopyPrompt,
  onOpenTagEdit,
  onDeleteAsset,
  onApplyToWorkshop,
  getAssetPreviewText,
}) => {
  if (!detailItem) return null;

  let sourceImagesList: string[] = [];
  if (typeof detailItem.sourceImages === 'string') {
    try {
      const arr = JSON.parse(detailItem.sourceImages);
      if (Array.isArray(arr)) sourceImagesList = arr;
    } catch {}
  }
  const currentCover = (detailItem.coverUrl || detailItem.avatarUrl) as string | undefined;
  const hasVisualContent = currentCover || sourceImagesList.length > 0;
  const activeSrc = sourceImagesList[detailActiveImageIndex] || currentCover || sourceImagesList[0];
  const sourceIdx = typeof detailItem.sourceImageIndex === 'number' ? detailItem.sourceImageIndex : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl sm:max-w-3xl bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <span className="text-slate-900 font-bold text-sm">
              {activeSubTab === 'full_prompt'
                ? '完整反推提示词母本详情'
                : activeSubTab === 'scene'
                ? '场景空间资产详情'
                : activeSubTab === 'action'
                ? '动作机位资产详情'
                : activeSubTab === 'outfit'
                ? '显白穿搭资产详情'
                : '人设博主资产详情'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 cursor-pointer transition-colors"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容滚动区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-700">
          {/* 资产标题与属性标签 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${
                  activeSubTab === 'full_prompt'
                    ? 'bg-indigo-50 text-indigo-800 border-indigo-300/80'
                    : activeSubTab === 'persona'
                    ? 'bg-amber-50 text-amber-800 border-amber-300/80'
                    : activeSubTab === 'scene'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300/80'
                    : activeSubTab === 'action'
                    ? 'bg-purple-50 text-purple-800 border-purple-300/80'
                    : activeSubTab === 'outfit'
                    ? 'bg-sky-50 text-sky-800 border-sky-300/80'
                    : 'bg-slate-50 text-slate-800 border-slate-300/80'
                }`}
              >
                {detailItem.code
                  ? `#${detailItem.code.replace(/^#/, '')}`
                  : activeSubTab === 'full_prompt'
                  ? '#R-01'
                  : activeSubTab === 'persona'
                  ? '#P-01'
                  : activeSubTab === 'scene'
                  ? '#S-01'
                  : activeSubTab === 'action'
                  ? '#A-01'
                  : '#O-01'}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {detailItem.title || detailItem.name}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              {detailItem.albumName && (
                <span className="px-2.5 py-0.5 bg-indigo-50/80 text-indigo-700 font-semibold rounded-md border border-indigo-100">
                  所属图集: {String(detailItem.albumName)}
                </span>
              )}
              {activeSubTab === 'action' ? (
                (() => {
                  const badges = resolveActionCardDisplayBadges(detailItem as any);
                  return badges.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpenTagEdit({ ...detailItem })}
                      className={`px-2.5 py-0.5 rounded-md font-semibold border flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-purple-400/60 hover:scale-105 transition-all shadow-2xs ${b.colorClass}`}
                      title="点击修改此标签分类"
                    >
                      <span>{b.label}</span>
                      <Edit2 className="w-2.5 h-2.5 opacity-60" />
                    </button>
                  ));
                })()
              ) : (
                <>
                  {detailItem.category && (
                    <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded-md">
                      类别: {detailItem.category}
                    </span>
                  )}
                  {detailItem.shotType && (
                    <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded-md border border-rose-200/60">
                      景别: {humanizeShotType(detailItem.shotType)}
                    </span>
                  )}
                </>
              )}
              {detailItem.imageType && (
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-semibold rounded-md border border-indigo-200/60">
                  {humanizeImageType(detailItem.imageType)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenTagEdit({ ...detailItem })}
                className="px-2.5 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-md border border-purple-200 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="修改此资产的标签分类"
              >
                <Tag className="w-3 h-3 text-purple-600" />
                <span>修改标签</span>
              </button>
            </div>
          </div>

          {/* 📷 来源参考原图与视觉核对 */}
          {hasVisualContent && (
            <div className="p-3.5 sm:p-4 bg-slate-50/90 border border-slate-200/90 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>来源参考原图与视觉核对</span>
                  {sourceIdx !== null && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-semibold border border-indigo-200">
                      原图 #{sourceIdx}
                    </span>
                  )}
                  {sourceImagesList.length > 1 && (
                    <span className="text-slate-400 text-[11px] font-normal hidden sm:inline">
                      (所属图集共 {sourceImagesList.length} 张)
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white text-slate-600 border border-slate-200/80 shadow-2xs">
                  ✨ 视觉多模态提纯
                </span>
              </div>

              <div className="flex gap-3.5 items-start">
                {/* 大图预览 */}
                {activeSrc && (
                  <div
                    onClick={() => onZoomImage(activeSrc)}
                    className="group/detailImg relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden shrink-0 border border-slate-200 bg-slate-100 shadow-xs cursor-zoom-in transition-all hover:shadow-md hover:border-indigo-400"
                    title="点击放大查看原图"
                  >
                    <img
                      src={activeSrc}
                      alt="来源参考原图"
                      className="w-full h-full object-cover group-hover/detailImg:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/detailImg:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                      <span className="text-white text-[10px] font-bold px-2 py-1 bg-black/60 rounded-lg backdrop-blur-md flex items-center gap-1 shadow-lg">
                        <ZoomIn className="w-3 h-3" /> 点击放大
                      </span>
                    </div>
                    {sourceIdx !== null && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-black/65 text-white backdrop-blur-xs">
                        #{detailActiveImageIndex !== 0 ? detailActiveImageIndex + 1 : sourceIdx}
                      </span>
                    )}
                  </div>
                )}

                {/* 右侧：图集胶卷缩略条与简明说明 */}
                <div className="flex-1 min-w-0 space-y-2">
                  {sourceImagesList.length > 1 && (
                    <div className="space-y-1.5">
                      <span className="text-slate-500 text-[10px] font-medium block">
                        图集切换核对 (点击切换左侧原图)：
                      </span>
                      <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full">
                        {sourceImagesList.map((imgUrl, i) => {
                          const isCurrent =
                            i === detailActiveImageIndex ||
                            (sourceIdx === i + 1 && detailActiveImageIndex === 0);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => onSelectImageIndex(i)}
                              className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                                isCurrent
                                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs scale-105'
                                  : 'border-transparent opacity-65 hover:opacity-100 hover:border-slate-300'
                              }`}
                              title={`切换至图 #${i + 1}`}
                            >
                              <img
                                src={imgUrl}
                                alt={`图 #${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <span
                                className={`absolute bottom-0 right-0 px-1 text-[8px] font-mono font-bold rounded-tl ${
                                  isCurrent ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white'
                                }`}
                              >
                                #{i + 1}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-2 bg-white rounded-xl border border-slate-200/80 text-slate-500 leading-relaxed text-[11px]">
                    <p>
                      {activeSubTab === 'full_prompt'
                        ? '视觉模型深度解析生成的完整生图母本，可直接用于一键生图或拆解重组。'
                        : '已剔除具体服装与杂乱背景，提纯为通用物理母本，可直接作为原子资产装配入工坊流水线。'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 核心描述与原子属性 */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
            {activeSubTab === 'full_prompt' ? (
              <div className="space-y-3.5">
                {/* 完整中文生图提示词 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 block text-xs">完整中文生图提示词：</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        {detailLoading
                          ? '加载中…'
                          : `${String(detailItem.reversePromptZh || detailItem.reversePrompt || '').length} 字`}
                      </span>
                      <button
                        type="button"
                        onClick={(e) =>
                          onCopyPrompt(
                            String(detailItem.reversePromptZh || detailItem.reversePrompt || ''),
                            detailItem.id,
                            e
                          )
                        }
                        className="px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === detailItem.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-indigo-200/80 rounded-xl leading-relaxed text-slate-800 text-xs select-text whitespace-pre-wrap font-mono min-h-[4rem]">
                    {detailLoading ? (
                      <div className="space-y-2 animate-pulse">
                        <div className="h-3 bg-slate-100 rounded w-full" />
                        <div className="h-3 bg-slate-100 rounded w-5/6" />
                        <div className="h-3 bg-slate-100 rounded w-4/6" />
                      </div>
                    ) : (
                      String(detailItem.reversePromptZh || detailItem.reversePrompt || '暂无完整中文提示词')
                    )}
                  </div>
                </div>

                {/* 九维视觉分析 */}
                {(() => {
                  const dimEntries = parseAssetDimensions(detailItem.dimensions);
                  if (dimEntries.length === 0) return null;
                  return (
                    <div className="space-y-2 pt-2 border-t border-slate-200/70">
                      <span className="font-bold text-slate-800 block text-xs">九维视觉分析：</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                        {dimEntries.map((dim) => (
                          <div
                            key={dim.key}
                            className="p-2.5 bg-white border border-slate-200/80 rounded-xl"
                          >
                            <span className="font-bold text-slate-700 block mb-0.5 text-[10px]">
                              {dim.label}
                            </span>
                            <span className="text-slate-600 text-[11px] leading-relaxed">{dim.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* 四维拆解结构 */}
                {(detailItem.sceneSummary ||
                  detailItem.outfitSummary ||
                  detailItem.actionSummary ||
                  detailItem.personaSummary) && (
                  <div className="space-y-2 pt-2 border-t border-slate-200/70">
                    <span className="font-bold text-slate-800 block text-xs">四维原子结构拆解：</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {detailItem.sceneSummary && (
                        <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                          <span className="font-bold text-emerald-900 block mb-0.5">🏞️ 场景空间：</span>
                          <span className="text-slate-700 text-[11px]">{String(detailItem.sceneSummary)}</span>
                        </div>
                      )}
                      {detailItem.outfitSummary && (
                        <div className="p-2.5 bg-sky-50/60 border border-sky-200/80 rounded-xl">
                          <span className="font-bold text-sky-900 block mb-0.5">👗 服装穿搭：</span>
                          <span className="text-slate-700 text-[11px]">{String(detailItem.outfitSummary)}</span>
                        </div>
                      )}
                      {detailItem.actionSummary && (
                        <div className="p-2.5 bg-purple-50/60 border border-purple-200/80 rounded-xl">
                          <span className="font-bold text-purple-900 block mb-0.5">🏃 抓拍动作：</span>
                          <span className="text-slate-700 text-[11px]">{String(detailItem.actionSummary)}</span>
                        </div>
                      )}
                      {detailItem.personaSummary && (
                        <div className="p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                          <span className="font-bold text-amber-900 block mb-0.5">👤 模特博主：</span>
                          <span className="text-slate-700 text-[11px]">{String(detailItem.personaSummary)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {activeSubTab === 'action' && (
                  <div className="space-y-2.5">
                    {detailItem.action && (
                      <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-1">
                        <span className="font-bold text-purple-900 block text-[11px] flex items-center gap-1.5">
                          <span>🏃</span> 肢体动作与抓拍姿态
                        </span>
                        <p className="text-slate-800 text-xs leading-relaxed font-sans select-text">
                          {String(detailItem.action)}
                        </p>
                      </div>
                    )}
                    {detailItem.camera && (
                      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                        <span className="font-bold text-slate-800 block text-[11px] flex items-center gap-1.5">
                          <span>📷</span> 摄影机位与镜头视角
                        </span>
                        <p className="text-slate-700 text-xs leading-relaxed font-sans select-text">
                          {String(detailItem.camera)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeSubTab === 'scene' && (
                  <div className="space-y-2.5">
                    {detailItem.description && (
                      <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1">
                        <span className="font-bold text-emerald-900 block text-[11px] flex items-center gap-1.5">
                          <span>🏞️</span> 空间硬装与场景材质
                        </span>
                        <p className="text-slate-800 text-xs leading-relaxed font-sans select-text">
                          {String(detailItem.description)}
                        </p>
                      </div>
                    )}
                    {detailItem.lighting && (
                      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
                        <span className="font-bold text-amber-900 block text-[11px] flex items-center gap-1.5">
                          <span>☀️</span> 采光系统与物理阴影
                        </span>
                        <p className="text-slate-800 text-xs leading-relaxed font-sans select-text">
                          {String(detailItem.lighting)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeSubTab === 'outfit' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 bg-sky-50/70 border border-sky-200/80 rounded-xl space-y-0.5">
                        <span className="font-bold text-sky-900 block text-[11px]">上装款式</span>
                        <p className="text-slate-800 text-xs leading-relaxed">{String(detailItem.top || '基础剪裁')}</p>
                      </div>
                      <div className="p-3 bg-sky-50/70 border border-sky-200/80 rounded-xl space-y-0.5">
                        <span className="font-bold text-sky-900 block text-[11px]">下装版型</span>
                        <p className="text-slate-800 text-xs leading-relaxed">{String(detailItem.bottom || '自然垂坠')}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {detailItem.shoes && (
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
                          <span className="font-bold text-slate-800 block text-[11px]">鞋履配饰</span>
                          <p className="text-slate-700 text-xs leading-relaxed">{String(detailItem.shoes)}</p>
                        </div>
                      )}
                      {detailItem.colorPalette && (
                        <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl space-y-0.5">
                          <span className="font-bold text-indigo-900 block text-[11px]">显白配色</span>
                          <p className="text-indigo-950 font-medium text-xs leading-relaxed">{String(detailItem.colorPalette)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeSubTab === 'persona' && (
                  <div className="space-y-2">
                    <span className="font-bold text-amber-900 block text-xs">模特博主 5 层原子属性结构：</span>
                    {(() => {
                      const layers = parsePersonaLayers(detailItem.description as string);
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 bg-white border border-amber-200/80 rounded-xl">
                            <span className="font-bold text-amber-800">发型与长短：</span>
                            <span className="text-slate-700 ml-1">{layers.hairStyle}</span>
                          </div>
                          <div className="p-2.5 bg-white border border-orange-200/80 rounded-xl">
                            <span className="font-bold text-orange-800">原生发色：</span>
                            <span className="text-slate-700 ml-1">{layers.hairColor}</span>
                          </div>
                          <div className="p-2.5 bg-white border border-amber-200/80 rounded-xl">
                            <span className="font-bold text-amber-900">脸型与五官：</span>
                            <span className="text-slate-700 ml-1">{layers.faceFeatures}</span>
                          </div>
                          <div className="p-2.5 bg-white border border-emerald-200/80 rounded-xl">
                            <span className="font-bold text-emerald-800">肤质与肌理：</span>
                            <span className="text-slate-700 ml-1">{layers.skinTexture}</span>
                          </div>
                          <div className="p-2.5 bg-white border border-rose-200/80 rounded-xl sm:col-span-2">
                            <span className="font-bold text-rose-800">神态与表情：</span>
                            <span className="text-slate-700 ml-1">{layers.expression}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 统一清晰的生图装配提示词卡片 */}
                <div className="p-3.5 bg-white border border-slate-200/90 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                      装配生图提示词 (Prompt)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        {getAssetPreviewText(detailItem).length} 字
                      </span>
                      <button
                        type="button"
                        onClick={(e) =>
                          onCopyPrompt(getAssetPreviewText(detailItem), detailItem.id, e)
                        }
                        className="px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === detailItem.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-700 leading-relaxed font-mono text-xs select-text whitespace-pre-wrap bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                    {getAssetPreviewText(detailItem)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={(e) => onDeleteAsset(detailItem.id, e)}
            className="text-rose-600 hover:text-rose-700 text-xs font-bold cursor-pointer transition-colors"
          >
            <span>删除此资产</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={(e) =>
                onCopyPrompt(getAssetPreviewText(detailItem), detailItem.id, e)
              }
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs cursor-pointer shadow-2xs transition-colors flex items-center gap-1.5"
            >
              {copiedId === detailItem.id ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>复制 Prompt</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onApplyToWorkshop(detailItem);
                onClose();
              }}
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl text-xs shadow-sm cursor-pointer transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>应用到工坊</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default AssetDetailModal;

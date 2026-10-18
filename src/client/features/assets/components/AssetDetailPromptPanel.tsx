import { Check, Copy, FileCode } from 'lucide-react';
import { parseAssetDimensions, parsePersonaLayers } from '../model/assetPromptConstants';
import type { AssetDetailModalProps } from './assetDetailTypes';

type Props = Pick<AssetDetailModalProps,
  'detailItem' | 'activeSubTab' | 'detailLoading' | 'copiedId' | 'onCopyPrompt' | 'getAssetPreviewText'
>;

export function AssetDetailPromptPanel({
  detailItem, activeSubTab, detailLoading, copiedId, onCopyPrompt, getAssetPreviewText,
}: Props) {
  return (
    <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3 dark:bg-white/5 dark:border-white/10">
      {activeSubTab === 'full_prompt' ? (
        <div className="space-y-3.5">
          {/* 完整中文生图提示词 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-900 block text-xs">图组生成母本：</span>
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
            <div className="p-3 bg-white dark:bg-white/5 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl leading-relaxed text-slate-800 dark:text-slate-200 text-xs select-text whitespace-pre-wrap font-mono min-h-[4rem]">
              {detailLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-slate-100 dark:bg-white/10 rounded w-full" />
                  <div className="h-3 bg-slate-100 dark:bg-white/10 rounded w-5/6" />
                  <div className="h-3 bg-slate-100 dark:bg-white/10 rounded w-4/6" />
                </div>
              ) : (
                String(detailItem.reversePromptZh || detailItem.reversePrompt || '暂无完整中文提示词')
              )}
            </div>
          </div>

          {(detailItem.contentSummary || detailItem.architectureSummary || detailItem.replaceableSlots) && (
            <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-white/10">
              <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">图组规则：</span>
              {detailItem.contentSummary && <div className="p-2.5 bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-xl"><b>整条内容：</b>{String(detailItem.contentSummary)}</div>}
              {detailItem.architectureSummary && <div className="p-2.5 bg-violet-50/60 dark:bg-violet-950/40 border border-violet-200/80 dark:border-violet-800/60 text-slate-800 dark:text-slate-200 rounded-xl whitespace-pre-wrap"><b>固定架构（不替换）：</b>{String(detailItem.architectureSummary)}</div>}
              {detailItem.replaceableSlots && <div className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-slate-800 dark:text-slate-200 rounded-xl"><b>可替换：</b>人物、穿搭、场景仅按整组替换；单图动作、机位、构图和场景连续性固定。</div>}
            </div>
          )}

          {/* 九维视觉分析 */}
          {(() => {
            const dimEntries = parseAssetDimensions(detailItem.dimensions);
            if (dimEntries.length === 0) return null;
            return (
              <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-white/10">
                <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">九维视觉分析：</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {dimEntries.map((dim) => (
                    <div
                      key={dim.key}
                      className="p-2.5 bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-xl"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5 text-[10px]">
                        {dim.label}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">{dim.value}</span>
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
            <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-white/10">
              <span className="font-bold text-slate-800 block text-xs dark:text-slate-100">四维原子结构拆解：</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {detailItem.sceneSummary && (
                  <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                    <span className="font-bold text-emerald-900 block mb-0.5">🏞️ 场景空间：</span>
                    <span className="text-slate-700 text-[11px] dark:text-slate-200">{String(detailItem.sceneSummary)}</span>
                  </div>
                )}
                {detailItem.outfitSummary && (
                  <div className="p-2.5 bg-sky-50/60 border border-sky-200/80 rounded-xl">
                    <span className="font-bold text-sky-900 block mb-0.5">👗 服装穿搭：</span>
                    <span className="text-slate-700 text-[11px] dark:text-slate-200">{String(detailItem.outfitSummary)}</span>
                  </div>
                )}
                {detailItem.actionSummary && (
                  <div className="p-2.5 bg-purple-50/60 border border-purple-200/80 rounded-xl">
                    <span className="font-bold text-purple-900 block mb-0.5">🏃 抓拍动作：</span>
                    <span className="text-slate-700 text-[11px] dark:text-slate-200">{String(detailItem.actionSummary)}</span>
                  </div>
                )}
                {detailItem.personaSummary && (
                  <div className="p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                    <span className="font-bold text-amber-900 block mb-0.5">👤 模特博主：</span>
                    <span className="text-slate-700 text-[11px] dark:text-slate-200">{String(detailItem.personaSummary)}</span>
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
                  <p className="text-slate-800 text-xs leading-relaxed font-sans select-text dark:text-slate-100">
                    {String(detailItem.action)}
                  </p>
                </div>
              )}
              {detailItem.camera && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1 dark:bg-white/5 dark:border-white/10">
                  <span className="font-bold text-slate-800 block text-[11px] flex items-center gap-1.5 dark:text-slate-100">
                    <span>📷</span> 摄影机位与镜头视角
                  </span>
                  <p className="text-slate-700 text-xs leading-relaxed font-sans select-text dark:text-slate-200">
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
                  <p className="text-slate-800 text-xs leading-relaxed font-sans select-text dark:text-slate-100">
                    {String(detailItem.description)}
                  </p>
                </div>
              )}
              {detailItem.lighting && (
                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
                  <span className="font-bold text-amber-900 block text-[11px] flex items-center gap-1.5">
                    <span>☀️</span> 采光系统与物理阴影
                  </span>
                  <p className="text-slate-800 text-xs leading-relaxed font-sans select-text dark:text-slate-100">
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
                  <p className="text-slate-800 text-xs leading-relaxed dark:text-slate-100">{String(detailItem.top || '基础剪裁')}</p>
                </div>
                <div className="p-3 bg-sky-50/70 border border-sky-200/80 rounded-xl space-y-0.5">
                  <span className="font-bold text-sky-900 block text-[11px]">下装版型</span>
                  <p className="text-slate-800 text-xs leading-relaxed dark:text-slate-100">{String(detailItem.bottom || '自然垂坠')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {detailItem.shoes && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5 dark:bg-white/5 dark:border-white/10">
                    <span className="font-bold text-slate-800 block text-[11px] dark:text-slate-100">鞋履配饰</span>
                    <p className="text-slate-700 text-xs leading-relaxed dark:text-slate-200">{String(detailItem.shoes)}</p>
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
              <span className="font-bold text-amber-900 dark:text-amber-400 block text-xs">模特博主 5 层原子属性结构：</span>
              {(() => {
                const layers = parsePersonaLayers(detailItem.description as string);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-white dark:bg-white/5 border border-amber-200/80 dark:border-amber-800/60 rounded-xl">
                      <span className="font-bold text-amber-800 dark:text-amber-300">发型与长短：</span>
                      <span className="text-slate-700 dark:text-slate-300 ml-1">{layers.hairStyle}</span>
                    </div>
                    <div className="p-2.5 bg-white dark:bg-white/5 border border-orange-200/80 dark:border-orange-800/60 rounded-xl">
                      <span className="font-bold text-orange-800 dark:text-orange-300">原生发色：</span>
                      <span className="text-slate-700 dark:text-slate-300 ml-1">{layers.hairColor}</span>
                    </div>
                    <div className="p-2.5 bg-white dark:bg-white/5 border border-amber-200/80 dark:border-amber-800/60 rounded-xl">
                      <span className="font-bold text-amber-900 dark:text-amber-300">脸型与五官：</span>
                      <span className="text-slate-700 dark:text-slate-300 ml-1">{layers.faceFeatures}</span>
                    </div>
                    <div className="p-2.5 bg-white dark:bg-white/5 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl">
                      <span className="font-bold text-emerald-800 dark:text-emerald-300">肤质与肌理：</span>
                      <span className="text-slate-700 dark:text-slate-300 ml-1">{layers.skinTexture}</span>
                    </div>
                    <div className="p-2.5 bg-white dark:bg-white/5 border border-rose-200/80 dark:border-rose-800/60 rounded-xl sm:col-span-2">
                      <span className="font-bold text-rose-800 dark:text-rose-300">神态与表情：</span>
                      <span className="text-slate-700 dark:text-slate-300 ml-1">{layers.expression}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 统一清晰的生图装配提示词卡片 */}
          <div className="p-3.5 bg-white dark:bg-white/5 border border-slate-200/90 dark:border-white/10 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-white text-xs flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                装配生图提示词 (Prompt)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {getAssetPreviewText(detailItem).length} 字
                </span>
                <button
                  type="button"
                  onClick={(e) =>
                    onCopyPrompt(getAssetPreviewText(detailItem), detailItem.id, e)
                  }
                  className="px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === detailItem.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">已复制</span>
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
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-mono text-xs select-text whitespace-pre-wrap bg-slate-50/80 dark:bg-white/5 p-2.5 rounded-lg border border-slate-100 dark:border-white/10">
              {getAssetPreviewText(detailItem)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
